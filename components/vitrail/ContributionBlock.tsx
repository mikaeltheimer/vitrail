"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { INTL_TAG, type Locale } from "@/i18n/config";
import { useMoney } from "@/lib/useI18n";
import {
  DEFAULT_CONTRIBUTION_SETTINGS,
  estimateStripeFee,
  menuContribution,
  menuRatesFor,
  suggestedContribution,
  type ContributionBracket,
  type StripeFeeEstimate,
} from "@/lib/contribution";

// Contribution facultative à Donivers (spécification du 16 novembre 2026, section 2 ; piste 2 « liste déroulante »,
// choisie par Mika). Le serveur recalcule tout à la création du paiement : ce bloc ne fait qu'afficher.

export interface ContributionConfig {
  version: string;
  brackets: ContributionBracket[];
  menuRates: number[];
  stripeFeeEstimate: StripeFeeEstimate;
  /** Commission qui s'appliquerait à ce don (0 si aucune) : pour dire si la contribution couvre TOUT. */
  commissionRate: number;
  /** L'organisme a un numéro d'organisme de bienfaisance. */
  charity: boolean;
}

const FALLBACK: ContributionConfig = {
  version: DEFAULT_CONTRIBUTION_SETTINGS.version,
  brackets: DEFAULT_CONTRIBUTION_SETTINGS.brackets,
  menuRates: DEFAULT_CONTRIBUTION_SETTINGS.menuRates,
  stripeFeeEstimate: DEFAULT_CONTRIBUTION_SETTINGS.stripeFeeEstimate,
  commissionRate: 0,
  charity: false,
};

/** Configuration du bloc pour l'organisme de la page ; celle par défaut tant qu'elle n'est pas arrivée (ou si la requête échoue). */
export function useContributionConfig(): ContributionConfig {
  const [config, setConfig] = useState<ContributionConfig>(FALLBACK);
  useEffect(() => {
    let alive = true;
    fetch("/api/contribution")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (alive && c && Array.isArray(c.brackets)) setConfig({ ...FALLBACK, ...c });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return config;
}

/**
 * Le choix du donateur : la suggestion (par défaut), un pourcentage du menu ou un autre montant (vide = rien).
 * « none » n'est plus au menu (Mika, 17 nov. : on passe par « Autre montant », qui part de 0, comme Zeffy) ;
 * il reste lu pour un brouillon enregistré avant ce changement.
 */
export type ContributionChoice = "suggested" | "other" | "none" | `rate:${number}`;

/** Contribution en cents pour un choix ; « Autre montant » se lit en dollars (virgule ou point). */
export function contributionFor(
  choice: ContributionChoice,
  otherText: string,
  donCents: number,
  config: ContributionConfig,
): { cents: number; error: "tooHigh" | null } {
  if (donCents <= 0) return { cents: 0, error: null };
  if (choice === "none") return { cents: 0, error: null };
  if (choice === "suggested") return { cents: suggestedContribution(donCents, config.brackets), error: null };
  if (choice === "other") {
    const v = parseFloat(otherText.replace(",", ".").replace(/[^\d.]/g, ""));
    const cents = Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
    return cents > donCents ? { cents: 0, error: "tooHigh" } : { cents, error: null };
  }
  const rate = Number(choice.slice(5));
  return { cents: Number.isFinite(rate) ? menuContribution(donCents, rate) : 0, error: null };
}

export default function ContributionBlock({
  donCents,
  orgName,
  config,
  choice,
  otherText,
  onChoice,
  onOtherText,
}: {
  donCents: number;
  orgName: string;
  config: ContributionConfig;
  choice: ContributionChoice;
  otherText: string;
  onChoice: (c: ContributionChoice) => void;
  onOtherText: (s: string) => void;
}) {
  const t = useTranslations("contribution");
  const locale = useLocale() as Locale;
  const money = useMoney();
  const ids = useId();
  const [why, setWhy] = useState(false);
  const percent = new Intl.NumberFormat(INTL_TAG[locale], { style: "percent", maximumFractionDigits: 1 });

  const suggested = suggestedContribution(donCents, config.brackets);
  const rates = menuRatesFor(donCents, { ...DEFAULT_CONTRIBUTION_SETTINGS, brackets: config.brackets, menuRates: config.menuRates });
  // Un pourcentage choisi qui n'est plus au menu (le don a changé) : on revient à la suggestion
  const shown: ContributionChoice =
    choice === "none" ? "other" : choice.startsWith("rate:") && !rates.includes(Number(choice.slice(5))) ? "suggested" : choice;
  const { cents, error } = contributionFor(shown, otherText, donCents, config);

  // La ligne qui change avec le montant : tout est couvert (frais Stripe et commission), une partie, ou rien
  const fee = estimateStripeFee(donCents + cents, config.stripeFeeEstimate);
  const commission = Math.round(donCents * config.commissionRate);
  const line =
    cents <= 0
      ? t("sansContribution", { frais: money(estimateStripeFee(donCents, config.stripeFeeEstimate)) })
      : cents >= fee + commission
        ? t("couvreTout", { org: orgName, montant: money(donCents) })
        : t("couvrePartie");

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <label htmlFor={`${ids}-choix`} style={{ fontSize: "17px", fontWeight: 600, color: "#F4EFE6" }}>
        {t("titre", { org: orgName })}
      </label>
      <select
        id={`${ids}-choix`}
        value={shown}
        onChange={(e) => onChoice(e.target.value as ContributionChoice)}
        style={selectStyle}
      >
        <option value="suggested">{t("suggere", { montant: money(suggested) })}</option>
        {rates.map((r) => (
          <option key={r} value={`rate:${r}`}>
            {t("pourcent", { taux: percent.format(r), montant: money(menuContribution(donCents, r)) })}
          </option>
        ))}
        <option value="other">{t("autre")}</option>
      </select>
      {shown === "other" && (
        <label style={{ display: "grid", gap: "6px", fontSize: "16px", color: "rgba(255,255,255,0.82)" }}>
          {t("autreLabel")}
          <input
            type="text"
            inputMode="decimal"
            value={otherText}
            placeholder={t("autrePlaceholder")}
            onChange={(e) => onOtherText(e.target.value)}
            style={inputStyle}
            aria-invalid={error ? true : undefined}
          />
        </label>
      )}
      {error === "tooHigh" ? (
        <p role="alert" style={{ ...hintStyle, color: "#f87171" }}>
          {t("tropHaute")}
        </p>
      ) : (
        <p style={hintStyle} aria-live="polite">
          {line}
        </p>
      )}
      <p style={{ ...hintStyle, lineHeight: 1.5 }}>
        {/* Vrai pour tout organisme (Mika, 16 nov.) : ce sont les contributions qui permettent un modèle où Donivers
            ne coûte plus rien aux organismes après 495 $ */}
        {t("texte", { org: orgName })}{" "}
        <button type="button" onClick={() => setWhy((w) => !w)} aria-expanded={why} style={linkButton}>
          {why ? t("masquer") : t("enSavoirPlus")}
        </button>
      </p>
      {why && (
        <div style={whyStyle}>
          <p style={{ margin: 0, fontWeight: 700, color: "#F4EFE6" }}>{t("pqTitre")}</p>
          <p style={whyText}>{t("pqIntro", { org: orgName })}</p>
          {(
            [
              ["pqOuTitre", "pqOu"],
              ["pqRecoitTitre", "pqRecoit"],
              ["pqFacultatifTitre", "pqFacultatif"],
              ["pqSavoirTitre", "pqSavoir"],
            ] as const
          ).map(([titre, texte]) => (
            <div key={titre} style={{ display: "grid", gap: "2px" }}>
              <p style={{ margin: 0, fontWeight: 600, color: "#F4EFE6" }}>{t(titre, { org: orgName })}</p>
              <p style={whyText}>{t(texte)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/** Récapitulatif (section 2.2 de la spécification), sous l'encadré de la contribution : seulement s'il y a une contribution. */
export function ContributionRecap({ donCents, cents, orgName, charity }: { donCents: number; cents: number; orgName: string; charity: boolean }) {
  const t = useTranslations("contribution");
  const money = useMoney();
  if (cents <= 0) return null;
  return (
    <dl style={recapStyle}>
      <dt style={{ margin: 0 }}>
        {t("recapDon", { org: orgName })}
        {charity && <span style={noteStyle}>{t("recapRecu")}</span>}
      </dt>
      <dd style={amountStyle}>{money(donCents)}</dd>
      <dt style={{ margin: 0 }}>
        {t("recapContribution")}
        <span style={noteStyle}>{t("recapContributionNote")}</span>
      </dt>
      <dd style={amountStyle}>{money(cents)}</dd>
      <dt style={{ margin: 0, paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.12)", fontWeight: 700 }}>{t("recapTotal")}</dt>
      <dd style={{ ...amountStyle, paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.12)", fontWeight: 700 }}>{money(donCents + cents)}</dd>
    </dl>
  );
}

const hintStyle: CSSProperties = { margin: 0, fontSize: "16px", color: "rgba(255,255,255,0.82)" };
const selectStyle: CSSProperties = {
  font: "500 16px 'DM Sans', sans-serif",
  color: "#F4EFE6",
  background: "#0B0A12",
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: "8px",
  padding: "12px",
  minHeight: "48px",
};
const inputStyle: CSSProperties = { ...selectStyle, fontSize: "18px" };
const linkButton: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  color: "#F0B24A",
  textDecoration: "underline",
  cursor: "pointer",
};
const whyStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  padding: "12px 14px",
  borderRadius: "10px",
  background: "rgba(255,255,255,0.04)",
  fontSize: "15px",
};
const whyText: CSSProperties = { margin: 0, lineHeight: 1.5, color: "rgba(255,255,255,0.82)" };
const recapStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: "8px 12px",
  margin: 0,
  padding: "4px 2px",
  fontSize: "16px",
  color: "#F4EFE6",
};
const noteStyle: CSSProperties = { display: "block", fontSize: "14px", color: "rgba(255,255,255,0.7)" };
const amountStyle: CSSProperties = { margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" };

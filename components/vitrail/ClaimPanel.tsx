"use client";

// Panneau « Ajouter mon morceau »: tout se fait dans le vitrail.
// Montant (curseur + saisie), part du vitrail, rang, couleur du verre, nom, photo, message : chaque réglage
// s'affiche en direct sur le morceau d'aperçu. Puis paiement (Stripe ; le courriel est demandé là-bas).

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { INTL_TAG, type Locale } from "@/i18n/config";
import { useOrg } from "@/lib/useOrg";
import { useCount, useGlassName, useMoney, useOrdinal } from "@/lib/useI18n";
import { CONFIG, GLASS_COLORS } from "@/lib/config";
import { currentGlass } from "@/lib/theme";
import { feeFor } from "@/lib/fees";
import { PhotoError, squareJpeg, uploadPhoto } from "@/lib/photoClient";
import TestimonialField from "./TestimonialField";
import { AnotherQuestion, useQuestionPicker } from "./QuestionPicker";
import { OrgMark } from '@/components/OrgBrand';
import Editable from '@/components/atelier/Editable';

const GOLD = "#F0B24A";

export interface ClaimDraft {
  name: string | null;
  color: string;
  photoSrc: string | null;
  message: string | null;
  /** Le don, sans les frais couverts : c'est la taille du morceau (et ce qui compte dans le total). */
  amountCents: number;
  /** Cadrage : 'place' (la place dans le vitrail, quand le montant change) ou 'detail' (gros plan quand le contenu change). */
  focus: "place" | "detail";
}

interface Props {
  /** Montants des morceaux actuels (part du vitrail, rang, « plus grand que »). */
  amounts: number[];
  typicalCents: number | null;
  /** Mode démo (pas de clé Stripe) : aucun paiement, aucun courriel ; on le dit clairement. */
  demo?: boolean;
  isMobile: boolean;
  panelRef?: RefObject<HTMLDivElement | null>;
  /** 'overlay' : panneau posé sur le vitrail ; 'page' : la même chose en pleine page (formulaire mobile /don). */
  variant?: "overlay" | "page";
  /** Donateur reconnu par son lien (?t=…) : il agrandit son morceau, rien d'autre à remplir. */
  known?: KnownDonor | null;
  token?: string | null;
  /** Où revenir après Stripe : le vitrail, ou la page de remerciement du formulaire mobile. */
  returnTo?: "vitrail" | "don";
  /** Provenance par défaut (sinon celle de la session). */
  defaultChannel?: string;
  /**
   * Vitrail de démonstration : le panneau fonctionne en entier, mais rien ne part au serveur (photo gardée dans la page,
   * jamais téléversée) et le paiement est remplacé par une confirmation. Le morceau est remis à la page, qui le garde.
   */
  onDemoDonate?: (d: DemoDonation) => void;
  /** geometryChanged = la taille change (il faut recalculer le pavage) ; sinon simple mise à jour visuelle */
  onDraftChange: (draft: ClaimDraft, geometryChanged: boolean) => void;
  onClose?: () => void;
}

/** Don fictif du vitrail de démonstration : la photo est une data URL (elle doit survivre à un rechargement de l'onglet). */
export interface DemoDonation {
  amountCents: number;
  /** Ce que le donateur aurait payé (frais couverts compris) : c'est le montant du courriel de remerciement. */
  paidCents: number;
  name: string | null;
  message: string | null;
  /** La question à laquelle répond le témoignage. */
  question: string | null;
  photoSrc: string | null;
  color: string;
}

export interface KnownDonor {
  donorId: string;
  name: string;
  showName: boolean;
  color: string;
  totalCents: number;
}

/** Brouillon gardé le temps du passage chez Stripe : si le donateur revient sans payer, il retrouve tout. */
const DRAFT_KEY = "vitrail:claim";
interface SavedDraft {
  amount: number;
  coverFees: boolean;
  name: string;
  color: string;
  message: string;
  quoteConsent?: boolean;
  mailing?: boolean;
  photo: { src: string | null; path: string | null };
}
function readSaved(): SavedDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as SavedDraft) : null;
  } catch {
    return null;
  }
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const MIN = CONFIG.minAmountCents / 100;
const MAX = CONFIG.maxAmountCents / 100;

/** Curseur 0–1000 → montant en dollars, sur une échelle logarithmique du minimum au maximum. */
function sliderToAmount(v: number): number {
  const a = Math.exp(
    Math.log(MIN) + (v / 1000) * (Math.log(MAX) - Math.log(MIN)),
  );
  const step = a < 20 ? 1 : a < 200 ? 5 : a < 2000 ? 25 : 250;
  return Math.min(MAX, Math.max(MIN, Math.round(a / step) * step));
}
function amountToSlider(a: number): number {
  return Math.round(
    ((Math.log(Math.max(MIN, a)) - Math.log(MIN)) /
      (Math.log(MAX) - Math.log(MIN))) *
      1000,
  );
}
function formatShare(x: number, tag: string): string {
  const opts: Intl.NumberFormatOptions =
    x * 100 >= 1 ? { maximumFractionDigits: 1 } : { maximumSignificantDigits: 2 };
  return new Intl.NumberFormat(tag, { style: "percent", ...opts }).format(x);
}

export default function ClaimPanel({
  amounts,
  typicalCents,
  demo,
  isMobile,
  panelRef,
  onDraftChange,
  onClose,
  variant = "overlay",
  known = null,
  token = null,
  returnTo = "vitrail",
  defaultChannel = "vitrail",
  onDemoDonate,
}: Props) {
  const showcase = !!onDemoDonate;
  const t = useTranslations("claim");
  const tp = useTranslations("photo");
  const te = useTranslations("erreurs");
  const tc = useTranslations("commun");
  const org = useOrg();
  const money = useMoney();
  const count = useCount();
  const ordinal = useOrdinal();
  const glassName = useGlassName();
  const locale = useLocale() as Locale;
  const page = variant === "page";
  const agrandir = !!(known && token);
  const [saved] = useState(readSaved);
  const start = saved?.amount ?? (typicalCents ? typicalCents / 100 : 25);
  const [amount, setAmountState] = useState(start);
  const [amountText, setAmountText] = useState(String(start));
  const [coverFees, setCoverFees] = useState(saved?.coverFees ?? false);
  const [name, setName] = useState(saved?.name ?? "");
  const [color, setColor] = useState<string>(
    currentGlass(saved?.color) ?? GLASS_COLORS[0].value,
  );
  const [message, setMessage] = useState(saved?.message ?? "");
  const [quoteConsent, setQuoteConsent] = useState(
    saved?.quoteConsent ?? false,
  );
  // Une des questions de l'organisme, au hasard ; c'est elle qu'on enregistre avec le témoignage
  const picker = useQuestionPicker(org.testimonial.questions);
  // Liste d'envoi de l'organisme : jamais cochée d'avance (consentement exprès, loi anti-pourriel)
  const [mailing, setMailing] = useState(saved?.mailing ?? false);
  const [photo, setPhoto] = useState<{
    src: string | null;
    path: string | null;
  }>(saved?.photo ?? { src: null, path: null });
  const photoBlob = useRef<Blob | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Démonstration : l'étape de paiement, remplacée par une confirmation
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Couleur tirée au hasard à l'ouverture (le serveur ne peut pas faire le même tirage), sauf brouillon retrouvé
  useEffect(() => {
    if (saved) {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      return;
    }
    Promise.resolve().then(() =>
      setColor(
        GLASS_COLORS[Math.floor(Math.random() * GLASS_COLORS.length)].value,
      ),
    );
  }, [saved]);

  const baseCents = Math.round(amount * 100);
  const feeCents = feeFor(baseCents);
  const payCents = coverFees ? baseCents + feeCents : baseCents;
  const showName = name.trim().length >= 2;

  // ---------- Aperçu en direct dans le vitrail ----------
  const lastGeometry = useRef("");
  const focusRef = useRef<"place" | "detail">("place");
  const lastContent = useRef<string | null>(null);
  const lastAmount = useRef<number | null>(null);
  useEffect(() => {
    const contentKey = [
      name.trim(),
      color,
      photo.src ?? "",
      message.trim(),
    ].join("|");
    if (lastContent.current === null) lastContent.current = contentKey;
    else if (contentKey !== lastContent.current) {
      focusRef.current = "detail";
      lastContent.current = contentKey;
    }
    if (lastAmount.current !== null && baseCents !== lastAmount.current)
      focusRef.current = "place";
    lastAmount.current = baseCents;
    const draft: ClaimDraft = {
      name: showName ? name.trim() : null,
      color,
      photoSrc: photo.src,
      message: message.trim() || null,
      amountCents: baseCents,
      focus: focusRef.current,
    };
    const geometryKey = String(baseCents);
    const geometryChanged = geometryKey !== lastGeometry.current;
    // La taille change : on attend que le curseur se pose avant de recalculer le pavage
    const timer = setTimeout(
      () => {
        lastGeometry.current = geometryKey;
        onDraftChange(draft, geometryChanged);
      },
      geometryChanged ? 280 : 0,
    );
    return () => clearTimeout(timer);
  }, [name, showName, color, photo.src, message, baseCents, onDraftChange]);

  // ---------- Chiffres ----------
  // Avec un lien « agrandir », on compte ce que le donateur a déjà donné (amounts n'inclut pas son morceau)
  const mine = (agrandir ? known!.totalCents : 0) + baseCents;
  const total = amounts.reduce((s, a) => s + a, 0);
  const share = total + mine > 0 ? mine / (total + mine) : 0;
  const bigger = amounts.filter((a) => a < mine).length;
  const rank = amounts.filter((a) => a > mine).length + 1;

  const setAmount = (a: number) => {
    const clamped = Math.max(MIN, Math.min(MAX, Math.round(a)));
    setAmountState(clamped);
    setAmountText(String(clamped));
  };

  // ---------- Photo : recadrée en carré et envoyée tout de suite ----------
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setPhotoBusy(true);
    try {
      const blob = await squareJpeg(file);
      if (showcase) {
        // Démonstration : la photo reste dans la page (data URL, qui survit au rechargement), jamais envoyée
        photoBlob.current = null;
        setPhoto({ src: await blobToDataUrl(blob), path: null });
        return;
      }
      photoBlob.current = blob;
      const src = URL.createObjectURL(blob);
      setPhoto({ src, path: null });
      const path = await uploadPhoto(blob);
      setPhoto({ src, path });
    } catch (err) {
      setError(err instanceof PhotoError ? (err.serverMessage ?? tp(`erreurs.${err.key}`)) : tp("erreurs.envoi"));
      setPhoto({ src: null, path: null });
    } finally {
      setPhotoBusy(false);
    }
  };

  // ---------- Paiement ----------
  const valid =
    amount >= MIN &&
    amount <= MAX &&
    (!name.trim() || showName) &&
    !busy &&
    !photoBusy;
  const submit = async () => {
    if (!valid) return;
    if (showcase) {
      setError(null);
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    let channel: string | null = defaultChannel;
    try {
      channel = sessionStorage.getItem("vitrail:src") || defaultChannel;
    } catch {}
    try {
      const res = await fetch("/api/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents: baseCents,
          coverFees,
          mailingConsent: mailing,
          returnTo,
          channel,
          ...(agrandir
            ? { token }
            : {
                showName,
                name: showName ? name.trim() : "",
                message: message.trim(),
                quoteConsent: quoteConsent && !!message.trim(),
                question: message.trim() ? picker.question : null,
                color,
                photoPath: photo.path ?? undefined,
              }),
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : t("erreurInattendue"),
        );
      // Brouillon gardé pour un éventuel retour sans paiement (la photo en data URL : l'adresse blob: ne survit pas)
      try {
        const src =
          photo.src?.startsWith("blob:") && photoBlob.current
            ? await blobToDataUrl(photoBlob.current)
            : photo.src;
        const draft: SavedDraft = {
          amount,
          coverFees,
          name,
          color,
          message,
          quoteConsent,
          mailing,
          photo: { src, path: photo.path },
        };
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {}
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      ref={panelRef}
      style={
        page
          ? pageStyle
          : {
              // Ordinateur : ancré à droite (comme la fiche d'un morceau), le morceau est cadré à gauche.
              // Téléphone : en bas, sur la moitié de l'écran au plus, le morceau est cadré au-dessus.
              position: "fixed",
              zIndex: 160,
              left: isMobile ? 0 : "auto",
              right: isMobile ? 0 : "16px",
              top: isMobile ? "auto" : "72px",
              bottom: isMobile ? 0 : "auto",
              width: isMobile ? "auto" : "min(400px, calc(100% - 32px))",
              maxHeight: isMobile ? "50vh" : "calc(100vh - 72px - 16px)",
              alignContent: "start",
              overflowY: "auto",
              background: "rgba(20,18,29, 0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: isMobile ? "16px 16px 0 0" : "14px",
              padding: isMobile
                ? "16px 16px calc(16px + env(safe-area-inset-bottom, 0px))"
                : "18px 20px",
              boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
              backdropFilter: "blur(10px)",
              display: "grid",
              gap: "14px",
              color: "#F4EFE6",
              fontFamily: "'DM Sans', sans-serif",
            }
      }
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <h2 className="font-display" style={{ margin: 0, fontSize: "20px" }}>
          {confirming
            ? t("demoPaiement.titre")
            : agrandir
            ? known!.showName && known!.name
              ? t("agrandirNom", { nom: known!.name })
              : t("agrandir")
            : t("titre")}
        </h2>
        {onClose && (
          <button onClick={onClose} aria-label={tc("fermer")} style={closeStyle}>
            ×
          </button>
        )}
      </div>

      {confirming && onDemoDonate ? (
        <DemoCheckout
          payCents={payCents}
          name={showName ? name.trim() : null}
          color={color}
          onBack={() => setConfirming(false)}
          onConfirm={() =>
            onDemoDonate({
              amountCents: baseCents,
              paidCents: payCents,
              name: showName ? name.trim() : null,
              message: message.trim() || null,
              question: message.trim() ? picker.question : null,
              photoSrc: photo.src,
              color,
            })
          }
        />
      ) : (
      <>
      {agrandir && (
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "rgba(255,255,255,0.8)",
            lineHeight: 1.45,
          }}
        >
          {t.rich("dejaDonne", {
            montant: money(known!.totalCents),
            b: (chunks) => <b style={{ color: GOLD }}>{chunks}</b>,
          })}
        </p>
      )}

      {/* Où va le don */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          padding: "10px 12px",
          borderRadius: "8px",
          border: "1px solid rgba(240,178,74,0.3)",
          background: "rgba(240,178,74,0.06)",
        }}
      >
        <Editable field="icon">
          <OrgMark size={30} />
        </Editable>
        <span
          style={{
            fontSize: "13px",
            lineHeight: 1.45,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          {t.rich("destination", {
            org: org.name,
            b: (chunks) => <strong style={{ color: GOLD }}>{chunks}</strong>,
          })}{" "}
          <Editable field="why">{org.why}</Editable>
        </span>
      </div>

      {/* ---------- Montant ---------- */}
      <div style={{ display: "grid", gap: "6px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "12px",
          }}
        >
          <label htmlFor="claim-amount-input" style={labelStyle}>
            {t("montant")}
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "4px",
              color: GOLD,
            }}
          >
            {locale === "en" && (
              <span style={{ fontSize: "26px", fontWeight: 700 }}>$</span>
            )}
            <input
              id="claim-amount-input"
              inputMode="numeric"
              value={amountText}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, "");
                setAmountText(v);
                const n = parseInt(v, 10);
                if (n >= 1) setAmountState(Math.min(n, MAX));
              }}
              onBlur={() => setAmount(amount)}
              style={{
                width: `${Math.max(2, amountText.length) + 0.6}ch`,
                background: "transparent",
                border: 0,
                borderBottom: "1px dashed rgba(240,178,74,0.4)",
                color: GOLD,
                font: "700 26px 'DM Sans', sans-serif",
                textAlign: "right",
                padding: 0,
                fontVariantNumeric: "tabular-nums",
              }}
            />
            {locale === "fr" && (
              <span style={{ fontSize: "26px", fontWeight: 700 }}>$</span>
            )}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          value={amountToSlider(amount)}
          onChange={(e) => setAmount(sliderToAmount(+e.target.value))}
          aria-label={t("montant")}
          style={{ width: "100%", accentColor: GOLD }}
        />
        {amount < MIN && (
          <p style={{ ...hintStyle, color: "#f87171" }}>
            {te("montantMin", { montant: money(CONFIG.minAmountCents) })}
          </p>
        )}
        {typicalCents && (
          <p style={hintStyle}>
            {t("typique", { montant: money(typicalCents) })}
          </p>
        )}
        <label
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-start",
            fontSize: "13px",
            color: "rgba(255,255,255,0.75)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={coverFees}
            onChange={(e) => setCoverFees(e.target.checked)}
            style={{ accentColor: GOLD, marginTop: "2px" }}
          />
          <span>
            {t("frais", { frais: money(feeCents), montant: money(baseCents) })}
          </span>
        </label>
        <label
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-start",
            fontSize: "13px",
            color: "rgba(255,255,255,0.75)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={mailing}
            onChange={(e) => setMailing(e.target.checked)}
            style={{ accentColor: GOLD, marginTop: "2px" }}
          />
          <span>{t("listeEnvoi", { org: org.name })}</span>
        </label>
      </div>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "5px 12px",
          margin: 0,
          fontSize: "13px",
        }}
      >
        <dt style={dtStyle}>{t("part")}</dt>
        <dd style={monoStyle}>{formatShare(share, INTL_TAG[locale])}</dd>
        <dt style={dtStyle}>{t("plusGrandQue")}</dt>
        <dd style={monoStyle}>
          {t("plusGrandQueValeur", { count: bigger, total: count(amounts.length) })}
        </dd>
        <dt style={dtStyle}>{t("rang")}</dt>
        <dd style={monoStyle}>{ordinal(rank)}</dd>
      </dl>

      {!agrandir && (
        <>
          {/* ---------- Nom affiché : avant le témoignage (en dernier, on l'oubliait) ---------- */}
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={labelStyle}>{t("nomAffiche")}</span>
            <input
              type="text"
              value={name}
              maxLength={CONFIG.nameMax}
              placeholder={t("nomPlaceholder")}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              autoComplete="nickname"
            />
            {name.trim().length === 1 && (
              <span style={{ fontSize: "12px", color: "#f87171" }}>
                {t("nomCourt")}
              </span>
            )}
          </label>

          {/* ---------- Témoignage : bien en vue, sous le nom (c'est ce qui rend le vitrail vivant) ---------- */}
          <div
            style={{
              display: "grid",
              gap: "8px",
              padding: "14px",
              borderRadius: "10px",
              border: "1px solid rgba(240,178,74,0.45)",
              background: "rgba(240,178,74,0.07)",
              boxShadow: "0 0 24px rgba(240,178,74,0.08)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#F4EFE6",
                  lineHeight: 1.3,
                }}
              >
                <Editable field="question">{picker.question}</Editable>
              </div>
              <div style={{ fontSize: "14px", color: GOLD, marginTop: "2px" }}>
                {org.testimonial.cta}
              </div>
            </div>
            <TestimonialField
              value={message}
              onChange={setMessage}
              consent={quoteConsent}
              onConsent={setQuoteConsent}
              rows={3}
            />
            {picker.canChange && <AnotherQuestion onClick={picker.next} />}
          </div>

          {/* ---------- Le morceau ---------- */}
          <div style={{ display: "grid", gap: "6px" }}>
            <span style={labelStyle}>{t("verre")}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {GLASS_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={glassName(c)}
                  aria-label={glassName(c)}
                  aria-pressed={color === c.value}
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background: c.value,
                    border:
                      color === c.value
                        ? "2px solid #fff"
                        : "2px solid transparent",
                    boxShadow:
                      color === c.value ? `0 0 10px ${c.value}` : "none",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </div>


          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {photo.src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.src}
                alt=""
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "8px",
                  objectFit: "cover",
                }}
              />
            )}
            <button
              type="button"
              disabled={photoBusy}
              onClick={() => fileRef.current?.click()}
              style={secondaryStyle}
            >
              {photoBusy
                ? tp("envoi")
                : photo.src
                  ? tp("changer")
                  : tp("ajouter")}
            </button>
            {photo.src && !photoBusy && (
              <button
                type="button"
                onClick={() => {
                  photoBlob.current = null;
                  setPhoto({ src: null, path: null });
                }}
                style={linkButtonStyle}
              >
                {tp("retirer")}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              hidden
            />
          </div>

          <p style={{ ...hintStyle, marginTop: "-6px" }}>
            {t("facultatifs")}
          </p>
        </>
      )}

      {error && (
        <p style={{ margin: 0, fontSize: "13px", color: "#f87171" }}>{error}</p>
      )}
      {(demo || showcase) && (
        <p
          style={{
            margin: 0,
            padding: "8px 10px",
            borderRadius: "8px",
            fontSize: "12px",
            lineHeight: 1.45,
            color: "#FFE2A8",
            background: "rgba(240,178,74,0.08)",
            border: "1px dashed rgba(240,178,74,0.45)",
          }}
        >
          {showcase ? t("demoVitrine") : t("demo")}
        </p>
      )}

      <div style={page ? stickyBar : { display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={submit}
          disabled={!valid}
          style={{
            ...goldStyle,
            opacity: valid ? 1 : 0.45,
            cursor: valid ? "pointer" : "not-allowed",
          }}
        >
          {busy ? t("instant") : t("donner", { montant: money(payCents) })}
        </button>
      </div>
      <p style={{ ...hintStyle, textAlign: "center" }}>
        {showcase ? t("piedDemo") : t("pied")}{" "}
        <Link
          href="/confidentialite"
          target="_blank"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          {tc("confidentialiteCourt")}
        </Link>
        {" · "}
        <Link
          href="/conditions"
          target="_blank"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          {tc("conditionsCourt")}
        </Link>
      </p>
      </>
      )}
    </div>
  );
}

/**
 * Démonstration : à la place de Stripe, une étape qui dit ce qui se passerait et confirme qu'aucun paiement n'a lieu.
 * Le récapitulatif reprend le montant et le verre, pour qu'on sache ce qu'on « donne ».
 */
function DemoCheckout({
  payCents,
  name,
  color,
  onBack,
  onConfirm,
}: {
  payCents: number;
  name: string | null;
  color: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("claim.demoPaiement");
  const tc = useTranslations("commun");
  const money = useMoney();
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmRef.current?.focus(), []);
  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px",
          borderRadius: "10px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: "34px",
            height: "34px",
            flex: "none",
            borderRadius: "8px",
            background: color,
            boxShadow: `0 0 14px ${color}`,
          }}
        />
        <span style={{ display: "grid", gap: "2px" }}>
          <span style={{ fontSize: "20px", fontWeight: 700, color: GOLD }}>{money(payCents)}</span>
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>{name ?? tc("anonyme")}</span>
        </span>
      </div>
      <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.5, color: "rgba(255,255,255,0.85)" }}>
        {t("texte")}
      </p>
      <p
        style={{
          margin: 0,
          padding: "10px 12px",
          borderRadius: "8px",
          fontSize: "13px",
          lineHeight: 1.45,
          color: "#FFE2A8",
          background: "rgba(240,178,74,0.08)",
          border: "1px dashed rgba(240,178,74,0.45)",
        }}
      >
        {t("aucunPaiement")}
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" onClick={onBack} style={secondaryStyle}>
          {t("modifier")}
        </button>
        <button ref={confirmRef} type="button" onClick={onConfirm} style={goldStyle}>
          {t("confirmer")}
        </button>
      </div>
    </div>
  );
}

// ---------- Styles ----------
const labelStyle: CSSProperties = {
  fontSize: "11px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.55)",
};
const dtStyle: CSSProperties = { color: "rgba(255,255,255,0.55)" };
const monoStyle: CSSProperties = {
  margin: 0,
  fontFamily: "'DM Sans', sans-serif",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: "11px",
  color: "rgba(255,255,255,0.45)",
  lineHeight: 1.5,
};
const inputStyle: CSSProperties = {
  font: "500 16px 'DM Sans', sans-serif", // 16 px minimum : sinon Safari (iPhone) agrandit la page au toucher du champ
  color: "#F4EFE6",
  background: "#0B0A12",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "8px",
  padding: "10px 12px",
  width: "100%",
  boxSizing: "border-box",
};
const goldStyle: CSSProperties = {
  flex: 1,
  padding: "12px 16px",
  background: GOLD,
  color: "#1A1208",
  border: 0,
  borderRadius: "8px",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "15px",
  fontWeight: 600,
  cursor: "pointer",
};
const secondaryStyle: CSSProperties = {
  padding: "10px 14px",
  background: "rgba(255,255,255,0.08)",
  color: "#F4EFE6",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "8px",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "14px",
  cursor: "pointer",
};
const linkButtonStyle: CSSProperties = {
  background: "none",
  border: 0,
  padding: 0,
  color: "rgba(255,255,255,0.7)",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "13px",
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
};
const pageStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gap: "14px",
  alignContent: "start",
  background: "rgba(20,18,29, 0.95)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "14px",
  padding: "18px 16px 0",
  color: "#F4EFE6",
  fontFamily: "'DM Sans', sans-serif",
};
/** Formulaire mobile : le bouton reste à portée de pouce, en bas de l'écran. */
const stickyBar: CSSProperties = {
  position: "sticky",
  bottom: 0,
  zIndex: 5,
  display: "flex",
  gap: "8px",
  margin: "0 -16px",
  padding: "14px 16px max(14px, env(safe-area-inset-bottom))",
  background: "linear-gradient(rgba(20,18,29,0), rgba(20,18,29,0.98) 30%)",
  borderRadius: "0 0 14px 14px",
};
const closeStyle: CSSProperties = {
  background: "none",
  border: 0,
  color: "rgba(255,255,255,0.5)",
  fontSize: "22px",
  cursor: "pointer",
  lineHeight: 1,
};

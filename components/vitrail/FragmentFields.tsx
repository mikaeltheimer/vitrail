"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useOrg } from "@/lib/useOrg";
import { useGlassName } from "@/lib/useI18n";
import { CONFIG, GLASS_COLORS } from "@/lib/config";
import TestimonialField from "./TestimonialField";
import { AnotherQuestion, type useQuestionPicker } from "./QuestionPicker";
import Editable from "@/components/atelier/Editable";
import { GOLD, cardStyle, cardTitleStyle, hintStyle, inputStyle, labelStyle } from "./claimUi";

// « Votre fragment » : le nom, le témoignage, le verre et la photo, dans cet ordre. Le même bloc sert au panneau de
// don (vitrail, /don) et à la page « Mon fragment » (/m/[token]) : une seule façon de faire (Mika, 18 nov.).
// Un nom vide = un fragment anonyme. La photo reste à la charge de chaque page (envoi différé au paiement dans le
// panneau, envoi immédiat sur « Mon fragment ») : elle arrive par `photo`.

export default function FragmentFields({
  name,
  onName,
  message,
  onMessage,
  quoteConsent,
  onQuoteConsent,
  picker,
  color,
  onColor,
  photo,
  nameNote,
  messageNote,
  footnote = true,
}: {
  name: string;
  onName: (v: string) => void;
  message: string;
  onMessage: (v: string) => void;
  quoteConsent: boolean;
  onQuoteConsent: (v: boolean) => void;
  picker: ReturnType<typeof useQuestionPicker>;
  color: string;
  onColor: (v: string) => void;
  photo: ReactNode;
  /** Sous le champ du nom (ex. « Laissez vide pour rester anonyme. » quand un nom est déjà rempli). */
  nameNote?: ReactNode;
  /** Sous le témoignage (ex. « en attente de l'équipe »). */
  messageNote?: ReactNode;
  /** « Nom et photo sont facultatifs… » sous la photo. */
  footnote?: boolean;
}) {
  const t = useTranslations("claim");
  const org = useOrg();
  const glassName = useGlassName();
  return (
    <>
      {/* ---------- Nom affiché : avant le témoignage (en dernier, on l'oubliait) ---------- */}
      {/* Même encadré doré que le témoignage : ce sont les deux choses qui s'affichent sur le morceau */}
      <label style={{ ...cardStyle, display: "grid", gap: "8px" }}>
        <span>
          <span style={cardTitleStyle}>{t("nomTitre")}</span>
          <span style={{ display: "block", fontSize: "17px", color: GOLD, marginTop: "2px" }}>{t("nomAide")}</span>
        </span>
        <input
          type="text"
          value={name}
          maxLength={CONFIG.nameMax}
          placeholder={t("nomPlaceholder")}
          onChange={(e) => onName(e.target.value)}
          style={{ ...inputStyle, fontSize: "18px", padding: "14px" }}
          autoComplete="nickname"
        />
        {name.trim().length === 1 && <span style={{ fontSize: "15px", color: "#f87171" }}>{t("nomCourt")}</span>}
        {nameNote}
      </label>

      {/* ---------- Témoignage : bien en vue, sous le nom (c'est ce qui rend le vitrail vivant) ---------- */}
      <div style={{ ...cardStyle, display: "grid", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#F4EFE6", lineHeight: 1.3 }}>
            <Editable field="question">{picker.question}</Editable>
          </div>
          <div style={{ fontSize: "17px", color: GOLD, marginTop: "2px" }}>{org.testimonial.cta}</div>
        </div>
        <TestimonialField value={message} onChange={onMessage} consent={quoteConsent} onConsent={onQuoteConsent} rows={3} />
        {picker.canChange && <AnotherQuestion onClick={picker.next} />}
        {messageNote}
      </div>

      {/* ---------- Le morceau ---------- */}
      <div style={{ display: "grid", gap: "6px" }}>
        <span style={labelStyle}>{t("verre")}</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {GLASS_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onColor(c.value)}
              title={glassName(c)}
              aria-label={glassName(c)}
              aria-pressed={color === c.value}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: c.value,
                border: color === c.value ? "2px solid #fff" : "2px solid transparent",
                boxShadow: color === c.value ? `0 0 10px ${c.value}` : "none",
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </div>

      {photo}

      {footnote && <p style={{ ...hintStyle, marginTop: "-6px" }}>{t("facultatifs")}</p>}
    </>
  );
}

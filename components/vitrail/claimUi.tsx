import type { CSSProperties } from "react";

// Styles et petits éléments partagés par le panneau de don (ClaimPanel), le champ « Votre fragment » (FragmentFields)
// et la page « Mon fragment » (/m/[token]) : une seule façon de présenter un fragment (Mika, 18 nov.).

export const GOLD = "#F0B24A";

export const labelStyle: CSSProperties = {
  fontSize: "14px",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.82)",
};

export const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: "16px",
  color: "rgba(255,255,255,0.82)",
  lineHeight: 1.5,
};

export const inputStyle: CSSProperties = {
  font: "500 16px 'DM Sans', sans-serif", // 16 px minimum : sinon Safari (iPhone) agrandit la page au toucher du champ
  color: "#F4EFE6",
  background: "#0B0A12",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "8px",
  padding: "10px 12px",
  width: "100%",
  boxSizing: "border-box",
};

export const secondaryStyle: CSSProperties = {
  padding: "10px 14px",
  background: "rgba(255,255,255,0.08)",
  color: "#F4EFE6",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "8px",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "17px",
  cursor: "pointer",
};

export const linkButtonStyle: CSSProperties = {
  background: "none",
  border: 0,
  padding: 0,
  color: "rgba(255,255,255,0.82)",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: "16px",
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
};

/** Encadré doré du nom et du témoignage. */
export const cardStyle: CSSProperties = {
  padding: "14px",
  borderRadius: "10px",
  border: "1px solid rgba(240,178,74,0.45)",
  background: "rgba(240,178,74,0.07)",
  boxShadow: "0 0 24px rgba(240,178,74,0.08)",
};

export const cardTitleStyle: CSSProperties = { display: "block", fontSize: "18px", fontWeight: 700, color: "#F4EFE6", lineHeight: 1.3 };

export const sectionStyle: CSSProperties = { display: "grid", gap: "12px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.12)" };

export const sectionNumberStyle: CSSProperties = {
  flex: "none",
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  border: `1.5px solid ${GOLD}`,
  color: GOLD,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "15px",
};

export function SectionHead({ n, id, title, note }: { n: number; id: string; title: string; note?: string }) {
  return (
    <h3 id={id} style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px", fontSize: "19px", fontWeight: 700, color: "#F4EFE6" }}>
      <span aria-hidden style={sectionNumberStyle}>
        {n}
      </span>
      {title}
      {note && <span style={{ fontSize: "15px", fontWeight: 400, color: "rgba(255,255,255,0.72)" }}>{note}</span>}
    </h3>
  );
}

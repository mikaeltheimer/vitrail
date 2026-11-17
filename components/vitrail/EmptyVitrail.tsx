"use client";

// Vitrail encore vide (aucun don) : le disque déjà découpé, en verre clair, avec un fragment plus lumineux que les
// autres, qui symbolise le premier don (piste A de Mika, 17 nov. 2026). Le même pour la page et pour le grand écran.
// Le pavage est fixe (graine constante) : ce n'est pas celui que prendra le vrai vitrail, qui se recalcule à chaque don.
// Le texte ne promet donc pas « votre fragment ici ».

import { useMemo, type ReactNode } from "react";
import { glassScene, lightRays, type SceneTile } from "@/lib/glassSvg";

// Montants variés, pour des pièces de tailles différentes comme dans un vrai vitrail
const AMOUNTS = [2000, 5000, 10000, 2500, 25000, 5000, 3000, 10000, 50000, 2000, 7500, 5000, 15000, 2000, 4000, 10000, 6000, 2500, 20000, 5000, 3500, 8000, 12000, 2000, 5000, 30000, 4500, 2500, 9000, 5000, 2000, 6000, 10000, 3000, 40000, 5000, 2500, 7000];

function useEmptyScene() {
  return useMemo(() => {
    const scene = glassScene(
      AMOUNTS.map((a, i) => ({ id: `attente-${i}`, color: "#F4EFE6", amountCents: a })),
      800,
    )!;
    // Le fragment lumineux : une pièce assez grande, la plus proche du centre
    const radii = scene.tiles.map((t) => t.inRadius).sort((a, b) => a - b);
    const median = radii[Math.floor(radii.length / 2)];
    const first = scene.tiles
      .filter((t) => t.inRadius >= median)
      .reduce<SceneTile | null>((best, t) => (!best || Math.hypot(...t.labelCenter) < Math.hypot(...best.labelCenter) ? t : best), null)!;
    return { scene, first, rays: lightRays(scene, 2.4) };
  }, []);
}

const f = (n: number) => n.toFixed(1);

/** Le disque seul, carré : à placer dans une boîte de la taille voulue. `glow` : le fragment lumineux. */
export function EmptyDisc({ glow = true }: { glow?: boolean }) {
  const { scene, first, rays } = useEmptyScene();
  const v = scene.view;
  const R = scene.radius;
  return (
    <svg viewBox={`${f(-v)} ${f(-v)} ${f(2 * v)} ${f(2 * v)}`} width="100%" height="100%" style={{ display: "block", overflow: "visible" }} aria-hidden>
      <defs>
        {rays.map((r, i) => (
          <linearGradient key={i} id={`vide-r${i}`} gradientUnits="userSpaceOnUse" x1={f(r.from[0])} y1={f(r.from[1])} x2={f(r.to[0])} y2={f(r.to[1])}>
            <stop offset="0" stopColor="#F4EFE6" stopOpacity="0.1" />
            <stop offset="0.35" stopColor="#F4EFE6" stopOpacity="0.035" />
            <stop offset="0.8" stopColor="#F4EFE6" stopOpacity="0" />
          </linearGradient>
        ))}
        {scene.tiles.map((t, i) => {
          const [cx, cy] = t.labelCenter;
          return (
            <radialGradient key={i} id={`vide-g${i}`} gradientUnits="userSpaceOnUse" cx={f(cx)} cy={f(cy)} r={f(Math.max(t.inRadius * 1.8, 60))}>
              <stop offset="0" stopColor="#E9E4DA" stopOpacity="0.3" />
              <stop offset="1" stopColor="#E9E4DA" stopOpacity="0.04" />
            </radialGradient>
          );
        })}
        <radialGradient id="vide-premier" gradientUnits="userSpaceOnUse" cx={f(first.labelCenter[0])} cy={f(first.labelCenter[1])} r={f(Math.max(first.inRadius * 1.9, 80))}>
          <stop offset="0" stopColor="#FFF1CF" />
          <stop offset="0.45" stopColor="#F0B24A" />
          <stop offset="1" stopColor="#9A6216" />
        </radialGradient>
        <filter id="vide-halo" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={f(R * 0.05)} />
        </filter>
      </defs>
      {/* Rayons sous le disque (comme le vrai vitrail), en lumière blanche : le verre n'a pas encore de couleur */}
      {rays.map((r, i) => (
        <polygon key={i} points={r.points} fill={`url(#vide-r${i})`} />
      ))}
      <circle r={R} fill="#050408" />
      {scene.tiles.map((t, i) =>
        glow && t.id === first.id ? null : (
          <g key={t.id}>
            <polygon points={t.points} fill="#1C1A24" />
            <polygon points={t.points} fill={`url(#vide-g${i})`} />
          </g>
        ),
      )}
      {glow && (
        <g className="vide-premier">
          <polygon points={first.points} fill="#F0B24A" opacity="0.55" filter="url(#vide-halo)" />
          <polygon points={first.points} fill="url(#vide-premier)" />
        </g>
      )}
      {scene.tiles.map((t) => (
        <polygon key={t.id} points={t.points} fill="none" stroke="#050408" strokeWidth={f(t.lead * 1.3)} strokeLinejoin="round" />
      ))}
      <circle r={f(R + scene.ring / 2)} fill="none" stroke="#050408" strokeWidth={f(scene.ring)} />
      <style>{`
        .vide-premier { animation: vide-respire 4.5s ease-in-out infinite; }
        @keyframes vide-respire { 0%, 100% { opacity: 0.82; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .vide-premier { animation: none; } }
      `}</style>
    </svg>
  );
}

/**
 * Le disque et, dessous, le texte : remplit son parent (positionné), centré. Le disque prend la place qui reste au texte.
 * `disc` : fraction de la plus petite dimension du parent.
 */
export default function EmptyVitrail({ glow = true, children, disc = 0.62 }: { glow?: boolean; children?: ReactNode; disc?: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, containerType: "size", display: "grid", placeItems: "center" }}>
      <div style={{ display: "grid", justifyItems: "center", gap: "min(4cqh, 28px)", textAlign: "center" }}>
        <div style={{ width: `${disc * 100}cqmin`, height: `${disc * 100}cqmin` }}>
          <EmptyDisc glow={glow} />
        </div>
        {children && <div style={{ position: "relative", padding: "0 20px" }}>{children}</div>}
      </div>
    </div>
  );
}

// Palette Donivers. Par défaut, celle de la marque ; plus tard, chaque organisme pourra choisir son accent, ses cinq
// verres et un thème sombre ou clair (la structure, les typographies et « Propulsé par Donivers » restent fixes).
// Les verres sont les seules couleurs fortes de l'interface.

export interface Theme {
  mode: 'dark' | 'light'
  /** Fond nuit */
  bg: string
  /** Panneaux posés sur le fond */
  panel: string
  text: string
  textMuted: string
  /** Boutons, slogan, liens d'action */
  accent: string
  /** Texte sur l'accent (forcé lisible : voir onAccent) */
  onAccent: string
  /** Lumière centrale du vitrail */
  glow: string
}

export const DEFAULT_THEME: Theme = {
  mode: 'dark',
  bg: '#0B0A12',
  panel: '#14121D',
  text: '#F4EFE6',
  textMuted: '#B8B2C4',
  accent: '#F0B24A',
  onAccent: '#1A1208',
  glow: '#FFE2A8',
}

export const DEFAULT_GLASSES = [
  { name: 'Ambre', value: '#F0B24A' },
  { name: 'Rose', value: '#E0657F' },
  { name: 'Turquoise', value: '#3DB5A6' },
  { name: 'Indigo', value: '#6A78E6' },
  { name: 'Violet', value: '#A56BD9' },
] as const

// ── Contraste (WCAG) : texte 4,5:1 au moins, texte large 3:1 ───────────────────
function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
export function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/**
 * Texte à poser sur un accent choisi par l'organisme : la couleur voulue si elle passe 4,5:1, sinon le noir ou le blanc
 * le plus lisible. Garantit des boutons lisibles quel que soit l'accent.
 */
export function onAccent(accent: string, preferred = DEFAULT_THEME.onAccent): string {
  if (contrast(accent, preferred) >= 4.5) return preferred
  return contrast(accent, '#000000') >= contrast(accent, '#FFFFFF') ? '#000000' : '#FFFFFF'
}

/** Thème en vigueur (aujourd'hui : celui de la marque ; demain : celui de l'organisme, contrôlé). */
export const THEME: Theme = { ...DEFAULT_THEME, onAccent: onAccent(DEFAULT_THEME.accent) }

/** « #F0B24A » + 0.3 → « rgba(240,178,74,0.3) » */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

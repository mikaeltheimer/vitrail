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

// Palette « Atelier+ » (9 nov. 2026) : cinq verres clairs et saturés, choisis pour rester lisibles sur une télé comme sur un
// projecteur en salle éclairée (fond gris, couleurs délavées), et pour que deux verres voisins restent distincts en
// deutéranopie et en protanopie (écart de clarté). Mesures : scripts/palette.py. Un sixième verre (corail) a été
// essayé puis retiré : entre l'ambre et le rose, il rendait le vitrail trop orangé, et chaque autre sixième verre
// mesuré (indigo, tilleul, turquoise) se confondait avec un voisin en daltonisme ou au projecteur.
// `id` : clé du nom dans messages/*.json (commun.verres) ; `name` : nom français (console d'administration).
export const DEFAULT_GLASSES = [
  { id: 'ambre', name: 'Ambre', value: '#F0B24A' },
  { id: 'jade', name: 'Jade', value: '#1FA978' },
  { id: 'ciel', name: 'Ciel', value: '#5CC0F5' },
  { id: 'violet', name: 'Violet', value: '#9450CC' },
  { id: 'rose', name: 'Rose', value: '#F59AC5' },
] as const

export type GlassId = (typeof DEFAULT_GLASSES)[number]['id']

/** Verre de repli (couleur absente ou illisible). */
export const FALLBACK_GLASS: string = DEFAULT_GLASSES[4].value

/**
 * Anciennes valeurs des verres → verre actuel. Une couleur enregistrée avant un changement de palette (donateur en base,
 * session Stripe ouverte, onglet resté ouvert) garde ainsi un sens. La migration 2026-11-19-palette-atelier.sql applique
 * la même correspondance aux donateurs déjà enregistrés.
 */
export const LEGACY_GLASSES: Readonly<Record<string, string>> = {
  '#E0657F': '#F59AC5', // rose      → rose
  '#3DB5A6': '#1FA978', // turquoise → jade
  '#6A78E6': '#5CC0F5', // indigo    → ciel
  '#A56BD9': '#9450CC', // violet    → violet
  '#EA6646': '#F59AC5', // corail (essayé le 9 nov.) → rose
}

/** Couleur de verre actuelle pour une valeur reçue (majuscules ou minuscules, ancienne palette acceptée), sinon null. */
export function currentGlass(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const v = input.trim().toUpperCase()
  if (DEFAULT_GLASSES.some(g => g.value === v)) return v
  return LEGACY_GLASSES[v] ?? null
}

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

import { CONFIG } from './config'

// Polices de l'affichage : auto-hébergées (installées avec le site, aucune requête externe — important sur un Wi-Fi d'événement).
// Le canvas n'utilise une police que si elle est chargée : on la charge avant de dessiner, puis on redessine.
// Sur le verre (noms, témoignages), DM Sans : lisible en petit et de loin. Fraunces est réservée aux titres et au slogan.

export const FONT_DISPLAY = '"DM Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
export const FONT_SANS = FONT_DISPLAY
export const FONT_SERIF = '"Fraunces", ui-serif, Georgia, serif'

const FACES = [...['400', '500', '600', '700'].map(w => `${w} 20px "DM Sans"`), '500 20px "Fraunces"']

/**
 * Noms des donateurs en Fraunces plutôt qu'en DM Sans : réglage CONFIG.donorNameFont, ou essai par l'adresse
 * (?noms=fraunces / ?noms=dmsans) pour comparer.
 */
export function donorNamesSerif(): boolean {
  if (typeof window !== 'undefined') {
    const v = new URLSearchParams(window.location.search).get('noms')
    if (v === 'fraunces') return true
    if (v === 'dmsans') return false
  }
  return CONFIG.donorNameFont === 'serif'
}
/** Police CSS des noms des donateurs (fiches, carte de l'écran, derniers dons). */
export const donorNameFamily = () => (donorNamesSerif() ? FONT_SERIF : FONT_SANS)

let pending: Promise<void> | null = null

/** Charge les polices du canvas ; se résout quand elles sont prêtes (ou échouent : le texte se rabat alors sur une police système). */
export function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve()
  pending ??= Promise.all(FACES.map(f => document.fonts.load(f, 'AaÉé0123456789'))).then(
    () => undefined,
    () => undefined,
  )
  return pending
}

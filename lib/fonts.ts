// Polices de l'affichage : auto-hébergées (installées avec le site, aucune requête externe — important sur un Wi-Fi d'événement).
// Le canvas n'utilise une police que si elle est chargée : on la charge avant de dessiner, puis on redessine.

export const FONT_DISPLAY = '"Fraunces", Georgia, "Times New Roman", serif'
export const FONT_SANS = '"DM Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'

const FACES = ['600 20px Fraunces', '700 20px Fraunces', 'italic 400 20px Fraunces', '500 20px "DM Sans"', '700 20px "DM Sans"']

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

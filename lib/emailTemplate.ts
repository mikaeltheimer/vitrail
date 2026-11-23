import type { Locale } from '@/i18n/config'
import { DEFAULT_GLASSES } from './theme'
import { CONFIG, brandFor } from './config'
import { platformUrl } from './tenant'

// Gabarit des courriels : une version HTML (mise en page en tableaux et styles en ligne, pour tous les logiciels de courriel)
// et une version texte du même contenu. Le contenu vient de messages/*.json (espace « courriel »).

export interface EmailContent {
  /** Aperçu affiché à côté de l'objet dans la boîte de réception. */
  preheader?: string
  heading: string
  paragraphs: string[]
  /** Le fragment du donateur : une pastille de sa couleur, avec une phrase à côté (avant les paragraphes). */
  fragment?: { color: string; text: string }
  /** Récapitulatif chiffré, dans un encadré (la dernière ligne peut être un total, en gras), avec une mention sous l'encadré. */
  summary?: { rows: { label: string; value: string; total?: boolean }[]; note?: string }
  /** Invitation mise en avant juste avant le bouton : un titre (en serif) et une phrase. */
  prompt?: { title: string; text?: string }
  button?: { label: string; url: string }
  /** Petit texte sous le bouton. */
  note?: string
  /** Phrase qui précède le lien de secours (« Le bouton ne fonctionne pas? … »). */
  linkHelp?: string
  /** Ligne de la plateforme, au-dessus du pied (« Vous voulez collecter des dons… ? Créez votre vitrail »). */
  promo?: { text: string; label: string; url: string }
  /** Lignes de pied de courriel, en petit. */
  footer: string[]
}

// Palette Donivers (lib/theme.ts) : fond nuit, panneau sombre, texte crème, accent ambre. Les couleurs sont posées en attributs
// (bgcolor) ET en styles : les logiciels qui réécrivent les couleurs en mode sombre gardent ainsi un rendu cohérent.
const BG = '#0B0A12'
const PANEL = '#14121D'
const LINE = '#2A2735'
const TEXT = '#F4EFE6'
const MUTED = '#B8B2C4'
const GOLD = '#F0B24A'
const ON_GOLD = '#1A1208'
const SERIF = "Fraunces,Georgia,'Times New Roman',serif"
const SANS = "'DM Sans',Arial,Helvetica,sans-serif"
/** Les cinq verres : le bandeau du haut est un petit vitrail (cellules de largeurs inégales, sans image). */
const GLASS_WIDTHS = [22, 14, 24, 16, 24]
const GLASS: [string, number][] = DEFAULT_GLASSES.map((g, i) => [g.value, GLASS_WIDTHS[i]])

/**
 * En-tête d'un courriel d'organisme : son logo (version claire, sur le fond sombre du courriel), sinon son nom.
 * Le nom n'y dépend jamais seulement de l'image : beaucoup de logiciels bloquent les images, il reste alors le texte de
 * remplacement, l'objet et le pied du courriel. Sans en-tête : courriel de la plateforme.
 */
export interface EmailHeader {
  name: string
  /** Adresse ABSOLUE du logo (PNG), ou null. */
  logoUrl: string | null
  /** Largeur et hauteur d'origine du logo, pour poser des dimensions explicites (Outlook les exige). */
  logoSize: [number, number] | null
}

const DONIVERS_LOGO: [number, number] = [535, 112]
function doniversLogo(height: number): string {
  const width = Math.round((height * DONIVERS_LOGO[0]) / DONIVERS_LOGO[1])
  return `<img src="${escapeHtml(`${platformUrl()}/brand/donivers-courriel.png`)}" alt="${escapeHtml(CONFIG.brand.name)}" width="${width}" height="${height}" style="display:block;width:${width}px;height:${height}px;border:0;outline:none;text-decoration:none;font-family:${SERIF};font-size:16px;color:${TEXT}">`
}

const LOGO_H = 48
const LOGO_MAX_W = 280

/**
 * Marque de la plateforme en tête de ses propres courriels. PROVISOIRE (pas de logo définitif) : les cinq verres en
 * cellules de tableau (aucune image à charger) et le nom en texte. Remplacer ici quand le logo sera choisi.
 */
function platformHeader(locale: Locale): string {
  // Logo en PNG (Gmail et Outlook bloquent le SVG), 2× la taille affichée. Images bloquées : le texte de remplacement
  // prend la police et la couleur du nom.
  const logo = `${platformUrl()}/brand/donivers-courriel.png`
  return `<img src="${escapeHtml(logo)}" alt="${escapeHtml(CONFIG.brand.name)}" width="142" height="28" style="display:block;width:142px;height:28px;border:0;outline:none;text-decoration:none;font-family:${SERIF};font-size:22px;color:${TEXT}">
<div style="font-family:${SERIF};font-size:14px;font-style:italic;color:${GOLD};padding-top:8px">${escapeHtml(brandFor(locale).slogan)}</div>`
}

function orgHeader(h: EmailHeader): string {
  if (h.logoUrl) {
    const [w0, h0] = h.logoSize && h.logoSize[0] > 0 && h.logoSize[1] > 0 ? h.logoSize : [LOGO_H * 3, LOGO_H]
    let height = LOGO_H
    let width = Math.round((LOGO_H * w0) / h0)
    if (width > LOGO_MAX_W) {
      width = LOGO_MAX_W
      height = Math.round((LOGO_MAX_W * h0) / w0)
    }
    // Images bloquées : le texte de remplacement prend le style du nom (police, taille, couleur)
    return `<img src="${escapeHtml(h.logoUrl)}" alt="${escapeHtml(h.name)}" width="${width}" height="${height}" style="display:block;width:${width}px;height:${height}px;max-width:100%;border:0;outline:none;text-decoration:none;font-family:${SERIF};font-size:22px;color:${TEXT}">`
  }
  return `<div style="font-family:${SERIF};font-size:22px;font-weight:500;letter-spacing:-0.01em;color:${TEXT}">${escapeHtml(h.name)}</div>`
}

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function renderEmail(c: EmailContent, locale: Locale, header?: EmailHeader | null): { html: string; text: string } {
  const p = (t: string, style = '') => `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.6;color:${TEXT};${style}">${escapeHtml(t)}</p>`
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 24px"><tr><td bgcolor="${GOLD}" style="background:${GOLD};border-radius:14px">
<a href="${escapeHtml(c.button.url)}" style="display:inline-block;padding:15px 28px;font-family:${SANS};font-size:16px;font-weight:bold;color:${ON_GOLD};text-decoration:none">${escapeHtml(c.button.label)}</a>
</td></tr></table>`
    : ''
  // Couleur limitée à un code hexadécimal (elle finit dans un attribut et un style)
  const fragment =
    c.fragment && /^#[0-9a-f]{6}$/i.test(c.fragment.color)
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
<td valign="middle" width="36" style="width:36px"><table role="presentation" width="36" cellpadding="0" cellspacing="0"><tr><td width="36" height="36" bgcolor="${c.fragment.color}" style="width:36px;height:36px;background:${c.fragment.color};border-radius:8px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>
<td valign="middle" style="padding-left:14px;font-family:${SANS};font-size:16px;line-height:1.5;color:${TEXT}">${escapeHtml(c.fragment.text)}</td>
</tr></table>`
      : ''
  const summary = c.summary
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG}" style="background:${BG};border:1px solid ${LINE};border-radius:14px;margin:4px 0 ${c.summary.note ? '10px' : '24px'}">
${c.summary.rows
  .map((r, i) => {
    const sep = i > 0 ? `border-top:1px solid ${LINE};` : ''
    const weight = r.total ? 'font-weight:bold;' : ''
    const color = r.total ? TEXT : MUTED
    return `<tr><td style="${sep}padding:12px 16px;font-family:${SANS};font-size:15px;line-height:1.4;color:${color};${weight}">${escapeHtml(r.label)}</td><td align="right" style="${sep}padding:12px 16px;font-family:${SANS};font-size:15px;line-height:1.4;color:${TEXT};white-space:nowrap;${weight}">${escapeHtml(r.value)}</td></tr>`
  })
  .join('\n')}
</table>${c.summary.note ? `<p style="margin:0 0 28px;font-family:${SANS};font-size:13px;line-height:1.5;color:${MUTED}">${escapeHtml(c.summary.note)}</p>` : ''}`
    : ''
  const prompt = c.prompt
    ? `<p style="margin:0 0 8px;font-family:${SERIF};font-size:21px;line-height:1.35;font-weight:500;color:${TEXT}">${escapeHtml(c.prompt.title)}</p>${c.prompt.text ? `<p style="margin:0 0 12px;font-family:${SANS};font-size:15px;line-height:1.55;color:${MUTED}">${escapeHtml(c.prompt.text)}</p>` : ''}`
    : ''
  const promo = c.promo
    ? `<p style="margin:0 0 14px;font-family:${SANS};font-size:13px;line-height:1.5;color:${TEXT}">${escapeHtml(c.promo.text)} <a href="${escapeHtml(c.promo.url)}" style="color:${GOLD};font-weight:bold">${escapeHtml(c.promo.label)}</a></p>`
    : ''
  const note = c.note ? p(c.note, `font-size:14px;color:${MUTED};`) : ''
  const help =
    c.button && c.linkHelp
      ? `<p style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:1.5;color:${MUTED}">${escapeHtml(c.linkHelp)}<br><a href="${escapeHtml(c.button.url)}" style="color:${GOLD};word-break:break-all">${escapeHtml(c.button.url)}</a></p>`
      : ''
  const footer = c.footer.map(l => `<p style="margin:0 0 6px;font-family:${SANS};font-size:12px;line-height:1.5;color:${MUTED}">${escapeHtml(l)}</p>`).join('')
  const pre = c.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(c.preheader)}</div>`
    : ''
  const glass = GLASS.map(([color, w]) => `<td width="${w}%" bgcolor="${color}" style="background:${color};height:8px;font-size:0;line-height:0">&nbsp;</td>`).join(
    '<td width="2" bgcolor="' + PANEL + '" style="width:2px;font-size:0;line-height:0">&nbsp;</td>',
  )
  const top = header ? orgHeader(header) : platformHeader(locale)
  // Courriel d'organisme : le haut lui appartient ; la marque Donivers accompagne l'invitation de la plateforme, au pied
  const footBrand = header && c.promo ? `<div style="padding:0 0 12px">${doniversLogo(20)}</div>` : ''

  const html = `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>${escapeHtml(c.heading)}</title></head>
<body bgcolor="${BG}" style="margin:0;padding:0;background:${BG}">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG}" style="background:${BG}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" bgcolor="${PANEL}" style="width:100%;max-width:560px;background:${PANEL};border:1px solid ${LINE};border-radius:18px">
<tr><td style="padding:0;border-radius:18px 18px 0 0;overflow:hidden"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${glass}</tr></table></td></tr>
<tr><td style="padding:28px 32px 4px">
${top}
</td></tr>
<tr><td style="padding:24px 32px 12px">
<h1 style="margin:0 0 20px;font-family:${SERIF};font-size:28px;line-height:1.25;font-weight:500;letter-spacing:-0.01em;color:${TEXT}">${escapeHtml(c.heading)}</h1>
${fragment}
${c.paragraphs.map(t => p(t)).join('\n')}
${summary}
${prompt}
${button}
${note}
${help}
</td></tr>
<tr><td style="padding:0 32px 28px">
<div style="border-top:1px solid ${LINE};padding-top:20px">${footBrand}${promo}${footer}</div>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`

  const text = [
    c.heading,
    '',
    ...(c.fragment ? [c.fragment.text, ''] : []),
    ...c.paragraphs.flatMap(t => [t, '']),
    ...(c.summary ? [...c.summary.rows.map(r => `${r.label}${locale === 'fr' ? '\u00a0: ' : ': '}${r.value}`), '', ...(c.summary.note ? [c.summary.note, ''] : [])] : []),
    ...(c.prompt ? [c.prompt.title, ...(c.prompt.text ? [c.prompt.text] : []), ''] : []),
    ...(c.button ? [`${c.button.label}${locale === 'fr' ? ' :' : ':'}`, c.button.url, ''] : []),
    ...(c.note ? [c.note, ''] : []),
    '--',
    ...(c.promo ? [`${c.promo.text} ${c.promo.label}${locale === 'fr' ? '\u00a0: ' : ': '}${c.promo.url}`, ''] : []),
    ...c.footer,
  ].join('\n')

  return { html, text }
}

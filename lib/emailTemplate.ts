import type { Locale } from '@/i18n/config'
import { CONFIG, brandFor } from './config'

// Gabarit des courriels : une version HTML (mise en page en tableaux et styles en ligne, pour tous les logiciels de courriel)
// et une version texte du même contenu. Le contenu vient de messages/*.json (espace « courriel »).

export interface EmailContent {
  /** Aperçu affiché à côté de l'objet dans la boîte de réception. */
  preheader?: string
  heading: string
  paragraphs: string[]
  button?: { label: string; url: string }
  /** Petit texte sous le bouton. */
  note?: string
  /** Phrase qui précède le lien de secours (« Le bouton ne fonctionne pas? … »). */
  linkHelp?: string
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
const GLASS: [string, number][] = [
  ['#F0B24A', 22],
  ['#E0657F', 14],
  ['#3DB5A6', 24],
  ['#6A78E6', 16],
  ['#A56BD9', 24],
]

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

const LOGO_H = 48
const LOGO_MAX_W = 280

/**
 * Marque de la plateforme en tête de ses propres courriels. PROVISOIRE (pas de logo définitif) : les cinq verres en
 * cellules de tableau (aucune image à charger) et le nom en texte. Remplacer ici quand le logo sera choisi.
 */
function platformHeader(locale: Locale): string {
  const bars = GLASS.map(([color]) => `<td width="5" bgcolor="${color}" style="width:5px;height:24px;background:${color};border-radius:3px;font-size:0;line-height:0">&nbsp;</td>`).join(
    '<td width="3" style="width:3px;font-size:0;line-height:0">&nbsp;</td>',
  )
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${bars}<td style="padding-left:12px;font-family:${SERIF};font-size:22px;font-weight:500;letter-spacing:-0.01em;color:${TEXT}">${escapeHtml(CONFIG.brand.name)}</td></tr></table>
<div style="font-family:${SERIF};font-size:14px;font-style:italic;color:${GOLD};padding-top:6px">${escapeHtml(brandFor(locale).slogan)}</div>`
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
${c.paragraphs.map(t => p(t)).join('\n')}
${button}
${note}
${help}
</td></tr>
<tr><td style="padding:0 32px 28px">
<div style="border-top:1px solid ${LINE};padding-top:16px">${footer}</div>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`

  const text = [
    c.heading,
    '',
    ...c.paragraphs.flatMap(t => [t, '']),
    ...(c.button ? [`${c.button.label}${locale === 'fr' ? ' :' : ':'}`, c.button.url, ''] : []),
    ...(c.note ? [c.note, ''] : []),
    '--',
    ...c.footer,
  ].join('\n')

  return { html, text }
}

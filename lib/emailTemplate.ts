import type { Locale } from '@/i18n/config'

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

const INK = '#2A2433'
const MUTED = '#6B6475'
const GOLD = '#F0B24A'
const PAPER = '#F6F1E7'

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function renderEmail(c: EmailContent, locale: Locale): { html: string; text: string } {
  const p = (s: string, style = '') => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${INK};${style}">${escapeHtml(s)}</p>`
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="background:${GOLD};border-radius:999px">
<a href="${escapeHtml(c.button.url)}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#1A1208;text-decoration:none">${escapeHtml(c.button.label)}</a>
</td></tr></table>`
    : ''
  const note = c.note ? p(c.note, `font-size:14px;color:${MUTED};`) : ''
  const help =
    c.button && c.linkHelp
      ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${MUTED}">${escapeHtml(c.linkHelp)}<br><a href="${escapeHtml(c.button.url)}" style="color:${MUTED};word-break:break-all">${escapeHtml(c.button.url)}</a></p>`
      : ''
  const footer = c.footer.map(l => `<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${MUTED}">${escapeHtml(l)}</p>`).join('')
  const pre = c.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(c.preheader)}</div>`
    : ''

  const html = `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(c.heading)}</title></head>
<body style="margin:0;padding:0;background:${PAPER}">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#FFFFFF;border-radius:16px">
<tr><td style="height:6px;background:${GOLD};border-radius:16px 16px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 12px;font-family:Arial,Helvetica,sans-serif">
<h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.25;font-weight:normal;color:${INK}">${escapeHtml(c.heading)}</h1>
${c.paragraphs.map(s => p(s)).join('\n')}
${button}
${note}
${help}
</td></tr>
<tr><td style="padding:12px 32px 28px;font-family:Arial,Helvetica,sans-serif;border-top:1px solid #EEE7D8">
<div style="padding-top:16px">${footer}</div>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`

  const text = [
    c.heading,
    '',
    ...c.paragraphs.flatMap(s => [s, '']),
    ...(c.button ? [`${c.button.label}${locale === 'fr' ? ' :' : ':'}`, c.button.url, ''] : []),
    ...(c.note ? [c.note, ''] : []),
    '--',
    ...c.footer,
  ].join('\n')

  return { html, text }
}

import { NextRequest, NextResponse } from 'next/server'
import { buildMagicLink, buildModeration, buildReceipt, buildReminder, sendEmail, type Built, type EmailKind, type ModerationEvent } from '@/lib/email'
import { escapeHtml, renderEmail } from '@/lib/emailTemplate'
import { siteUrl } from '@/lib/env'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { isAdmin } from '@/lib/session'
import { validateEmail } from '@/lib/validate'
import { isLocale, type Locale } from '@/i18n/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Aperçu des courriels pour l'équipe (console en français) : /api/admin/courriels, connecté à /admin.
//  - GET sans paramètre : la liste (reçu, lien personnel, rappel ; français et anglais).
//  - GET ?type=recu|lien|rappel|modpub|modtem|modphotopub|modphoto|modtout&lang=fr|en : le courriel tel qu'il part (ajouter &format=text pour la version texte).
//  - POST (formulaire de la liste) : envoie un courriel d'essai, sur un exemple, à l'adresse indiquée.
// Les liens des exemples portent un jeton bidon : ils mènent à « ce lien a expiré ». Rien n'est lu ni écrit chez les donateurs.

const TYPES = {
  recu: { label: 'Reçu de don', kind: 'receipt' as EmailKind, build: (locale: Locale): Built => buildReceipt({ amountCents: 2500, token: 'EXEMPLE', locale, baseUrl: siteUrl() }) },
  lien: { label: 'Lien personnel (« Retrouver mon morceau »)', kind: 'magic_link' as EmailKind, build: (locale: Locale): Built => buildMagicLink({ token: 'EXEMPLE', locale, baseUrl: siteUrl() }) },
  rappel: { label: 'Rappel du lendemain (témoignage)', kind: 'reminder' as EmailKind, build: (locale: Locale): Built => buildReminder({ token: 'EXEMPLE', locale, baseUrl: siteUrl() }) },
  ...(Object.fromEntries(
    (
      [
        ['modpub', 'Avis : témoignage publié', 'message_approved'],
        ['modtem', 'Avis : témoignage retiré', 'message_removed'],
        ['modphotopub', 'Avis : photo publiée', 'photo_approved'],
        ['modphoto', 'Avis : photo retirée', 'photo_removed'],
        ['modtout', 'Avis : nom, témoignage et photo effacés', 'content_removed'],
      ] as [string, string, ModerationEvent][]
    ).map(([key, label, event]) => [
      key,
      { label, kind: 'moderation' as EmailKind, build: (locale: Locale): Built => buildModeration({ event, locale, baseUrl: siteUrl() }) },
    ]),
  ) as Record<string, { label: string; kind: EmailKind; build: (locale: Locale) => Built }>),
}
type TypeKey = keyof typeof TYPES
const isType = (v: unknown): v is TypeKey => typeof v === 'string' && v in TYPES

const SECURITY = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'",
  'X-Robots-Tag': 'noindex',
  'Cache-Control': 'no-store',
}

const page = (body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Courriels — aperçu</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#222}h1{font-size:22px}h2{font-size:17px;margin-top:28px}li{margin:4px 0}code{background:#eee;padding:1px 5px;border-radius:4px}
form{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}input,select,button{font:inherit;padding:8px 10px}button{cursor:pointer}.ok{background:#e6f4ea;padding:8px 12px;border-radius:6px}.err{background:#fde8e8;padding:8px 12px;border-radius:6px}.muted{color:#666;font-size:14px}</style></head><body>${body}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY } },
  )

export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return page('<p>Connectez-vous d\'abord à la <a href="/admin">console</a>, puis rouvrez cette adresse.</p>', 403)
  const params = request.nextUrl.searchParams
  const type = params.get('type')
  const lang = params.get('lang')

  if (isType(type) && isLocale(lang)) {
    const { subject, content } = TYPES[type].build(lang)
    const { html, text } = renderEmail(content, lang)
    if (params.get('format') === 'text') {
      return new NextResponse(`Objet : ${subject}\n\n${text}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY } })
    }
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY } })
  }

  const links = (Object.keys(TYPES) as TypeKey[])
    .map(
      k => `<li><b>${TYPES[k].label}</b> :
<a href="?type=${k}&lang=fr">français</a> (<a href="?type=${k}&lang=fr&format=text">texte</a>) ·
<a href="?type=${k}&lang=en">anglais</a> (<a href="?type=${k}&lang=en&format=text">texte</a>)</li>`,
    )
    .join('')
  const options = (Object.keys(TYPES) as TypeKey[]).map(k => `<option value="${k}">${TYPES[k].label}</option>`).join('')
  const sent = params.get('envoye')
  const error = params.get('erreur')
  const notice = sent ? `<p class="ok">Courriel d'essai envoyé à ${escapeHtml(sent)}. Il apparaît dans le journal des courriels une fois chez Resend.</p>` : error ? `<p class="err">${escapeHtml(error)}</p>` : ''
  return page(`<h1>Aperçu des courriels</h1>${notice}
<p class="muted">Les exemples utilisent un montant de 25 $ et un lien factice. Les courriels réels sont envoyés par le site à chaque don, demande de lien ou rappel.</p>
<h2>Voir</h2><ul>${links}</ul>
<h2>Envoyer un courriel d'essai</h2>
<p class="muted">Pour vérifier l'envoi réel (Resend, expéditeur, boîte de réception) sans passer par un don. L'objet commence par [ESSAI] ; le lien du bouton mène à « ce lien a expiré ».</p>
<form method="post"><select name="type">${options}</select><select name="lang"><option value="fr">français</option><option value="en">anglais</option></select><input type="email" name="to" placeholder="votre@courriel" required><button>Envoyer</button></form>`)
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return page('<p>Non autorisé.</p>', 403)
  if (!rateLimit(clientKey(request, 'admin-courriels'), 10, 10 * 60_000)) return page('<p>Trop d\'essais. Réessayez dans quelques minutes.</p>', 429)
  const form = await request.formData().catch(() => null)
  const type = form?.get('type')
  const lang = form?.get('lang')
  const to = validateEmail(form?.get('to'))
  const back = (qs: string) => NextResponse.redirect(new URL(`/api/admin/courriels?${qs}`, request.url), 303)
  if (!isType(type) || !isLocale(lang) || !to.ok) return back(`erreur=${encodeURIComponent('Adresse ou choix invalide.')}`)

  const { subject, content } = TYPES[type].build(lang)
  const ok = await sendEmail({ kind: TYPES[type].kind, to: to.value, locale: lang, donorId: null, subject: `[ESSAI] ${subject}`, content })
  return back(ok ? `envoye=${encodeURIComponent(to.value)}` : `erreur=${encodeURIComponent('Le courriel n\'est pas parti (clé Resend absente ou refusée : voir les journaux Vercel).')}`)
}

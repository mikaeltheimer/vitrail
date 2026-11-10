import { NextRequest, NextResponse, after } from 'next/server'
import { getDb } from '@/lib/db'
import { sendAccessRequestNotice } from '@/lib/email'
import { localeOf } from '@/lib/i18n'
import { clientKey, rateLimit } from '@/lib/ratelimit'
import { platformUrl } from '@/lib/tenant'
import { cleanChannel } from '@/lib/validate'

export const runtime = 'nodejs'

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '')

// Demande d'invitation (formulaire de la vitrine) : enregistrée, puis un avis part à Studio Existence.
// Piège à robots : le champ « site » est invisible pour un humain ; rempli, on répond « merci » sans rien enregistrer.
export async function POST(request: NextRequest) {
  if (!rateLimit(clientKey(request, 'demande'), 5, 60 * 60_000)) return NextResponse.json({ error: 'trop' }, { status: 429 })
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (clean(b.site, 200)) return NextResponse.json({ ok: true })
  const orgName = clean(b.orgName, 120)
  const name = clean(b.name, 80)
  const email = clean(b.email, 200).toLowerCase()
  const message = typeof b.message === 'string' ? b.message.trim().slice(0, 1000) : ''
  // Provenance (vitrail dont la signature a mené ici) : quelques lettres, chiffres et tirets, sinon rien
  const source = cleanChannel(b.source)
  if (orgName.length < 2) return NextResponse.json({ error: 'organisme' }, { status: 400 })
  if (name.length < 2) return NextResponse.json({ error: 'nom' }, { status: 400 })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'courriel' }, { status: 400 })

  const { error } = await getDb()
    .from('access_requests')
    .insert({ org_name: orgName, name, email, message: message || null, locale: localeOf(request), ...(source ? { source } : {}), created_at: new Date().toISOString() })
  if (error) {
    console.error('Demande d’invitation non enregistrée :', error.message)
    return NextResponse.json({ error: 'serveur' }, { status: 500 })
  }
  const studioUrl = `${platformUrl(request)}/studio`
  after(async () => {
    try {
      await sendAccessRequestNotice({ orgName, name, email, message: message || null, source, studioUrl })
    } catch (e) {
      console.error('Avis de demande non envoyé :', e)
    }
  })
  return NextResponse.json({ ok: true })
}

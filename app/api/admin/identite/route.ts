import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { forgetTenantCache, orgUrl } from '@/lib/tenant'
import { practiceOf } from '@/lib/signup'
import { IDENTITY_COLUMNS, forgetIdentity, type IdentityRow } from '@/lib/identity'
import { LEGAL_KEYS, LEGAL_MAX, missingForLaunch, type LegalInfo } from '@/lib/identity-shared'
import { validateEmail } from '@/lib/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mon vitrail (propriétaire) : les coordonnées administratives de l'organisme (site web, juridique, courriels).
// Ce qui se voit (langues, textes, logo, icône) se personnalise dans l'atelier, en contexte, puis se publie.
// Messages d'erreur en français seulement (comme le reste de l'API de la console).

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET(request: NextRequest) {
  const a = await requireAdmin(request, 'owner')
  if ('response' in a) return a.response
  const org = a.ctx.tenant.org
  if (org.practiceOf) return NextResponse.json({ practice: true })
  const { data, error } = await getDb().from('organizations').select(IDENTITY_COLUMNS).eq('id', org.id).single()
  if (error) throw error
  const r = data as unknown as IdentityRow
  const legal = (r.legal ?? {}) as Partial<LegalInfo>
  const atelier = await practiceOf(org.id)
  return NextResponse.json(
    {
      practice: false,
      websiteUrl: r.website_url ?? '',
      legal,
      senderName: r.sender_name ?? '',
      replyTo: r.reply_to ?? '',
      orgName: r.name_fr,
      missing: missingForLaunch(legal),
      // L'atelier : où personnaliser le vitrail, et s'il y a un brouillon qui attend d'être publié
      atelierUrl: atelier ? orgUrl(atelier.slug, '/vitrail?atelier', request) : null,
      pending: !!r.draft,
      publishedAt: r.published_at ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

const clean = (v: unknown, max: number): string | null => {
  if (v == null) return ''
  if (typeof v !== 'string') return null
  const s = v.replace(/\r\n/g, '\n').trim()
  return s.length > max ? null : s
}

/** Site web : https://… seulement (le lien est cliquable sur les pages publiques). */
function cleanUrl(v: unknown): string | null | false {
  const s = clean(v, 200)
  if (s === null) return false
  if (!s) return null
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    if (!u.hostname.includes('.')) return false
    return u.toString()
  } catch {
    return false
  }
}

// Coordonnées administratives seulement (site web, juridique, courriels) : publiées tout de suite, sans brouillon.
// Langues, textes, logo et icône se modifient dans l'atelier (app/api/atelier).
export async function POST(request: NextRequest) {
  const a = await requireAdmin(request, 'owner')
  if ('response' in a) return a.response
  const org = a.ctx.tenant.org
  if (org.practiceOf) return fail("Les coordonnées se modifient depuis la console de l'organisme.")
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const website = cleanUrl(b.websiteUrl)
  if (website === false) return fail('Adresse du site web invalide (ex. : https://monorganisme.org).')

  const inLegal = (b.legal ?? {}) as Record<string, unknown>
  const legal: Partial<LegalInfo> = {}
  for (const k of LEGAL_KEYS) {
    const v = clean(inLegal[k], LEGAL_MAX[k])
    if (v === null) return fail(`Coordonnée trop longue : ${LEGAL_MAX[k]} caractères au plus.`)
    if (v) legal[k] = v
  }
  if (legal.officerEmail) {
    const e = validateEmail(legal.officerEmail)
    if (!e.ok) return fail('Courriel du responsable des renseignements personnels invalide.')
    legal.officerEmail = e.value
  }
  const { data: cur, error: curErr } = await getDb().from('organizations').select('legal').eq('id', org.id).single()
  if (curErr) throw curErr
  // La date de mise à jour des pages juridiques suit les coordonnées : elle change quand elles changent
  const before = (cur.legal ?? {}) as Partial<LegalInfo>
  const changed = LEGAL_KEYS.some(k => (before[k] ?? '') !== (legal[k] ?? ''))
  legal.updated = changed || !before.updated ? new Date().toISOString().slice(0, 10) : before.updated

  const senderName = clean(b.senderName, 80)
  if (senderName === null) return fail("Nom d'expéditeur trop long (80 caractères au plus).")
  let replyTo: string | null = null
  if (b.replyTo) {
    const e = validateEmail(b.replyTo)
    if (!e.ok) return fail('Adresse de réponse invalide.')
    replyTo = e.value
  }

  const { error } = await getDb().from('organizations').update({ website_url: website, legal, sender_name: senderName || null, reply_to: replyTo }).eq('id', org.id)
  if (error) throw error
  forgetTenantCache()
  forgetIdentity()
  return NextResponse.json({ ok: true, missing: missingForLaunch(legal) })
}

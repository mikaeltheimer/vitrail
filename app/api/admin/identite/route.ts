import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { forgetTenantCache } from '@/lib/tenant'
import { IDENTITY_COLUMNS, assetUrl, forgetIdentity, type IdentityRow } from '@/lib/identity'
import { LEGAL_KEYS, LEGAL_MAX, TEXT_FIELDS, TEXT_MAX, missingForLaunch, parseLocales, type LegalInfo, type StoredTexts } from '@/lib/identity-shared'
import { validateEmail } from '@/lib/validate'
import { isLocale, type Locale } from '@/i18n/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mon vitrail (propriétaire) : l'identité de l'organisme telle qu'il la rédige. L'entraînement n'en a pas : il montre celle
// de l'organisme réel, qu'on modifie depuis la console de l'organisme réel.
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
  return NextResponse.json(
    {
      practice: false,
      locales: parseLocales(r.locales),
      texts: r.texts ?? {},
      fallbackName: r.name_fr,
      websiteUrl: r.website_url ?? '',
      legal,
      senderName: r.sender_name ?? '',
      replyTo: r.reply_to ?? '',
      logoUrl: assetUrl(r.logo_path),
      iconUrl: assetUrl(r.icon_path),
      missing: missingForLaunch(legal),
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

export async function POST(request: NextRequest) {
  const a = await requireAdmin(request, 'owner')
  if ('response' in a) return a.response
  const org = a.ctx.tenant.org
  if (org.practiceOf) return fail("L'entraînement reprend l'identité de l'organisme : modifiez-la depuis sa console.")
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>

  // Langues : une ou deux, la première est la langue principale
  const rawLocales = Array.isArray(b.locales) ? b.locales : []
  const locales = [...new Set(rawLocales.filter(isLocale))] as Locale[]
  if (!locales.length || locales.length !== rawLocales.length) return fail('Choisissez au moins une langue.')

  // Textes de chaque langue offerte (ceux d'une langue retirée sont gardés, au cas où on la rajoute)
  const inTexts = (b.texts ?? {}) as Record<string, Record<string, unknown>>
  const { data: cur, error: curErr } = await getDb().from('organizations').select('texts,name_fr,legal').eq('id', org.id).single()
  if (curErr) throw curErr
  const texts: StoredTexts = { ...((cur.texts as StoredTexts | null) ?? {}) }
  for (const l of locales) {
    const src = inTexts[l] ?? {}
    const out: Partial<Record<(typeof TEXT_FIELDS)[number], string>> = {}
    for (const f of TEXT_FIELDS) {
      const v = clean(src[f], TEXT_MAX[f])
      if (v === null) return fail(`Texte trop long (${f}, ${l}) : ${TEXT_MAX[f]} caractères au plus.`)
      if (v) out[f] = v
    }
    texts[l] = out
  }
  const primary = locales[0]
  const name = texts[primary]?.name
  if (!name || name.length < 2) return fail("Le nom de l'organisme est obligatoire dans la langue principale.")

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

  const { error } = await getDb()
    .from('organizations')
    .update({ locales, texts, name_fr: name, website_url: website, legal, sender_name: senderName || null, reply_to: replyTo })
    .eq('id', org.id)
  if (error) throw error
  // L'entraînement porte le même nom (en-tête de sa console)
  await getDb().from('organizations').update({ name_fr: name }).eq('practice_of', org.id)
  forgetTenantCache()
  forgetIdentity()
  return NextResponse.json({ ok: true, missing: missingForLaunch(legal) })
}

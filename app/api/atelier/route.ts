import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { assetUrl } from '@/lib/identity'
import { discardDraft, loadDraft, publishDraft, saveDraft, validateLocales, validateTexts } from '@/lib/atelier'
import type { Locale } from '@/i18n/config'
import type { StoredTexts } from '@/lib/identity-shared'
import { failer } from '@/lib/errors'
import { getOrg, orgUrl } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// L'atelier (vitrail d'entraînement, propriétaire) : brouillon de l'identité, publication, abandon.
//   GET : le brouillon (ou la version publiée), et s'il attend d'être publié. 403 pour qui n'est pas propriétaire.
//   POST { action: 'save', locales?, texts? } | { action: 'publish' } | { action: 'discard' }
// Messages d'erreur en français seulement (comme le reste de l'API de la console).


async function guard(request: NextRequest) {
  const a = await requireAdmin(request, 'owner')
  if ('response' in a) return { response: a.response }
  const org = a.ctx.tenant.org
  if (!org.practiceOf) return { response: failer(request)('dansAtelier', 404) }
  return { orgId: org.practiceOf, atelierId: org.id }
}

/** Photos et témoignages de l'atelier qui attendent l'approbation (pastille de la barre de l'atelier). */
async function toModerate(atelierId: string): Promise<number> {
  const { count, error } = await getDb()
    .from('donors')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', atelierId)
    .eq('hidden', false)
    .or('photo_status.eq.pending,message_status.eq.pending')
  if (error) return 0
  return count ?? 0
}

/** Retour à la console de l'organisme réel (sous-domaine, ou ?org= en prévisualisation). */
async function consoleUrl(orgId: string, request: NextRequest): Promise<string | null> {
  const org = await getOrg(orgId)
  return org ? orgUrl(org.slug, '/admin', request) : null
}

async function state(orgId: string, atelierId: string, request: NextRequest) {
  const { draft, pending, fallbackName } = await loadDraft(orgId)
  return {
    consoleUrl: await consoleUrl(orgId, request),
    toModerate: await toModerate(atelierId),
    pending,
    fallbackName,
    locales: draft.locales,
    texts: draft.texts,
    logoUrl: assetUrl(draft.logo_path),
    iconUrl: assetUrl(draft.icon_path),
  }
}

export async function GET(request: NextRequest) {
  const g = await guard(request)
  if ('response' in g) return g.response
  return NextResponse.json(await state(g.orgId, g.atelierId, request), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const g = await guard(request)
  if ('response' in g) return g.response
  const fail = failer(request)
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (b.action === 'save') {
    const patch: { locales?: Locale[]; texts?: StoredTexts } = {}
    if (b.locales !== undefined) {
      const l = validateLocales(b.locales)
      if (!l) return fail('languesChoisir')
      patch.locales = l
    }
    if (b.texts !== undefined) {
      const t = validateTexts(b.texts)
      if (!t.ok) return fail(t.error)
      patch.texts = t.texts
    }
    await saveDraft(g.orgId, patch)
    return NextResponse.json(await state(g.orgId, g.atelierId, request))
  }
  if (b.action === 'publish') {
    const { draft, fallbackName } = await loadDraft(g.orgId)
    const name = (draft.texts[draft.locales[0]]?.name || fallbackName || '').trim()
    if (name.length < 2) return fail('nomOrganismeRequis')
    const r = await publishDraft(g.orgId)
    if (!r.ok) return fail('rienAPublier')
    return NextResponse.json(await state(g.orgId, g.atelierId, request))
  }
  if (b.action === 'discard') {
    await discardDraft(g.orgId)
    return NextResponse.json(await state(g.orgId, g.atelierId, request))
  }
  return fail('actionInconnue')
}

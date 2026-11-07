import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { assetUrl } from '@/lib/identity'
import { discardDraft, loadDraft, publishDraft, saveDraft, validateLocales, validateTexts } from '@/lib/atelier'
import type { Locale } from '@/i18n/config'
import type { StoredTexts } from '@/lib/identity-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// L'atelier (vitrail d'entraînement, propriétaire) : brouillon de l'identité, publication, abandon.
//   GET : le brouillon (ou la version publiée), et s'il attend d'être publié. 403 pour qui n'est pas propriétaire.
//   POST { action: 'save', locales?, texts? } | { action: 'publish' } | { action: 'discard' }
// Messages d'erreur en français seulement (comme le reste de l'API de la console).

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

async function guard(request: NextRequest) {
  const a = await requireAdmin(request, 'owner')
  if ('response' in a) return { response: a.response }
  const org = a.ctx.tenant.org
  if (!org.practiceOf) return { response: fail("La personnalisation se fait dans l'atelier.", 404) }
  return { orgId: org.practiceOf }
}

async function state(orgId: string) {
  const { draft, pending, fallbackName } = await loadDraft(orgId)
  return {
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
  return NextResponse.json(await state(g.orgId), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const g = await guard(request)
  if ('response' in g) return g.response
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (b.action === 'save') {
    const patch: { locales?: Locale[]; texts?: StoredTexts } = {}
    if (b.locales !== undefined) {
      const l = validateLocales(b.locales)
      if (!l) return fail('Choisissez une ou deux langues.')
      patch.locales = l
    }
    if (b.texts !== undefined) {
      const t = validateTexts(b.texts)
      if (!t.ok) return fail(t.error)
      patch.texts = t.texts
    }
    await saveDraft(g.orgId, patch)
    return NextResponse.json(await state(g.orgId))
  }
  if (b.action === 'publish') {
    const { draft, fallbackName } = await loadDraft(g.orgId)
    const name = (draft.texts[draft.locales[0]]?.name || fallbackName || '').trim()
    if (name.length < 2) return fail("Le nom de l'organisme est obligatoire dans la langue principale.")
    const r = await publishDraft(g.orgId)
    if (!r.ok) return fail('Rien à publier.')
    return NextResponse.json(await state(g.orgId))
  }
  if (b.action === 'discard') {
    await discardDraft(g.orgId)
    return NextResponse.json(await state(g.orgId))
  }
  return fail('Action inconnue.')
}

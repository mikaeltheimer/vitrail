import { NextRequest, NextResponse } from 'next/server'
import { studioAccount } from '@/lib/studio'
import { demoState, generateDemo, removeDemoPhotos } from '@/lib/demo'
import { DEMO_SLUG } from '@/lib/demo-data'
import { orgUrl } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Vitrail de démonstration (comptes is_studio) : état, (re)génération des donateurs fictifs, retrait des photos.
// Section Studio : en français seulement.

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status }) // i18n-ok : section Studio (FR)

const withLinks = (request: NextRequest, state: Awaited<ReturnType<typeof demoState>>) => ({
  ...state,
  links: state.exists ? { vitrail: orgUrl(DEMO_SLUG, '/vitrail', request), ecran: orgUrl(DEMO_SLUG, '/ecran', request), screen: orgUrl(DEMO_SLUG, '/screen', request) } : null,
})

export async function GET(request: NextRequest) {
  if (!(await studioAccount(request))) return fail('Réservé à Studio Existence.', 403) // i18n-ok : section Studio (FR)
  try {
    return NextResponse.json(withLinks(request, await demoState()))
  } catch (e) {
    return fail((e as Error).message, 500)
  }
}

export async function POST(request: NextRequest) {
  if (!(await studioAccount(request))) return fail('Réservé à Studio Existence.', 403) // i18n-ok : section Studio (FR)
  const b = (await request.json().catch(() => ({}))) as { action?: unknown }
  try {
    if (b.action === 'generate') return NextResponse.json(withLinks(request, await generateDemo()))
    if (b.action === 'removePhotos') {
      await removeDemoPhotos()
      return NextResponse.json(withLinks(request, await demoState()))
    }
    return fail('Action inconnue.') // i18n-ok : section Studio (FR)
  } catch (e) {
    console.error('Démo :', e)
    return fail((e as Error).message, 500)
  }
}

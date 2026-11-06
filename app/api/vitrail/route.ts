import { NextRequest, NextResponse } from 'next/server'
import { err, errorResponse } from '@/lib/errors'
import { getSnapshot } from '@/lib/donations'
import { campaignParam, requireTenant } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Instantané public du vitrail. Interrogé toutes les quelques secondes par l'écran d'affichage. */
export async function GET(request: NextRequest) {
  try {
    // L'organisme vient de l'adresse (jamais d'un cookie : cette réponse est mise en cache pour tous) ; la campagne, de ?v=
    const t = await requireTenant(request, campaignParam(request.nextUrl.searchParams.get('v')))
    if ('response' in t) return t.response
    const snapshot = await getSnapshot(t.tenant)
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=4', Vary: 'Host' } })
  } catch (e) {
    console.error('Instantané impossible :', e)
    return errorResponse(request, err('indisponible'), 503)
  }
}

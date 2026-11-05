import { NextRequest, NextResponse } from 'next/server'
import { err, errorResponse } from '@/lib/errors'
import { getSnapshot } from '@/lib/donations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Instantané public du vitrail. Interrogé toutes les quelques secondes par l'écran d'affichage. */
export async function GET(request: NextRequest) {
  try {
    const snapshot = await getSnapshot()
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=4' } })
  } catch (e) {
    console.error('Instantané impossible :', e)
    return errorResponse(request, err('indisponible'), 503)
  }
}

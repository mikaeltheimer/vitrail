import { NextResponse } from 'next/server'
import { getSnapshot } from '@/lib/donations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Instantané public du vitrail. Interrogé toutes les quelques secondes par l'écran d'affichage. */
export async function GET() {
  try {
    const snapshot = await getSnapshot()
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=4' } })
  } catch (e) {
    console.error('Instantané impossible :', e)
    return NextResponse.json({ error: 'Indisponible' }, { status: 503 })
  }
}

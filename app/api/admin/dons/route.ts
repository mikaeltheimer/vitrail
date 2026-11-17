import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { internalError } from '@/lib/errors'
import { parseFilter } from '@/lib/journal'
import { donationJournal } from '@/lib/journal-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Journal des dons (console, onglet Dons) : les dons d'une période et leur résumé, dans CET organisme seulement.
// ?du=&au= (heure de l'organisme, « au » exclu), ?paiement=, ?provenance=, ?q=. Les frais Stripe à la charge de
// l'organisme sont réservés au propriétaire ; les contributions des donateurs ne sont jamais renvoyées ici.
export async function GET(request: NextRequest) {
  const a = await requireAdmin(request)
  if ('response' in a) return a.response
  try {
    const body = await donationJournal(a.ctx.tenant.org.id, parseFilter(request.nextUrl.searchParams), a.ctx.role === 'owner')
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return internalError(request, 'Journal des dons', e)
  }
}

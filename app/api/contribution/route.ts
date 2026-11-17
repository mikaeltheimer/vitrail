import { NextRequest, NextResponse } from 'next/server'
import { campaignParam, requireTenant } from '@/lib/tenant'
import { contributionSettingsFor, stripeFeeEstimateFor } from '@/lib/contribution'
import { platformSettings } from '@/lib/platform-settings'
import { billingStateOf } from '@/lib/platform-fee'
import { getDb } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Ce qu'il faut au panneau de don pour le bloc de contribution (spécification du 16 novembre 2026, section 2.1) :
 * les tranches et le menu, l'estimation des frais Stripe, et deux oui/non sur l'organisme, rien de plus.
 * - commissionRate : taux de la commission qui s'appliquerait à ce don (0 avant le 100e donateur, une fois acquitté,
 *   pour un organisme exempté ou une campagne). Sert seulement à dire si la contribution couvre TOUT.
 * - charity : l'organisme a un numéro d'organisme de bienfaisance (mention du reçu fiscal sur la ligne du don).
 * Le serveur recalcule tout à la création du paiement : rien de ceci n'est cru sur parole.
 */
export async function GET(request: NextRequest) {
  const r = await requireTenant(request, campaignParam(request.nextUrl.searchParams.get('campaign')))
  if ('response' in r) return r.response
  const { org, vitrail } = r.tenant
  const schedule = org.feeSchedule
  const settings = await platformSettings()
  const contribution = contributionSettingsFor(settings.contribution, schedule.contributionBrackets)
  const stripeFeeEstimate = stripeFeeEstimateFor(contribution.stripeFeeEstimate, schedule.stripeFeeEstimate)

  let commissionRate = 0
  if (schedule.model === 'capped' && vitrail.kind === 'permanent') {
    const state = await billingStateOf(org.id).catch(() => null)
    if (state && !state.settled) {
      if (state.thresholdReached || state.donorsCounted >= schedule.freeDonors) commissionRate = schedule.rate
    }
  }

  const { data } = await getDb().from('organizations').select('legal').eq('id', org.practiceOf ?? org.id).maybeSingle()
  const legal = (data?.legal ?? {}) as Record<string, unknown>
  const charity = typeof legal.charityNumber === 'string' && legal.charityNumber.trim().length > 0

  return NextResponse.json(
    { version: contribution.version, brackets: contribution.brackets, menuRates: contribution.menuRates, stripeFeeEstimate, commissionRate, charity },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

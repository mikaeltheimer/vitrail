import type Stripe from 'stripe'
import { getDb } from './db'
import { taxIncludedCents, taxProvinceFor } from './tax'
import { platformSettings } from './platform-settings'

// Règlement d'un don Stripe, appelé par le webhook une fois le don enregistré (spécification du 16 novembre 2026).
//
// 1. Frais Stripe réels : lus sur la balance transaction du paiement (compte de l'organisme). Ils servent à recalculer
//    le surplus de la contribution : s'ils dépassent l'estimation, la différence est rendue à l'organisme (Mika, 16 nov. :
//    la contribution couvre d'abord les frais réels ; tout le reste va à Donivers ; l'organisme reçoit le don).
// 2. settle_platform_fee (SQL, sous verrou par organisme) : part de l'organisme bornée par le plafond, verrous.
// 3. L'excédent est rendu chez Stripe (remboursement partiel de la commission), avec une clé d'idempotence.
// 4. Taxes comprises dans ce que garde Donivers, pour les remises.
//
// Tout est idempotent : un webhook rejoué retrouve le règlement fait et ne rend rien de plus. Une erreur remonte
// (le webhook répond 500, Stripe rejoue).

type SettleApi = Pick<Stripe, 'paymentIntents' | 'applicationFees'>

/**
 * Frais Stripe réels d'un paiement direct, tels que pris sur le compte de l'organisme. Sur la balance transaction du compte
 * connecté, « fee » compte AUSSI la commission de Donivers : on ne garde que les frais de Stripe et les taxes sur ces frais.
 * null si Stripe ne les donne pas encore (paiement différé) : le surplus estimé est alors gardé tel quel.
 */
export function stripeFeeOf(bt: Pick<Stripe.BalanceTransaction, 'fee_details'> | null | undefined): number | null {
  if (!bt?.fee_details) return null
  return bt.fee_details.filter(f => f.type === 'stripe_fee' || f.type === 'tax').reduce((sum, f) => sum + f.amount, 0)
}

export interface SettleInput {
  donationId: string
  accountId: string
  paymentIntentId: string | null
  /** Contribution du donateur (C) : les frais réels ne servent que s'il y en a une. */
  contributionCents: number
  orgProvince: string | null
}

export interface SettleOutcome {
  waivedCents: number
  surplusCents: number
  settledNow: boolean
  alreadySettled: boolean
}

export async function settleDonation(stripe: SettleApi, i: SettleInput): Promise<SettleOutcome> {
  let charge: Stripe.Charge | null = null
  if (i.paymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(i.paymentIntentId, { expand: ['latest_charge.balance_transaction'] }, { stripeAccount: i.accountId })
    charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null
  }
  const bt = charge?.balance_transaction && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null
  const actualFee = i.contributionCents > 0 ? stripeFeeOf(bt) : null

  const db = getDb()
  const { data, error } = await db.rpc('settle_platform_fee', { p_donation: i.donationId, p_stripe_fee_actual: actualFee })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { waived_cents: number; surplus_cents: number; settled_now: boolean; already_settled: boolean } | undefined
  if (!row) throw new Error(`Règlement sans résultat : ${i.donationId}`)

  const { data: don, error: readError } = await db.from('donations').select('platform_fee_cents,platform_fee_refunded_cents,platform_fee_waived_cents').eq('id', i.donationId).maybeSingle()
  if (readError) throw readError
  const feeCents = Number(don?.platform_fee_cents ?? 0)
  const waived = Number(don?.platform_fee_waived_cents ?? row.waived_cents)

  // Excédent rendu chez Stripe : ce qui doit être rendu au total (excédent + part des remboursements déjà faits), moins
  // ce que Stripe a déjà rendu sur cette commission
  const feeId = typeof charge?.application_fee === 'string' ? charge.application_fee : charge?.application_fee?.id
  if (waived > 0 && feeId) {
    const fee = await stripe.applicationFees.retrieve(feeId)
    const target = Math.min(fee.amount, waived + Number(don?.platform_fee_refunded_cents ?? 0))
    const delta = target - fee.amount_refunded
    if (delta > 0) await stripe.applicationFees.createRefund(feeId, { amount: delta }, { idempotencyKey: `fee-waive-${i.donationId}-${target}` })
  } else if (waived > 0) {
    console.error('Excédent à rendre, mais aucune commission Stripe trouvée :', i.donationId, waived)
  }

  // Taxes comprises dans ce que garde Donivers (S + P), au taux de la province retenue (lib/tax.ts)
  const province = taxProvinceFor({ orgProvince: i.orgProvince })
  const kept = Math.max(0, feeCents - waived)
  const { taxRates } = await platformSettings()
  const { error: taxError } = await db
    .from('donations')
    .update({ tax_province: province, tax_included_cents: taxIncludedCents(kept, province, taxRates) })
    .eq('id', i.donationId)
  if (taxError) throw taxError

  return { waivedCents: waived, surplusCents: row.surplus_cents, settledNow: row.settled_now, alreadySettled: row.already_settled }
}

import type Stripe from 'stripe'
import { getDb } from './db'

/**
 * Remboursement d'un paiement (webhook charge.refunded) : met à jour `refunded_cents` du don.
 * Idempotent : on pose la valeur totale remboursée selon Stripe, on ne l'additionne pas, donc rejouer l'événement ne change rien.
 *
 * Le paiement Stripe comprend les frais couverts par le donateur (fee_cents), le don non. Remboursement total = tout le don.
 * Remboursement partiel = la même proportion du don (les frais en font partie au prorata).
 * Un morceau dont le don net tombe à zéro disparaît du vitrail (vues vitrail_* de la base).
 */
export async function applyRefund(orgId: string, providerRef: string, chargeAmount: number, amountRefunded: number): Promise<{ outcome: 'updated' | 'unchanged' | 'unknown'; donationId?: string }> {
  const db = getDb()
  const { data: donation, error } = await db.from('donations').select('id,amount_cents,fee_cents,refunded_cents').eq('organization_id', orgId).eq('provider_ref', providerRef).maybeSingle()
  if (error) throw error
  if (!donation) return { outcome: 'unknown' }
  const amount = Number(donation.amount_cents)
  const paid = chargeAmount > 0 ? chargeAmount : amount + Number(donation.fee_cents ?? 0)
  const refunded = amountRefunded >= paid ? amount : Math.min(amount, Math.round((amountRefunded * amount) / paid))
  if (refunded === Number(donation.refunded_cents)) return { outcome: 'unchanged', donationId: donation.id }
  const { error: updateError } = await db.from('donations').update({ refunded_cents: refunded }).eq('id', donation.id)
  if (updateError) throw updateError
  return { outcome: 'updated', donationId: donation.id }
}

type FeeApi = Pick<Stripe, 'applicationFees'>

/**
 * Rend à l'organisme la part de notre commission correspondant au remboursement. Un remboursement fait par
 * l'organisme depuis son tableau de bord ne rembourse PAS notre commission : c'est à nous de le faire.
 *
 * Idempotent, sans dépendre de la base : la vérité est ce que Stripe a déjà remboursé sur cette commission. On vise
 * la part due (proportionnelle à la part remboursée du paiement) et on ne rembourse que l'écart. Si l'organisme a déjà
 * fait rembourser la commission lui-même, l'écart est nul. Renvoie le total rendu après l'opération, ou null (pas de commission).
 */
export async function refundPlatformFee(
  stripe: FeeApi,
  charge: { id: string; amount: number; amount_refunded: number; application_fee?: string | { id: string } | null },
  donationId: string | undefined,
): Promise<number | null> {
  const feeId = typeof charge.application_fee === 'string' ? charge.application_fee : charge.application_fee?.id
  if (!feeId) return null
  const fee = await stripe.applicationFees.retrieve(feeId)
  const ratio = charge.amount > 0 ? Math.min(1, charge.amount_refunded / charge.amount) : 1
  const due = ratio >= 1 ? fee.amount : Math.round(fee.amount * ratio)
  const delta = due - fee.amount_refunded
  if (delta > 0) {
    await stripe.applicationFees.createRefund(feeId, { amount: delta }, { idempotencyKey: `fee-refund-${charge.id}-${due}` })
  }
  const returned = Math.max(due, fee.amount_refunded)
  if (donationId) {
    const { error } = await getDb().from('donations').update({ platform_fee_refunded_cents: Math.min(returned, fee.amount) }).eq('id', donationId)
    if (error) throw error
  }
  return returned
}

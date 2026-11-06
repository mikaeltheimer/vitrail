import type Stripe from 'stripe'
import { getDb } from './db'

/**
 * Argent repris au donateur (webhook charge.refunded, remboursement depuis la console, litige perdu) : met à jour `refunded_cents`.
 * Idempotent : on pose la valeur totale reprise selon Stripe, on ne l'additionne pas, donc rejouer l'événement ne change rien.
 *
 * Repris = ce que Stripe a remboursé + la part perdue dans un litige (`dispute_lost_cents`, déjà en base). Les deux sont des
 * montants du PAIEMENT, qui comprend les frais couverts par le donateur (fee_cents) ; le don non. Tout repris = tout le don ;
 * en partie = la même proportion du don. Un morceau dont le don net tombe à zéro disparaît du vitrail (vues vitrail_*).
 */
export async function applyRefund(orgId: string, providerRef: string, chargeAmount: number, amountRefunded: number): Promise<{ outcome: 'updated' | 'unchanged' | 'unknown'; donationId?: string; reversedCents?: number }> {
  const db = getDb()
  const { data: donation, error } = await db.from('donations').select('id,amount_cents,fee_cents,refunded_cents,dispute_lost_cents').eq('organization_id', orgId).eq('provider_ref', providerRef).maybeSingle()
  if (error) throw error
  if (!donation) return { outcome: 'unknown' }
  const amount = Number(donation.amount_cents)
  const paid = chargeAmount > 0 ? chargeAmount : amount + Number(donation.fee_cents ?? 0)
  const reversed = Math.min(paid, amountRefunded + Number(donation.dispute_lost_cents ?? 0))
  const refunded = reversed >= paid ? amount : Math.min(amount, Math.round((reversed * amount) / paid))
  if (refunded === Number(donation.refunded_cents)) return { outcome: 'unchanged', donationId: donation.id, reversedCents: reversed }
  const { error: updateError } = await db.from('donations').update({ refunded_cents: refunded }).eq('id', donation.id)
  if (updateError) throw updateError
  return { outcome: 'updated', donationId: donation.id, reversedCents: reversed }
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

type RefundApi = Pick<Stripe, 'checkout' | 'refunds' | 'applicationFees'>

export type ConsoleRefundResult =
  | { ok: true; refundedCents: number; chargeRefundedCents: number; chargeAmountCents: number }
  | { ok: false; reason: 'unknown' | 'not_stripe' | 'no_account' | 'not_found' | 'disputed' | 'nothing_left' | 'bad_amount' | 'failed'; remainingCents?: number }

/**
 * Remboursement lancé depuis notre console (pas depuis le tableau de bord Stripe).
 *
 * - Le don doit appartenir à l'organisme et être un paiement Stripe sur SON compte connecté (jamais celui d'un autre).
 * - `amountCents` est un montant du PAIEMENT (don + frais couverts par le donateur) ; null = tout ce qui reste.
 * - `refund_application_fee` : Stripe rend en même temps la part proportionnelle de notre commission.
 * - Ensuite, la base est mise à jour tout de suite (même calcul que le webhook, donc le webhook qui suivra ne changera rien) ;
 *   si cette mise à jour échoue, le webhook charge.refunded la refera.
 * - Clé d'idempotence liée à l'état du paiement : un double clic ne rembourse pas deux fois.
 * Les frais de Stripe ne sont pas rendus par Stripe : ils restent à la charge de l'organisme.
 */
export async function refundDonationFromConsole(
  stripe: RefundApi,
  orgId: string,
  accountId: string | null,
  donationId: string,
  amountCents: number | null,
): Promise<ConsoleRefundResult> {
  if (!accountId) return { ok: false, reason: 'no_account' }
  const { data: donation, error } = await getDb().from('donations').select('id,source,provider_ref').eq('organization_id', orgId).eq('id', donationId).maybeSingle()
  if (error) throw error
  if (!donation) return { ok: false, reason: 'unknown' }
  if (donation.source !== 'stripe' || !donation.provider_ref) return { ok: false, reason: 'not_stripe' }

  const session = await stripe.checkout.sessions.retrieve(donation.provider_ref as string, { expand: ['payment_intent.latest_charge'] }, { stripeAccount: accountId })
  const intent = session.payment_intent && typeof session.payment_intent === 'object' ? session.payment_intent : null
  const charge = intent?.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null
  if (!intent || !charge) return { ok: false, reason: 'not_found' }
  // Stripe refuse de rembourser un paiement contesté : le litige se règle dans le tableau de bord Stripe
  if (charge.disputed) return { ok: false, reason: 'disputed' }

  const remaining = charge.amount - charge.amount_refunded
  if (remaining <= 0) return { ok: false, reason: 'nothing_left' }
  const amount = amountCents ?? remaining
  if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) return { ok: false, reason: 'bad_amount', remainingCents: remaining }

  const refund = await stripe.refunds.create(
    { payment_intent: intent.id, amount, refund_application_fee: true, reason: 'requested_by_customer', metadata: { donationId, source: 'console' } },
    { stripeAccount: accountId, idempotencyKey: `console-refund-${donationId}-${charge.amount_refunded}-${amount}` },
  )
  if (refund.status === 'failed' || refund.status === 'canceled') return { ok: false, reason: 'failed' }

  const chargeRefunded = charge.amount_refunded + amount
  try {
    const applied = await applyRefund(orgId, donation.provider_ref as string, charge.amount, chargeRefunded)
    await refundPlatformFee(stripe, { ...charge, amount_refunded: applied.reversedCents ?? chargeRefunded }, applied.donationId)
  } catch (e) {
    // L'argent est déjà rendu chez Stripe : on ne renvoie pas d'erreur, le webhook mettra la base à jour
    console.error('Remboursement fait chez Stripe, base pas encore à jour (le webhook s\'en chargera) :', e)
  }
  return { ok: true, refundedCents: amount, chargeRefundedCents: chargeRefunded, chargeAmountCents: charge.amount }
}

type ReconcileApi = Pick<Stripe, 'charges' | 'checkout' | 'applicationFees'>

/**
 * Relit un paiement chez Stripe (sur le compte de l'organisme) et remet le don en accord : part reprise et commission rendue.
 * Sert après un litige ou un remboursement qui change d'état (échec après coup). Le paiement fait foi, pas l'événement.
 * Renvoie 'unknown' si le paiement n'est pas un don de cet organisme (ou pas encore enregistré).
 */
export async function reconcileCharge(stripe: ReconcileApi, orgId: string, accountId: string, chargeId: string): Promise<'updated' | 'unchanged' | 'unknown' | 'pending'> {
  const charge = await stripe.charges.retrieve(chargeId, {}, { stripeAccount: accountId })
  const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!intent) return 'unknown'
  const session = (await stripe.checkout.sessions.list({ payment_intent: intent, limit: 1 }, { stripeAccount: accountId })).data[0]
  if (!session) return 'unknown'
  const applied = await applyRefund(orgId, session.id, charge.amount, charge.amount_refunded)
  if (applied.outcome === 'unknown') return session.metadata?.orgId === orgId ? 'pending' : 'unknown'
  await refundPlatformFee(stripe, { ...charge, amount_refunded: applied.reversedCents ?? charge.amount_refunded }, applied.donationId)
  return applied.outcome
}

const DISPUTE_STATUS: Record<string, 'open' | 'won' | 'lost' | null> = {
  warning_needs_response: 'open',
  warning_under_review: 'open',
  needs_response: 'open',
  under_review: 'open',
  won: 'won',
  lost: 'lost',
  prevented: null, // résolu sans litige formel
  warning_closed: null, // demande de renseignements close sans litige
}

/**
 * Litige ouvert, mis à jour ou clos (événements charge.dispute.*) : on note son état sur le don, puis on remet le don en accord.
 * Perdu : la somme contestée compte comme reprise au donateur (le morceau rétrécit ou disparaît) et notre commission est rendue
 * au prorata. Gagné, ou clos sans litige : rien n'est repris.
 */
export async function recordDispute(
  stripe: ReconcileApi,
  orgId: string,
  accountId: string,
  dispute: Pick<Stripe.Dispute, 'id' | 'status' | 'amount' | 'charge'> & { evidence_details?: { due_by?: number | null } | null },
): Promise<'updated' | 'unchanged' | 'unknown' | 'pending'> {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id
  const charge = await stripe.charges.retrieve(chargeId, {}, { stripeAccount: accountId })
  const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!intent) return 'unknown'
  const session = (await stripe.checkout.sessions.list({ payment_intent: intent, limit: 1 }, { stripeAccount: accountId })).data[0]
  if (!session) return 'unknown'
  const status = DISPUTE_STATUS[dispute.status] ?? null
  const dueBy = dispute.evidence_details?.due_by
  const { data, error } = await getDb()
    .from('donations')
    .update({
      dispute_id: dispute.id,
      dispute_status: status,
      dispute_due_by: status === 'open' && dueBy ? new Date(dueBy * 1000).toISOString() : null,
      dispute_lost_cents: status === 'lost' ? dispute.amount : 0,
    })
    .eq('organization_id', orgId)
    .eq('provider_ref', session.id)
    .select('id')
  if (error) throw error
  if (!data?.length) return session.metadata?.orgId === orgId ? 'pending' : 'unknown'
  const applied = await applyRefund(orgId, session.id, charge.amount, charge.amount_refunded)
  await refundPlatformFee(stripe, { ...charge, amount_refunded: applied.reversedCents ?? charge.amount_refunded }, applied.donationId)
  return applied.outcome
}

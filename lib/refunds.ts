import { getDb } from './db'

/**
 * Remboursement d'un paiement (webhook charge.refunded) : met à jour `refunded_cents` du don.
 * Idempotent : on pose la valeur totale remboursée selon Stripe, on ne l'additionne pas, donc rejouer l'événement ne change rien.
 *
 * Le paiement Stripe comprend les frais couverts par le donateur (fee_cents), le don non. Remboursement total = tout le don.
 * Remboursement partiel = la même proportion du don (les frais en font partie au prorata).
 * Un morceau dont le don net tombe à zéro disparaît du vitrail (vues vitrail_* de la base).
 */
export async function applyRefund(providerRef: string, chargeAmount: number, amountRefunded: number): Promise<'updated' | 'unchanged' | 'unknown'> {
  const db = getDb()
  const { data: donation, error } = await db.from('donations').select('id,amount_cents,fee_cents,refunded_cents').eq('provider_ref', providerRef).maybeSingle()
  if (error) throw error
  if (!donation) return 'unknown'
  const amount = Number(donation.amount_cents)
  const paid = chargeAmount > 0 ? chargeAmount : amount + Number(donation.fee_cents ?? 0)
  const refunded = amountRefunded >= paid ? amount : Math.min(amount, Math.round((amountRefunded * amount) / paid))
  if (refunded === Number(donation.refunded_cents)) return 'unchanged'
  const { error: updateError } = await db.from('donations').update({ refunded_cents: refunded }).eq('id', donation.id)
  if (updateError) throw updateError
  return 'updated'
}

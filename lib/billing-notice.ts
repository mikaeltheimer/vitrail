import { getDb } from './db'
import { sendThresholdNotice } from './email'
import { getIdentity } from './identity'
import { getOrg, orgUrl } from './tenant'
import { PRICING } from './platform-fee'

// Avis au propriétaire quand le 100e donateur est compté (D7 du plan K, texte validé par Mika le 16 nov. 2026).
// Le seuil est posé par settle_platform_fee (règlement d'un don) ; le webhook appelle ensuite cette fonction.
// UNE seule fois par organisme : organizations.fee_threshold_notified_at, posé atomiquement (« where … is null ») AVANT
// l'envoi, pour qu'un webhook rejoué ou deux règlements simultanés n'envoient jamais deux avis. Jamais pour un organisme
// exempté, l'atelier ou la démo. Ne bloque jamais un paiement : les erreurs sont journalisées par l'appelant.

export async function notifyThresholdIfNeeded(orgId: string, request?: Request): Promise<number> {
  const db = getDb()
  const { data: o, error } = await db.from('organizations').select('id,fee_threshold_reached_at,fee_threshold_notified_at,practice_of,showcase').eq('id', orgId).maybeSingle()
  if (error) throw error
  if (!o || !o.fee_threshold_reached_at || o.fee_threshold_notified_at || o.practice_of || o.showcase) return 0
  const org = await getOrg(orgId)
  if (!org || org.feeSchedule.model !== 'capped') return 0
  const { data: claimed, error: claimErr } = await db
    .from('organizations')
    .update({ fee_threshold_notified_at: new Date().toISOString() })
    .eq('id', orgId)
    .is('fee_threshold_notified_at', null)
    .select('id')
  if (claimErr) throw claimErr
  if (!claimed?.length) return 0 // un autre règlement l'a déjà envoyé

  const [{ data: billing }, { data: owners }, identity] = await Promise.all([
    db.from('organization_billing').select('cumul_cents,donor_covered_cents,fees_net_cents').eq('organization_id', orgId).maybeSingle(),
    db.from('memberships').select('account_id').eq('organization_id', orgId).eq('role', 'owner'),
    getIdentity(org),
  ])
  const ids = (owners ?? []).map(m => m.account_id as string)
  if (!ids.length) return 0
  const { data: accounts } = await db.from('accounts').select('email').in('id', ids)
  const cap = org.feeSchedule.capCents
  const paid = Math.min(Number(billing?.cumul_cents ?? 0), cap)
  const donorsPaid = Math.min(Number(billing?.donor_covered_cents ?? 0), Math.max(0, paid - Math.min(Number(billing?.fees_net_cents ?? 0), paid)))
  const locale = identity?.locales[0] ?? 'fr'
  const orgName = identity?.texts[locale]?.name || org.name
  let sent = 0
  for (const a of accounts ?? []) {
    const ok = await sendThresholdNotice({
      to: a.email as string,
      locale,
      orgName,
      donorsPaidCents: donorsPaid,
      capCents: cap,
      rate: org.feeSchedule.rate ?? PRICING.rate,
      consoleUrl: orgUrl(org.slug, `/admin?lang=${locale}`, request),
      organizationId: orgId,
    })
    if (ok) sent++
  }
  return sent
}

import { getDb } from './db'

// Conditions d'utilisation de la plateforme : la version en vigueur et leur acceptation par l'organisme (D8 du plan K).
// À l'inscription, la case vaut acceptation (lib/signup.ts). Quand le texte change, TERMS_VERSION change : le propriétaire
// d'un organisme déjà inscrit voit alors l'écran d'acceptation dans la console, et « Mettre en ligne » est refusé tant
// qu'il n'a pas accepté (lib/launch.ts). Historique : table terms_acceptances (migration 2026-11-28).

/** Version des conditions de la plateforme (texte : messages, legalPlateforme.conditions ; date : LEGAL_EFFECTIVE_DATES). */
export const TERMS_VERSION = '2026-11-18-provisoire'

/** Date d'entrée en vigueur de chaque texte de la plateforme (à changer avec lui ; pour les conditions, avec TERMS_VERSION). */
export const LEGAL_EFFECTIVE_DATES = { conditions: '2026-11-18', confidentialite: '2026-11-10' } as const

/** L'organisme a accepté la version en vigueur. */
export function termsAccepted(org: { terms_version?: string | null }): boolean {
  return org.terms_version === TERMS_VERSION
}

/**
 * Enregistre l'acceptation (organisme réel, propriétaire). `version` est celle que la console a montrée : si les conditions
 * ont changé entre-temps, on refuse plutôt que d'enregistrer l'acceptation d'un texte que la personne n'a pas vu.
 * Idempotent : accepter deux fois la même version ne crée qu'une ligne d'historique.
 */
export async function acceptTerms(orgId: string, accountId: string, version: unknown, now = new Date().toISOString()): Promise<{ ok: true } | { ok: false; error: 'version' }> {
  if (version !== TERMS_VERSION) return { ok: false, error: 'version' }
  const db = getDb()
  await recordAcceptance(orgId, accountId, now)
  const { error } = await db.from('organizations').update({ terms_version: TERMS_VERSION, terms_accepted_at: now, terms_accepted_by: accountId }).eq('id', orgId)
  if (error) throw error
  return { ok: true }
}

/**
 * Ligne d'historique. Les colonnes d'organizations font foi (dernier état) ; l'historique ne doit jamais bloquer une
 * inscription ni une acceptation (table absente avant la migration, doublon) : l'échec est journalisé, pas propagé.
 */
export async function recordAcceptance(orgId: string, accountId: string, now: string): Promise<void> {
  const { error } = await getDb().from('terms_acceptances').insert({ organization_id: orgId, version: TERMS_VERSION, accepted_at: now, accepted_by: accountId })
  if (error && (error as { code?: string }).code !== '23505') console.error('Historique des conditions non enregistré :', orgId, error)
}

export interface TermsStatus {
  version: string
  /** Entrée en vigueur de cette version (AAAA-MM-JJ). */
  effectiveDate: string
  accepted: boolean
  /** Dernière acceptation de la version en vigueur : date et nom du compte (null si le compte a été supprimé). */
  acceptedAt: string | null
  acceptedBy: string | null
}

/** État pour la console (organisme réel seulement). */
export async function termsStatus(orgId: string): Promise<TermsStatus> {
  const db = getDb()
  const { data, error } = await db.from('organizations').select('terms_version,terms_accepted_at,terms_accepted_by').eq('id', orgId).maybeSingle()
  if (error) throw error
  const accepted = !!data && termsAccepted(data)
  let acceptedBy: string | null = null
  if (accepted && data?.terms_accepted_by) {
    const { data: acc } = await db.from('accounts').select('name,email').eq('id', data.terms_accepted_by).maybeSingle()
    acceptedBy = ((acc?.name as string | undefined) || (acc?.email as string | undefined)) ?? null
  }
  return { version: TERMS_VERSION, effectiveDate: LEGAL_EFFECTIVE_DATES.conditions, accepted, acceptedAt: accepted ? ((data?.terms_accepted_at as string | null) ?? null) : null, acceptedBy }
}

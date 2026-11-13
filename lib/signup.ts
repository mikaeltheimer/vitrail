import { launchBlockers } from './launch'
import { createHash, randomInt } from 'node:crypto'
import { getDb } from './db'
import {
  createSession,
  hashPassword,
  normalizeEmail,
  passwordProblem,
  pendingInvitationByToken,
  verifyPassword,
  type Account,
} from './auth'
import { PRACTICE_SUFFIX, forgetTenantCache, orgSlugProblem } from './tenant'
import type { AppError } from './errors'

// Inscription d'un organisme sur invitation de Studio Existence (bêta).
//
// 1. Compte : nom, mot de passe ; courriel = celui de l'invitation, ou un autre confirmé par un code à 6 chiffres.
// 2. Organisme : nom et adresse (identifiant libre, non réservé, sans « -- »).
// 3. Conditions : version acceptée, date et compte, au nom de l'organisme.
// Puis : l'organisme réel (brouillon : dons fermés) et son organisme d'ENTRAÎNEMENT (<identifiant>--essai, dons fictifs),
// chacun avec son vitrail permanent ; la personne en est propriétaire et sa session s'ouvre.

/** À changer à CHAQUE modification du texte des conditions (preuve de ce qui a été accepté). Provisoire : avocat. */
export const TERMS_VERSION = '2026-11-10-provisoire'
const CODE_MINUTES = 15
const CODE_ATTEMPTS = 5
const CODES_PER_HOUR = 5
const VERIFIED_FOR_MINUTES = 60

export interface SignupInvitation {
  id: string
  email: string
  orgName: string | null
  message: string | null
  locale: 'fr' | 'en'
}

/** L'invitation à CRÉER un organisme derrière un jeton (en attente, non expirée), sinon null. */
export async function signupInvitation(token: string): Promise<SignupInvitation | null> {
  const inv = await pendingInvitationByToken(token)
  if (!inv || inv.organization_id) return null
  return {
    id: inv.id as string,
    email: inv.email as string,
    orgName: (inv.org_name as string | null) ?? null,
    message: (inv.message as string | null) ?? null,
    locale: inv.locale === 'en' ? 'en' : 'fr',
  }
}

const codeHash = (invitationId: string, code: string) => createHash('sha256').update(`${invitationId}:${code}`).digest('hex')

/** Nouveau code pour une autre adresse que celle de l'invitation. Renvoie le code (l'appelant l'envoie), ou une erreur. */
export async function newSignupCode(inv: SignupInvitation, emailIn: unknown): Promise<{ ok: true; code: string; email: string } | { ok: false; error: 'courriel' | 'trop' | 'meme' }> {
  const email = normalizeEmail(emailIn)
  if (!email || email.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'courriel' }
  if (email === inv.email) return { ok: false, error: 'meme' }
  const db = getDb()
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const { data: recent } = await db.from('signup_codes').select('id').eq('invitation_id', inv.id).gte('created_at', hourAgo).limit(CODES_PER_HOUR)
  if ((recent ?? []).length >= CODES_PER_HOUR) return { ok: false, error: 'trop' }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const now = Date.now()
  const { error } = await db.from('signup_codes').insert({
    invitation_id: inv.id,
    email,
    code_hash: codeHash(inv.id, code),
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + CODE_MINUTES * 60_000).toISOString(),
  })
  if (error) throw error
  return { ok: true, code, email }
}

/** Vérifie le code de la DERNIÈRE demande pour cette adresse. 5 essais, 15 minutes. */
export async function verifySignupCode(inv: SignupInvitation, emailIn: unknown, codeIn: unknown): Promise<{ ok: true } | { ok: false; error: 'code' | 'expire' | 'trop' }> {
  const email = normalizeEmail(emailIn)
  const code = typeof codeIn === 'string' ? codeIn.replace(/\D/g, '') : ''
  const db = getDb()
  const { data: rows, error } = await db.from('signup_codes').select('id,code_hash,expires_at,attempts,verified_at,created_at').eq('invitation_id', inv.id).eq('email', email)
  if (error) throw error
  const last = (rows ?? []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
  if (!last || new Date(last.expires_at as string).getTime() <= Date.now()) return { ok: false, error: 'expire' }
  if (Number(last.attempts) >= CODE_ATTEMPTS) return { ok: false, error: 'trop' }
  if (code.length !== 6 || codeHash(inv.id, code) !== last.code_hash) {
    await db.from('signup_codes').update({ attempts: Number(last.attempts) + 1 }).eq('id', last.id)
    return { ok: false, error: 'code' }
  }
  await db.from('signup_codes').update({ verified_at: new Date().toISOString() }).eq('id', last.id)
  return { ok: true }
}

/** L'adresse peut-elle servir à l'inscription ? Celle de l'invitation, ou une autre confirmée par code depuis moins d'une heure. */
async function emailAllowed(inv: SignupInvitation, email: string): Promise<boolean> {
  if (email === inv.email) return true
  const since = new Date(Date.now() - VERIFIED_FOR_MINUTES * 60_000).toISOString()
  const { data } = await getDb().from('signup_codes').select('id').eq('invitation_id', inv.id).eq('email', email).gte('verified_at', since).limit(1)
  return (data ?? []).length > 0
}

export type SlugCheck = { ok: true } | { ok: false; reason: 'forme' | 'reserve' | 'pris' }

/** Un identifiant d'organisme libre ? (forme, réservés, déjà pris — même un ancien identifiant reste pris). */
export async function checkOrgSlug(slugIn: unknown): Promise<SlugCheck> {
  const slug = typeof slugIn === 'string' ? slugIn.trim().toLowerCase() : ''
  const problem = orgSlugProblem(slug)
  if (problem) return { ok: false, reason: problem }
  const { data, error } = await getDb().from('organization_slugs').select('slug').in('slug', [slug, `${slug}${PRACTICE_SUFFIX}`])
  if (error) throw error
  return (data ?? []).length ? { ok: false, reason: 'pris' } : { ok: true }
}

/** Identifiant proposé à partir du nom (« Théâtre du Lac » → « theatredulac »). */
export const suggestSlug = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 33)

export interface SignupInput {
  token: string
  name: unknown
  email: unknown
  password: unknown
  orgName: unknown
  slug: unknown
  terms: unknown
  locale?: 'fr' | 'en'
  userAgent?: string | null
}

export type SignupError = 'invitation' | 'nom' | 'courriel' | 'motdepasse' | 'compte' | 'organisme' | 'adresse' | 'adresseReservee' | 'adressePrise' | 'conditions'
export type SignupResult = { ok: true; slug: string; sessionToken: string; account: Account } | { ok: false; error: SignupError; detail?: AppError }

/**
 * Crée le compte (ou reprend un compte existant, avec son mot de passe), l'organisme en brouillon, son entraînement,
 * leurs vitraux permanents, l'adhésion de propriétaire et l'acceptation des conditions. En cas d'échec en route, ce qui a
 * été créé est retiré (pas d'organisme à moitié créé).
 */
export async function signup(i: SignupInput): Promise<SignupResult> {
  const inv = await signupInvitation(i.token)
  if (!inv) return { ok: false, error: 'invitation' }
  const name = typeof i.name === 'string' ? i.name.trim().slice(0, 80) : ''
  if (name.length < 2) return { ok: false, error: 'nom' }
  const email = normalizeEmail(i.email)
  if (!(await emailAllowed(inv, email))) return { ok: false, error: 'courriel' }
  const orgName = typeof i.orgName === 'string' ? i.orgName.trim().replace(/\s+/g, ' ').slice(0, 120) : ''
  if (orgName.length < 2) return { ok: false, error: 'organisme' }
  const slug = typeof i.slug === 'string' ? i.slug.trim().toLowerCase() : ''
  const slugCheck = await checkOrgSlug(slug)
  if (!slugCheck.ok) return { ok: false, error: slugCheck.reason === 'pris' ? 'adressePrise' : slugCheck.reason === 'reserve' ? 'adresseReservee' : 'adresse' }
  if (i.terms !== true) return { ok: false, error: 'conditions' }

  const db = getDb()
  const now = new Date().toISOString()

  // Compte : un compte actif existant doit donner SON mot de passe (pas de prise de contrôle par le lien)
  const { data: existing, error: accErr } = await db.from('accounts').select('id,email,name,is_studio,password_hash').eq('email', email).maybeSingle()
  if (accErr) throw accErr
  let account: Account
  let createdAccountId: string | null = null
  if (existing?.password_hash) {
    if (!(await verifyPassword(typeof i.password === 'string' ? i.password : '', existing.password_hash as string))) return { ok: false, error: 'compte' }
    account = { id: existing.id as string, email, name: existing.name as string, isStudio: !!existing.is_studio }
  } else {
    const problem = passwordProblem(i.password, email)
    if (problem) return { ok: false, error: 'motdepasse', detail: problem }
    const password_hash = await hashPassword(i.password as string)
    if (existing) {
      const { error } = await db.from('accounts').update({ name, password_hash, password_changed_at: now }).eq('id', existing.id)
      if (error) throw error
      account = { id: existing.id as string, email, name, isStudio: !!existing.is_studio }
    } else {
      const { data, error } = await db.from('accounts').insert({ email, name, password_hash, password_changed_at: now, created_at: now }).select('id').single()
      if (error) throw error
      account = { id: data.id as string, email, name, isStudio: false }
      createdAccountId = account.id
    }
  }

  const created: { orgs: string[] } = { orgs: [] }
  try {
    const terms = { terms_version: TERMS_VERSION, terms_accepted_at: now, terms_accepted_by: account.id }
    const { data: org, error: orgErr } = await db
      .from('organizations')
      .insert({ name_fr: orgName, status: 'draft', locales: [i.locale === 'en' ? 'en' : 'fr'], texts: { [i.locale === 'en' ? 'en' : 'fr']: { name: orgName } }, created_at: now, ...terms })
      .select('id')
      .single()
    if (orgErr) throw orgErr
    created.orgs.push(org.id as string)
    const { data: practice, error: prErr } = await db
      .from('organizations')
      .insert({ name_fr: orgName, status: 'draft', locales: [i.locale === 'en' ? 'en' : 'fr'], practice_of: org.id, created_at: now })
      .select('id')
      .single()
    if (prErr) throw prErr
    created.orgs.push(practice.id as string)

    const { error: slugErr } = await db.from('organization_slugs').insert([
      { slug, organization_id: org.id, is_current: true, created_at: now },
      { slug: `${slug}${PRACTICE_SUFFIX}`, organization_id: practice.id, is_current: true, created_at: now },
    ])
    if (slugErr) {
      // Course : l'adresse vient d'être prise par quelqu'un d'autre
      if ((slugErr as { code?: string }).code === '23505') throw Object.assign(new Error('adressePrise'), { signup: 'adressePrise' as const })
      throw slugErr
    }
    const { error: vErr } = await db.from('vitraux').insert([
      { organization_id: org.id, kind: 'permanent', name: orgName, created_at: now },
      { organization_id: practice.id, kind: 'permanent', name: orgName, created_at: now },
    ])
    if (vErr) throw vErr
    const { error: mErr } = await db.from('memberships').insert({ account_id: account.id, organization_id: org.id, role: 'owner', created_at: now })
    if (mErr) throw mErr
    await db.from('invitations').update({ accepted_at: now }).eq('id', inv.id)
  } catch (e) {
    await undo(created.orgs, createdAccountId)
    const code = (e as { signup?: SignupError }).signup
    if (code) return { ok: false, error: code }
    throw e
  }

  forgetTenantCache()
  await db.from('accounts').update({ last_login_at: now }).eq('id', account.id)
  return { ok: true, slug, sessionToken: await createSession(account.id, i.userAgent), account }
}

/** Retire un organisme à moitié créé (l'entraînement d'abord, puis le réel), et le compte s'il vient d'être créé. */
async function undo(orgIds: string[], accountId: string | null): Promise<void> {
  const db = getDb()
  for (const id of [...orgIds].reverse()) {
    try {
      await db.from('memberships').delete().eq('organization_id', id)
      await db.from('vitraux').delete().eq('organization_id', id)
      await db.from('organization_slugs').delete().eq('organization_id', id)
      await db.from('organizations').delete().eq('id', id)
    } catch (e) {
      console.error('Organisme à moitié créé, à retirer à la main :', id, e)
    }
  }
  if (accountId) await db.from('accounts').delete().eq('id', accountId)
}

/** Mettre en ligne (propriétaire) : seulement un organisme réel en brouillon dont le compte Stripe est prêt. */
export async function goLive(orgId: string): Promise<{ ok: true } | { ok: false; error: 'entrainement' | 'deja' | 'stripe' | 'juridique' }> {
  const db = getDb()
  const { data: org, error } = await db.from('organizations').select('id,status,practice_of,stripe_ready,legal').eq('id', orgId).maybeSingle()
  if (error) throw error
  if (!org || org.practice_of) return { ok: false, error: 'entrainement' }
  if (org.status !== 'draft') return { ok: false, error: 'deja' }
  // Loi 25 : les coordonnées juridiques (dont le responsable des renseignements personnels) avant d'ouvrir au public.
  // Même définition que « Prêt à lancer » dans Studio (lib/launch.ts).
  const blockers = launchBlockers(org)
  if (blockers.length) return { ok: false, error: blockers[0] }
  const { error: upErr } = await db.from('organizations').update({ status: 'live', went_live_at: new Date().toISOString() }).eq('id', orgId).eq('status', 'draft')
  if (upErr) throw upErr
  forgetTenantCache()
  return { ok: true }
}

/** L'organisme d'entraînement d'un organisme réel (identifiant et adresse), ou null. */
export async function practiceOf(orgId: string): Promise<{ id: string; slug: string } | null> {
  const db = getDb()
  const { data } = await db.from('organizations').select('id').eq('practice_of', orgId).maybeSingle()
  if (!data) return null
  const { data: s } = await db.from('organization_slugs').select('slug').eq('organization_id', data.id).eq('is_current', true).maybeSingle()
  return s ? { id: data.id as string, slug: s.slug as string } : null
}

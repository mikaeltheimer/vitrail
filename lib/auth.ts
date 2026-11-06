import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { getDb } from './db'
import { getOrg, orgBaseUrl, platformDomain, requireTenant, type Tenant } from './tenant'

// Comptes des administrateurs : courriel + mot de passe, membres d'un ou plusieurs organismes (propriétaire ou bénévole).
//
// - Mots de passe : empreintes scrypt (sel aléatoire), jamais stockés ni journalisés en clair.
// - Sessions : un jeton aléatoire dans un témoin httpOnly ; la base n'en garde que l'empreinte SHA-256. 30 jours, prolongés
//   tant qu'on s'en sert. Révocables : retirer un membre ou changer son mot de passe coupe ses sessions.
// - Le témoin vaut pour toute la plateforme (.PLATFORM_DOMAIN) ; l'accès à un organisme est vérifié à CHAQUE requête
//   dans `memberships`. Être connecté ne donne accès à rien en soi.
// - Studio Existence n'a aucun accès aux consoles : is_studio ne sert qu'à la gestion des organismes (étape 7).

export type Role = 'owner' | 'volunteer'
export interface Account {
  id: string
  email: string
  name: string
  isStudio: boolean
}

export const SESSION_COOKIE = 'donivers_session'
const SESSION_DAYS = 30
const DAY_MS = 86_400_000
const INVITATION_DAYS = 7
const RESET_MINUTES = 60
const LOCK_FAILURES = 10
const LOCK_MINUTES = 15

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

// ── Mots de passe ──────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password.normalize('NFKC'), salt, 64, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? '').split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    await scrypt('x', Buffer.alloc(16), 64, SCRYPT) // même durée qu'une vraie vérification : ne pas révéler si le compte existe
    return false
  }
  const [, N, r, p, salt, hash] = parts
  const expected = Buffer.from(hash, 'base64url')
  const got = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem })
  return got.length === expected.length && timingSafeEqual(got, expected)
}

// Les plus courants (et leurs variantes évidentes) : refusés, même s'ils font 10 caractères
const COMMON = new Set([
  'motdepasse', 'motdepasse1', 'motdepasse123', 'password', 'password1', 'password123', 'passw0rd', '1234567890', '0123456789',
  '12345678910', '123456789a', 'azertyuiop', 'qwertyuiop', '1q2w3e4r5t', 'qwerty1234', 'azerty1234', 'iloveyou12', 'bonjour123',
  'soleil1234', 'donivers123', 'vitrail123', 'changeme123', 'administrateur', 'admin12345', 'welcome123', 'bienvenue1', 'bienvenue123',
])

/** Raison du refus d'un mot de passe, ou null s'il est acceptable. */
export function passwordProblem(password: unknown, email: string): string | null {
  if (typeof password !== 'string' || password.length < 10) return 'Le mot de passe doit compter au moins 10 caractères.'
  if (password.length > 200) return 'Le mot de passe est trop long (200 caractères au plus).'
  const p = password.toLowerCase()
  if (COMMON.has(p) || /^(.)\1+$/.test(p)) return 'Ce mot de passe est trop courant. Choisissez-en un autre.'
  const local = email.split('@')[0]
  if (local.length >= 4 && p.includes(local)) return 'Le mot de passe ne doit pas contenir votre adresse courriel.'
  return null
}

export const normalizeEmail = (e: unknown): string => (typeof e === 'string' ? e.trim().toLowerCase() : '')

// ── Jetons ─────────────────────────────────────────────────────────────────────

const newToken = () => randomBytes(32).toString('base64url')
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const inDays = (d: number) => new Date(Date.now() + d * DAY_MS).toISOString()

// ── Sessions ───────────────────────────────────────────────────────────────────

/** Domaine du témoin : toute la plateforme sur ses sous-domaines ; sinon l'hôte seul (prévisualisation, ancienne adresse). */
export function sessionCookieDomain(host: string | null | undefined): string | undefined {
  const d = platformDomain()
  const h = (host ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '')
  if (!d || d === 'localhost' || !h) return undefined
  return h === d || h.endsWith(`.${d}`) ? `.${d}` : undefined
}

export function sessionCookieOptions(host: string | null | undefined, maxAgeS = SESSION_DAYS * 86_400) {
  const domain = sessionCookieDomain(host)
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeS,
    ...(domain ? { domain } : {}),
  }
}

export async function createSession(accountId: string, userAgent?: string | null): Promise<string> {
  const token = newToken()
  const { error } = await getDb()
    .from('sessions')
    .insert({ token_hash: tokenHash(token), account_id: accountId, expires_at: inDays(SESSION_DAYS), user_agent: (userAgent ?? '').slice(0, 200) || null })
  if (error) throw error
  return token
}

interface AccountRow {
  id: string
  email: string
  name: string
  is_studio: boolean
  password_hash?: string | null
}
const toAccount = (r: AccountRow): Account => ({ id: r.id, email: r.email, name: r.name, isStudio: !!r.is_studio })

/** Le compte d'un jeton de session valide (et la session prolongée si elle a servi depuis plus d'un jour), ou null. */
export async function accountFromToken(token: string | null | undefined): Promise<Account | null> {
  if (!token || token.length > 100) return null
  const db = getDb()
  const hash = tokenHash(token)
  const { data: s, error } = await db.from('sessions').select('token_hash,account_id,expires_at,last_seen_at').eq('token_hash', hash).maybeSingle()
  if (error) throw error
  if (!s || new Date(s.expires_at as string).getTime() <= Date.now()) return null
  const { data: a, error: aErr } = await db.from('accounts').select('id,email,name,is_studio,password_hash').eq('id', s.account_id).maybeSingle()
  if (aErr) throw aErr
  if (!a || !a.password_hash) return null
  if (Date.now() - new Date(s.last_seen_at as string).getTime() > DAY_MS) {
    await db.from('sessions').update({ last_seen_at: new Date().toISOString(), expires_at: inDays(SESSION_DAYS) }).eq('token_hash', hash)
  }
  return toAccount(a as AccountRow)
}

/** Le compte connecté (témoin de la requête), ou null. */
export async function currentAccount(): Promise<Account | null> {
  const store = await cookies()
  return accountFromToken(store.get(SESSION_COOKIE)?.value)
}

export async function destroySession(token: string | null | undefined): Promise<void> {
  if (!token) return
  await getDb().from('sessions').delete().eq('token_hash', tokenHash(token))
}

async function destroyAllSessions(accountId: string): Promise<void> {
  const { error } = await getDb().from('sessions').delete().eq('account_id', accountId)
  if (error) throw error
}

// ── Connexion ──────────────────────────────────────────────────────────────────

export type LoginResult = { ok: true; token: string; account: Account } | { ok: false; reason: 'invalid' | 'locked' }

export async function login(emailIn: unknown, password: unknown, userAgent?: string | null): Promise<LoginResult> {
  const email = normalizeEmail(emailIn)
  const db = getDb()
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString()
  const { data: recent } = await db.from('login_failures').select('id').eq('email', email).gte('created_at', since).limit(LOCK_FAILURES)
  if ((recent ?? []).length >= LOCK_FAILURES) return { ok: false, reason: 'locked' }

  const { data: a, error } = email ? await db.from('accounts').select('id,email,name,is_studio,password_hash').eq('email', email).maybeSingle() : { data: null, error: null }
  if (error) throw error
  const good = await verifyPassword(typeof password === 'string' ? password : '', (a as AccountRow | null)?.password_hash)
  if (!a || !good) {
    if (email) await db.from('login_failures').insert({ email, created_at: new Date().toISOString() })
    return { ok: false, reason: 'invalid' }
  }
  await db.from('login_failures').delete().eq('email', email)
  await db.from('accounts').update({ last_login_at: new Date().toISOString() }).eq('id', a.id)
  return { ok: true, token: await createSession(a.id as string, userAgent), account: toAccount(a as AccountRow) }
}

// ── Membres et accès ───────────────────────────────────────────────────────────

const RANK: Record<Role, number> = { volunteer: 1, owner: 2 }

export async function roleIn(accountId: string, orgId: string): Promise<Role | null> {
  const { data, error } = await getDb().from('memberships').select('role').eq('account_id', accountId).eq('organization_id', orgId).maybeSingle()
  if (error) throw error
  return (data?.role as Role | undefined) ?? null
}

/** Les organismes d'une personne (pour le sélecteur et la page « pas d'accès ici »). */
export async function organizationsOf(accountId: string): Promise<{ id: string; name: string; role: Role; url: string }[]> {
  const { data, error } = await getDb().from('memberships').select('organization_id,role').eq('account_id', accountId)
  if (error) throw error
  const out: { id: string; name: string; role: Role; url: string }[] = []
  for (const m of data ?? []) {
    const org = await getOrg(m.organization_id as string)
    if (org) out.push({ id: org.id, name: org.name, role: m.role as Role, url: `${orgBaseUrl(org.slug)}/admin` })
  }
  return out
}

export type AdminContext = { tenant: Tenant; account: Account; role: Role }

/**
 * Pour les routes de la console : l'organisme de l'adresse, la personne connectée et son rôle DANS CET organisme.
 * Refus (403) si elle n'en est pas membre ou si son rôle est insuffisant ; 401 si personne n'est connecté.
 * Une requête qui modifie quelque chose doit venir de la même adresse (en-tête Origin) : pas de formulaire d'un autre site.
 */
export async function requireAdmin(request: Request, minRole: Role = 'volunteer'): Promise<{ ctx: AdminContext } | { response: Response }> {
  const deny = (status: number, error: string) => ({ response: Response.json({ error }, { status }) })
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin')
    const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim().toLowerCase()
    if (origin) {
      let originHost = ''
      try {
        originHost = new URL(origin).host.toLowerCase()
      } catch {
        // origine illisible : refusée plus bas
      }
      if (originHost !== host) return deny(403, 'Requête refusée (autre origine).')
    }
  }
  const t = await requireTenant(request)
  if ('response' in t) return t
  const account = await currentAccount()
  if (!account) return deny(401, 'Connectez-vous.')
  const role = await roleIn(account.id, t.tenant.org.id)
  if (!role) return deny(403, "Vous n'avez pas accès à cet organisme.")
  if (RANK[role] < RANK[minRole]) return deny(403, 'Réservé au propriétaire de l\'organisme.')
  return { ctx: { tenant: t.tenant, account, role } }
}

// ── Invitations ────────────────────────────────────────────────────────────────

export interface InvitationInfo {
  id: string
  email: string
  role: Role
  organizationId: string | null
  orgName: string | null
  orgSlug: string | null
  accountExists: boolean
}

/** Crée une invitation et renvoie le jeton à mettre dans le lien (l'appelant envoie le courriel). */
export async function createInvitation(i: { email: string; organizationId: string; role: Role; invitedBy: string | null }): Promise<{ id: string; token: string }> {
  const token = newToken()
  const db = getDb()
  // Une seule invitation en attente par personne et par organisme : la nouvelle remplace l'ancienne
  await db.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('email', i.email).eq('organization_id', i.organizationId).is('accepted_at', null).is('revoked_at', null)
  const { data, error } = await db
    .from('invitations')
    .insert({ email: i.email, organization_id: i.organizationId, role: i.role, token_hash: tokenHash(token), invited_by: i.invitedBy, created_at: new Date().toISOString(), expires_at: inDays(INVITATION_DAYS) })
    .select('id')
    .single()
  if (error) throw error
  return { id: data.id as string, token }
}

async function pendingInvitationByToken(token: string): Promise<Record<string, unknown> | null> {
  if (!token || token.length > 100) return null
  const { data, error } = await getDb().from('invitations').select('id,email,organization_id,role,expires_at,accepted_at,revoked_at').eq('token_hash', tokenHash(token)).maybeSingle()
  if (error) throw error
  if (!data || data.accepted_at || data.revoked_at || new Date(data.expires_at as string).getTime() <= Date.now()) return null
  return data
}

export async function invitationInfo(token: string): Promise<InvitationInfo | null> {
  const inv = await pendingInvitationByToken(token)
  if (!inv) return null
  const org = inv.organization_id ? await getOrg(inv.organization_id as string) : null
  const { data: acc } = await getDb().from('accounts').select('id,password_hash').eq('email', inv.email).maybeSingle()
  return {
    id: inv.id as string,
    email: inv.email as string,
    role: inv.role as Role,
    organizationId: (inv.organization_id as string | null) ?? null,
    orgName: org?.name ?? null,
    orgSlug: org?.slug ?? null,
    accountExists: !!acc?.password_hash,
  }
}

export type AcceptResult = { ok: true; account: Account; organizationId: string | null; token?: string } | { ok: false; error: string }

/**
 * Accepter une invitation. Nouvelle personne : nom + mot de passe (le lien reçu prouve l'adresse). Personne qui a déjà un
 * compte : elle doit être connectée avec CE compte (même courriel). Le rôle donné ne baisse jamais un rôle existant.
 */
export async function acceptInvitation(
  token: string,
  input: { name?: unknown; password?: unknown; signedIn?: Account | null; userAgent?: string | null },
): Promise<AcceptResult> {
  const inv = await pendingInvitationByToken(token)
  if (!inv) return { ok: false, error: 'Cette invitation a expiré ou a déjà servi. Demandez-en une nouvelle.' }
  const db = getDb()
  const email = inv.email as string
  const { data: existing, error } = await db.from('accounts').select('id,email,name,is_studio,password_hash').eq('email', email).maybeSingle()
  if (error) throw error

  let account: Account
  let newSession: string | undefined
  if (existing?.password_hash) {
    if (!input.signedIn || input.signedIn.id !== existing.id) return { ok: false, error: `Connectez-vous d'abord avec le compte ${email} pour accepter cette invitation.` }
    account = input.signedIn
  } else {
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : ''
    if (name.length < 2) return { ok: false, error: 'Indiquez votre nom.' }
    const problem = passwordProblem(input.password, email)
    if (problem) return { ok: false, error: problem }
    const password_hash = await hashPassword(input.password as string)
    const now = new Date().toISOString()
    if (existing) {
      const { error: upErr } = await db.from('accounts').update({ name, password_hash, password_changed_at: now }).eq('id', existing.id)
      if (upErr) throw upErr
      account = { id: existing.id as string, email, name, isStudio: !!existing.is_studio }
    } else {
      const { data: created, error: insErr } = await db.from('accounts').insert({ email, name, password_hash, password_changed_at: now }).select('id,email,name,is_studio').single()
      if (insErr) throw insErr
      account = toAccount(created as AccountRow)
    }
    newSession = await createSession(account.id, input.userAgent)
  }

  const orgId = (inv.organization_id as string | null) ?? null
  if (orgId) {
    const current = await roleIn(account.id, orgId)
    const role = inv.role as Role
    if (!current) {
      const { error: mErr } = await db.from('memberships').insert({ account_id: account.id, organization_id: orgId, role })
      if (mErr) throw mErr
    } else if (RANK[role] > RANK[current]) {
      await db.from('memberships').update({ role }).eq('account_id', account.id).eq('organization_id', orgId)
    }
  }
  await db.from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id)
  return { ok: true, account, organizationId: orgId, token: newSession }
}

// ── Mot de passe oublié / première connexion ───────────────────────────────────

export type LinkToSend = { kind: 'password_reset'; email: string; token: string } | { kind: 'invitation'; email: string; token: string; organizationId: string; role: Role }

/**
 * « Recevoir un lien » : un compte actif reçoit un lien de réinitialisation ; une personne invitée qui n'a pas encore de compte
 * reçoit un nouveau lien d'invitation (l'ancien cesse de fonctionner). Sinon, rien. L'appelant répond toujours la même chose
 * (on ne révèle pas si une adresse a un compte) et envoie les courriels. Au plus un lien par adresse toutes les 2 minutes.
 */
export async function linksForEmail(emailIn: unknown): Promise<LinkToSend[]> {
  const email = normalizeEmail(emailIn)
  if (!email || email.length > 200 || !email.includes('@')) return []
  const db = getDb()
  const twoMinAgo = new Date(Date.now() - 120_000).toISOString()

  const { data: acc, error } = await db.from('accounts').select('id,password_hash').eq('email', email).maybeSingle()
  if (error) throw error
  if (acc?.password_hash) {
    const { data: recent } = await db.from('password_resets').select('token_hash').eq('account_id', acc.id).gte('created_at', twoMinAgo).limit(1)
    if ((recent ?? []).length) return []
    const token = newToken()
    const { error: insErr } = await db.from('password_resets').insert({ token_hash: tokenHash(token), account_id: acc.id, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + RESET_MINUTES * 60_000).toISOString() })
    if (insErr) throw insErr
    return [{ kind: 'password_reset', email, token }]
  }

  const { data: invs, error: invErr } = await db.from('invitations').select('id,organization_id,role,created_at').eq('email', email).is('accepted_at', null).is('revoked_at', null).limit(5)
  if (invErr) throw invErr
  const out: LinkToSend[] = []
  for (const inv of invs ?? []) {
    if (!inv.organization_id) continue // inviter à créer un organisme : étape suivante
    if (String(inv.created_at) >= twoMinAgo) continue
    const token = newToken()
    const { error: upErr } = await db.from('invitations').update({ token_hash: tokenHash(token), created_at: new Date().toISOString(), expires_at: inDays(INVITATION_DAYS) }).eq('id', inv.id)
    if (upErr) throw upErr
    out.push({ kind: 'invitation', email, token, organizationId: inv.organization_id as string, role: inv.role as Role })
  }
  return out
}

/** Nouveau mot de passe depuis un lien « mot de passe oublié » : toutes les autres sessions sont fermées. */
export async function resetPassword(token: string, password: unknown, userAgent?: string | null): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!token || token.length > 100) return { ok: false, error: 'Ce lien a expiré. Demandez-en un nouveau.' }
  const db = getDb()
  const { data: r, error } = await db.from('password_resets').select('token_hash,account_id,expires_at,used_at').eq('token_hash', tokenHash(token)).maybeSingle()
  if (error) throw error
  if (!r || r.used_at || new Date(r.expires_at as string).getTime() <= Date.now()) return { ok: false, error: 'Ce lien a expiré. Demandez-en un nouveau.' }
  const { data: acc } = await db.from('accounts').select('id,email').eq('id', r.account_id).maybeSingle()
  if (!acc) return { ok: false, error: 'Ce lien a expiré. Demandez-en un nouveau.' }
  const problem = passwordProblem(password, acc.email as string)
  if (problem) return { ok: false, error: problem }
  const now = new Date().toISOString()
  await db.from('password_resets').update({ used_at: now }).eq('token_hash', r.token_hash)
  const { error: upErr } = await db.from('accounts').update({ password_hash: await hashPassword(password as string), password_changed_at: now }).eq('id', acc.id)
  if (upErr) throw upErr
  await destroyAllSessions(acc.id as string)
  await db.from('login_failures').delete().eq('email', acc.email)
  return { ok: true, token: await createSession(acc.id as string, userAgent) }
}

// ── Équipe (propriétaire) ──────────────────────────────────────────────────────

export async function teamOf(orgId: string): Promise<{ members: { accountId: string; email: string; name: string; role: Role }[]; invitations: { id: string; email: string; role: Role; expiresAt: string }[] }> {
  const db = getDb()
  const [{ data: ms, error: mErr }, { data: invs, error: iErr }] = await Promise.all([
    db.from('memberships').select('account_id,role').eq('organization_id', orgId),
    db.from('invitations').select('id,email,role,expires_at').eq('organization_id', orgId).is('accepted_at', null).is('revoked_at', null),
  ])
  if (mErr) throw mErr
  if (iErr) throw iErr
  const ids = (ms ?? []).map(m => m.account_id as string)
  const { data: accs } = ids.length ? await db.from('accounts').select('id,email,name').in('id', ids) : { data: [] }
  const byId = new Map((accs ?? []).map(a => [a.id as string, a]))
  return {
    members: (ms ?? []).map(m => ({ accountId: m.account_id as string, email: (byId.get(m.account_id as string)?.email as string) ?? '', name: (byId.get(m.account_id as string)?.name as string) ?? '', role: m.role as Role })),
    invitations: (invs ?? []).map(i => ({ id: i.id as string, email: i.email as string, role: i.role as Role, expiresAt: i.expires_at as string })),
  }
}

/** Retirer quelqu'un de l'équipe : ses sessions restent valides ailleurs, mais il perd tout accès à cet organisme. Jamais le dernier propriétaire. */
export async function removeMember(orgId: string, accountId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb()
  const role = await roleIn(accountId, orgId)
  if (!role) return { ok: false, error: "Cette personne ne fait pas partie de l'équipe." }
  if (role === 'owner') {
    const { data: owners } = await db.from('memberships').select('account_id').eq('organization_id', orgId).eq('role', 'owner')
    if ((owners ?? []).length <= 1) return { ok: false, error: 'Impossible de retirer le dernier propriétaire.' }
  }
  const { error } = await db.from('memberships').delete().eq('account_id', accountId).eq('organization_id', orgId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function revokeInvitation(orgId: string, invitationId: string): Promise<void> {
  await getDb().from('invitations').update({ revoked_at: new Date().toISOString() }).eq('id', invitationId).eq('organization_id', orgId).is('accepted_at', null)
}

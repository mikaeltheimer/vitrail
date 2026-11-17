import { randomBytes } from 'node:crypto'
import { getDb } from './db'
import { createSession, hashPassword, normalizeEmail, passwordProblem, tokenHash, verifyPassword } from './auth'
import { err, type AppError } from './errors'
import { validateEmail } from './validate'

// Mon compte (Mika, 17 nov. 2026) : nom, mot de passe et adresse courriel de la personne connectée, quel que soit son
// rôle. Tout changement sensible demande le mot de passe actuel.
//
// - Mot de passe : toutes les sessions sont fermées, puis une nouvelle s'ouvre pour cet appareil (comme la réinitialisation).
// - Courriel : rien ne change tant que la personne n'a pas cliqué le lien reçu à la NOUVELLE adresse (24 h). L'ancienne
//   adresse est prévenue après le changement. Une adresse déjà prise par un autre compte est refusée (pas de fusion).

const EMAIL_CHANGE_HOURS = 24
const EMAIL_CHANGE_WAIT_MS = 120_000

type Fail = { ok: false; error: AppError }

export interface AccountInfo {
  name: string
  email: string
  /** Changement d'adresse en attente de confirmation. */
  pendingEmail: string | null
  passwordChangedAt: string | null
}

export async function accountInfo(accountId: string): Promise<AccountInfo | null> {
  const db = getDb()
  const { data: a, error } = await db.from('accounts').select('id,email,name,password_changed_at').eq('id', accountId).maybeSingle()
  if (error) throw error
  if (!a) return null
  return { name: (a.name as string) ?? '', email: a.email as string, pendingEmail: (await pendingChange(accountId))?.new_email ?? null, passwordChangedAt: (a.password_changed_at as string | null) ?? null }
}

async function pendingChange(accountId: string): Promise<{ new_email: string; created_at: string } | null> {
  const { data, error } = await getDb().from('email_changes').select('new_email,created_at,expires_at,used_at').eq('account_id', accountId).is('used_at', null).gte('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1)
  if (error) throw error
  const row = (data ?? [])[0] as { new_email: string; created_at: string } | undefined
  return row ?? null
}

/** Nom affiché à l'équipe (80 caractères au plus). */
export async function updateName(accountId: string, nameIn: unknown): Promise<{ ok: true } | Fail> {
  const name = typeof nameIn === 'string' ? nameIn.trim().replace(/\s+/g, ' ') : ''
  if (name.length < 2 || name.length > 80) return { ok: false, error: err('nomInvalide') }
  const { error } = await getDb().from('accounts').update({ name }).eq('id', accountId)
  if (error) throw error
  return { ok: true }
}

async function checkPassword(accountId: string, password: unknown): Promise<{ id: string; email: string } | null> {
  const { data: a, error } = await getDb().from('accounts').select('id,email,password_hash').eq('id', accountId).maybeSingle()
  if (error) throw error
  const good = await verifyPassword(typeof password === 'string' ? password : '', (a?.password_hash as string | null) ?? null)
  return a && good ? { id: a.id as string, email: a.email as string } : null
}

/** Nouveau mot de passe : les autres appareils sont déconnectés ; renvoie la session de cet appareil. */
export async function changePassword(accountId: string, current: unknown, next: unknown, userAgent?: string | null): Promise<{ ok: true; token: string } | Fail> {
  const acc = await checkPassword(accountId, current)
  if (!acc) return { ok: false, error: err('motDePasseActuelFaux') }
  const problem = passwordProblem(next, acc.email)
  if (problem) return { ok: false, error: problem }
  if (current === next) return { ok: false, error: err('motDePasseIdentique') }
  const db = getDb()
  const now = new Date().toISOString()
  const { error } = await db.from('accounts').update({ password_hash: await hashPassword(next as string), password_changed_at: now }).eq('id', acc.id)
  if (error) throw error
  const { error: delErr } = await db.from('sessions').delete().eq('account_id', acc.id)
  if (delErr) throw delErr
  return { ok: true, token: await createSession(acc.id, userAgent) }
}

export interface EmailChangeRequest {
  ok: true
  token: string
  newEmail: string
}

/** Demande de changement d'adresse : renvoie le jeton à mettre dans le lien envoyé à la nouvelle adresse. */
export async function requestEmailChange(accountId: string, newEmailIn: unknown, password: unknown): Promise<EmailChangeRequest | Fail> {
  const v = validateEmail(newEmailIn)
  if (!v.ok) return { ok: false, error: v.error }
  const acc = await checkPassword(accountId, password)
  if (!acc) return { ok: false, error: err('motDePasseActuelFaux') }
  const newEmail = v.value
  if (newEmail === acc.email) return { ok: false, error: err('courrielIdentique') }
  const db = getDb()
  const { data: taken, error } = await db.from('accounts').select('id').eq('email', newEmail).maybeSingle()
  if (error) throw error
  if (taken) return { ok: false, error: err('courrielIndisponible') }
  const pending = await pendingChange(accountId)
  if (pending && Date.now() - new Date(pending.created_at).getTime() < EMAIL_CHANGE_WAIT_MS) return { ok: false, error: err('courrielDejaDemande') }
  // Une seule demande en cours : la nouvelle remplace les précédentes
  const { error: delErr } = await db.from('email_changes').delete().eq('account_id', accountId).is('used_at', null)
  if (delErr) throw delErr
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  const { error: insErr } = await db.from('email_changes').insert({
    token_hash: tokenHash(token),
    account_id: accountId,
    old_email: acc.email,
    new_email: newEmail,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + EMAIL_CHANGE_HOURS * 3_600_000).toISOString(),
  })
  if (insErr) throw insErr
  return { ok: true, token, newEmail }
}

export async function cancelEmailChange(accountId: string): Promise<void> {
  const { error } = await getDb().from('email_changes').delete().eq('account_id', accountId).is('used_at', null)
  if (error) throw error
}

/** Clic sur le lien reçu à la nouvelle adresse : l'adresse du compte change. */
export async function confirmEmailChange(token: string): Promise<{ ok: true; oldEmail: string; newEmail: string } | Fail> {
  if (!token || token.length > 100) return { ok: false, error: err('lienExpire') }
  const db = getDb()
  const { data: r, error } = await db.from('email_changes').select('token_hash,account_id,old_email,new_email,expires_at,used_at').eq('token_hash', tokenHash(token)).maybeSingle()
  if (error) throw error
  if (!r || r.used_at || new Date(r.expires_at as string).getTime() <= Date.now()) return { ok: false, error: err('lienExpire') }
  const newEmail = normalizeEmail(r.new_email)
  const { data: acc, error: accErr } = await db.from('accounts').select('id,email').eq('id', r.account_id).maybeSingle()
  if (accErr) throw accErr
  // Le compte a changé d'adresse depuis la demande : ce lien ne vaut plus
  if (!acc || acc.email !== r.old_email) return { ok: false, error: err('lienExpire') }
  const oldEmail = acc.email as string
  const { data: taken, error: takenErr } = await db.from('accounts').select('id').eq('email', newEmail).maybeSingle()
  if (takenErr) throw takenErr
  if (taken) return { ok: false, error: err('courrielIndisponible') }
  const { error: upErr } = await db.from('accounts').update({ email: newEmail }).eq('id', acc.id)
  // Course avec une inscription sous la même adresse : la contrainte d'unicité refuse
  if (upErr) return (upErr as { code?: string }).code === '23505' ? { ok: false, error: err('courrielIndisponible') } : Promise.reject(upErr)
  await db.from('email_changes').update({ used_at: new Date().toISOString() }).eq('token_hash', r.token_hash)
  await db.from('email_changes').delete().eq('account_id', acc.id).is('used_at', null)
  await db.from('login_failures').delete().eq('email', oldEmail)
  return { ok: true, oldEmail, newEmail }
}

import { check, done, mocks } from './helpers'
import { reset, rpcs, tables } from './fake-db'

// ── Témoins de la requête (next/headers) et next/server simulés ────────────────
const jar = new Map<string, string>()
mocks['next/headers'] = {
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined) }),
  headers: async () => new Headers(),
}
const sent: { kind: string; to: string }[] = []
mocks['@/lib/email'] = {
  sendInvitation: async (i: { to: string }) => { sent.push({ kind: 'invitation', to: i.to }); return true },
  sendPasswordReset: async (i: { to: string }) => { sent.push({ kind: 'reset', to: i.to }); return true },
  sendReceipt: async () => true,
}
mocks['next/server'] = {
  after: (fn: () => unknown) => { void fn() },
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body, json: async () => body }) },
}
process.env.PLATFORM_DOMAIN = 'donivers.test'
process.env.STRIPE_SECRET_KEY = 'sk_test_x'

async function main() {
  const auth = await import('../lib/auth')
  const { forgetTenantCache } = await import('../lib/tenant')
  const { SESSION_COOKIE } = auth

  const seed = () => {
    reset(); forgetTenantCache(); jar.clear(); sent.length = 0
    tables.organizations = [
      { id: 'orgA', status: 'live', name_fr: 'École A', texts: {}, photo_moderation: 'live', stripe_account_id: 'acct_A', stripe_ready: true },
      { id: 'orgB', status: 'live', name_fr: 'Musée B', texts: {}, photo_moderation: 'live', stripe_account_id: 'acct_B', stripe_ready: true },
    ]
    tables.organization_slugs = [{ slug: 'ecole', organization_id: 'orgA', is_current: true }, { slug: 'musee', organization_id: 'orgB', is_current: true }]
    tables.vitraux = [
      { id: 'permA', organization_id: 'orgA', kind: 'permanent', slug: null, name: 'A', state: 'active', in_main: true, goal_cents: 0 },
      { id: 'permB', organization_id: 'orgB', kind: 'permanent', slug: null, name: 'B', state: 'active', in_main: true, goal_cents: 0 },
    ]
  }
  const req = (host: string, method = 'GET', extra: Record<string, string> = {}, body?: unknown) =>
    new Request(`https://${host}/api/admin`, { method, headers: { host, ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) })

  console.log('Mots de passe')
  check('trop court refusé', auth.passwordProblem('court', 'a@x.ca') !== null)
  check('courant refusé', auth.passwordProblem('motdepasse123', 'a@x.ca') !== null)
  check('contenant le courriel refusé', auth.passwordProblem('mikael2026!!', 'mikael@x.ca') !== null)
  check('acceptable', auth.passwordProblem('vitre-ambre-42', 'a@x.ca') === null)
  const h = await auth.hashPassword('vitre-ambre-42')
  check('empreinte scrypt, sans le mot de passe en clair', h.startsWith('scrypt$') && !h.includes('vitre'))
  check('bon mot de passe vérifié', await auth.verifyPassword('vitre-ambre-42', h))
  check('mauvais mot de passe refusé', !(await auth.verifyPassword('vitre-ambre-43', h)))
  check('empreinte absente : refusé sans erreur', !(await auth.verifyPassword('x', null)))

  console.log('Invitation et création du compte')
  seed()
  const inv = await auth.createInvitation({ email: 'ana@x.ca', organizationId: 'orgA', role: 'owner', invitedBy: null })
  check('seule l\'empreinte du jeton est gardée', tables.invitations[0].token_hash !== inv.token && !JSON.stringify(tables.invitations).includes(inv.token))
  const info = await auth.invitationInfo(inv.token)
  check('page d\'invitation : organisme, rôle, pas encore de compte', info?.orgName === 'École A' && info.role === 'owner' && !info.accountExists)
  let acc = await auth.acceptInvitation(inv.token, { name: 'Ana', password: 'court' })
  check('mot de passe faible refusé à l\'inscription', !acc.ok)
  acc = await auth.acceptInvitation(inv.token, { name: 'Ana', password: 'vitre-ambre-42' })
  check('compte créé, propriétaire de A, session ouverte', acc.ok && !!acc.token && tables.memberships.length === 1 && tables.memberships[0].role === 'owner')
  check('invitation déjà servie : refusée', !(await auth.acceptInvitation(inv.token, { name: 'Ana', password: 'vitre-ambre-42' })).ok)
  const anaId = (acc as { account: { id: string } }).account.id

  console.log('Connexion')
  let lr = await auth.login('ANA@x.ca ', 'vitre-ambre-42')
  check('connexion (courriel insensible à la casse)', lr.ok)
  lr = await auth.login('ana@x.ca', 'mauvais-mot-de-passe')
  check('mauvais mot de passe', !lr.ok && lr.reason === 'invalid')
  lr = await auth.login('inconnu@x.ca', 'vitre-ambre-42')
  check('compte inconnu : même réponse', !lr.ok && lr.reason === 'invalid')
  for (let i = 0; i < 10; i++) await auth.login('ana@x.ca', 'mauvais-mot-de-passe')
  lr = await auth.login('ana@x.ca', 'vitre-ambre-42')
  check('10 échecs en 15 min : bloqué, même avec le bon mot de passe', !lr.ok && lr.reason === 'locked')
  tables.login_failures = []
  lr = await auth.login('ana@x.ca', 'vitre-ambre-42')
  check('après le délai : connexion possible', lr.ok)
  const anaToken = (lr as { token: string }).token
  check('session : seule l\'empreinte est gardée', !JSON.stringify(tables.sessions).includes(anaToken))
  check('jeton valide → compte', (await auth.accountFromToken(anaToken))?.email === 'ana@x.ca')
  check('jeton inventé → rien', (await auth.accountFromToken('faux')) === null)
  const s = tables.sessions.find(x => x.token_hash === auth.tokenHash(anaToken))!
  s.expires_at = new Date(Date.now() - 1000).toISOString()
  check('session expirée → rien', (await auth.accountFromToken(anaToken)) === null)
  s.expires_at = new Date(Date.now() + 86_400_000).toISOString()

  console.log('Témoin')
  check('sur un sous-domaine : témoin pour toute la plateforme', auth.sessionCookieDomain('ecole.donivers.test') === '.donivers.test')
  check('ailleurs (prévisualisation) : hôte seul', auth.sessionCookieDomain('vitrail-git-x.vercel.app') === undefined)
  check('domaine qui ressemble : hôte seul', auth.sessionCookieDomain('ecole.donivers.test.evil.com') === undefined)

  console.log('Accès : organisme et rôle vérifiés à chaque requête')
  let r = await auth.requireAdmin(req('ecole.donivers.test'))
  check('personne de connecté : 401', 'response' in r && r.response.status === 401)
  jar.set(SESSION_COOKIE, anaToken)
  r = await auth.requireAdmin(req('ecole.donivers.test'))
  check('propriétaire de A sur A : accès', 'ctx' in r && r.ctx.role === 'owner' && r.ctx.tenant.org.id === 'orgA')
  r = await auth.requireAdmin(req('musee.donivers.test'))
  check('propriétaire de A sur B : 403', 'response' in r && r.response.status === 403)
  r = await auth.requireAdmin(req('ecole.donivers.test', 'POST', { origin: 'https://musee.donivers.test' }))
  check('requête qui vient d\'une autre adresse : 403', 'response' in r && r.response.status === 403)
  r = await auth.requireAdmin(req('ecole.donivers.test', 'POST', { origin: 'https://ecole.donivers.test' }))
  check('même adresse : accepté', 'ctx' in r)

  // Un bénévole sur A
  const inv2 = await auth.createInvitation({ email: 'bob@x.ca', organizationId: 'orgA', role: 'volunteer', invitedBy: anaId })
  const bob = await auth.acceptInvitation(inv2.token, { name: 'Bob', password: 'verre-rouge-77' })
  const bobToken = (bob as { token: string }).token
  jar.set(SESSION_COOKIE, bobToken)
  r = await auth.requireAdmin(req('ecole.donivers.test'))
  check('bénévole : accès à la console', 'ctx' in r && r.ctx.role === 'volunteer')
  r = await auth.requireAdmin(req('ecole.donivers.test'), 'owner')
  check('bénévole : réservé au propriétaire → 403', 'response' in r && r.response.status === 403)

  console.log('Console : refus côté serveur')
  mocks['@/lib/payments'] = { getStripe: () => ({}) }
  const { POST, GET } = await import('../app/api/admin/route')
  const call = async (method: 'GET' | 'POST', host: string, body?: Record<string, unknown>) =>
    (await (method === 'GET' ? GET(req(host) as never) : POST(req(host, 'POST', { origin: `https://${host}`, 'content-type': 'application/json' }, body) as never))) as unknown as { status: number; body?: unknown }
  let res = await call('POST', 'ecole.donivers.test', { action: 'refundDonation', donationId: 'x' })
  check('bénévole : remboursement refusé (403)', res.status === 403)
  res = await call('POST', 'ecole.donivers.test', { action: 'inviteMember', email: 'eve@x.ca' })
  check('bénévole : inviter refusé (403)', res.status === 403)
  res = await call('POST', 'ecole.donivers.test', { action: 'purgeDemo' })
  check('bénévole : purge refusée (403)', res.status === 403)
  res = await call('POST', 'ecole.donivers.test', { action: 'setPhotoModeration', mode: 'moderation' })
  check('bénévole : modération permise', res.status === 200)
  res = await call('GET', 'musee.donivers.test')
  check('bénévole de A : console de B refusée', res.status === 403)
  res = await call('POST', 'ecole.donivers.test', { action: 'changeAddress', slug: 'theatre' })
  check('bénévole : changer l\'adresse refusé (403)', res.status === 403)
  res = await call('POST', 'ecole.donivers.test', { action: 'checkAddress', slug: 'theatre' })
  check('bénévole : vérifier une adresse refusé (403)', res.status === 403)
  res = await call('GET', 'ecole.donivers.test')
  check('bénévole : pas d\'adresse dans la console', (res.body as { address?: unknown }).address === null)

  jar.set(SESSION_COOKIE, anaToken)
  res = await call('POST', 'ecole.donivers.test', { action: 'inviteMember', email: 'Eve@X.ca', role: 'volunteer' })
  check('propriétaire : invitation envoyée par courriel', res.status === 200 && sent.some(x => x.kind === 'invitation' && x.to === 'eve@x.ca'))
  res = await call('POST', 'ecole.donivers.test', { action: 'inviteMember', email: 'bob@x.ca' })
  check('déjà dans l\'équipe : refusé', res.status === 400)
  res = await call('GET', 'ecole.donivers.test')
  check('propriétaire : adresse dans la console', (res.body as { address?: { current: string; domain: string } }).address?.current === 'ecole' && (res.body as { address: { domain: string } }).address.domain === 'donivers.test')
  res = await call('POST', 'ecole.donivers.test', { action: 'checkAddress', slug: 'musee' })
  check('propriétaire : adresse d\'un autre organisme « pris »', res.status === 200 && (res.body as { state: string }).state === 'pris')
  rpcs.change_org_slug = () => 'ok'
  res = await call('POST', 'ecole.donivers.test', { action: 'changeAddress', slug: 'theatre' })
  check('propriétaire : changement, la console continue à la nouvelle adresse', res.status === 200 && (res.body as { url: string }).url === 'https://theatre.donivers.test/admin')
  rpcs.change_org_slug = () => 'limite'
  res = await call('POST', 'ecole.donivers.test', { action: 'changeAddress', slug: 'theatre' })
  check('limite atteinte : refusé (400)', res.status === 400)
  delete rpcs.change_org_slug

  console.log('Équipe')
  check('dernier propriétaire : impossible à retirer', !(await auth.removeMember('orgA', anaId)).ok)
  const bobId = (bob as { account: { id: string } }).account.id
  check('retirer le bénévole', (await auth.removeMember('orgA', bobId)).ok)
  jar.set(SESSION_COOKIE, bobToken)
  r = await auth.requireAdmin(req('ecole.donivers.test'))
  check('bénévole retiré : plus d\'accès, même connecté', 'response' in r && r.response.status === 403)

  console.log('Mot de passe oublié et première connexion')
  check('adresse inconnue : rien n\'est envoyé', (await auth.linksForEmail('personne@x.ca')).length === 0)
  const links = await auth.linksForEmail('ana@x.ca')
  check('compte actif : lien de réinitialisation', links.length === 1 && links[0].kind === 'password_reset')
  check('pas un second lien dans les 2 minutes', (await auth.linksForEmail('ana@x.ca')).length === 0)
  const resetToken = links[0].token
  check('nouveau mot de passe faible refusé', !(await auth.resetPassword(resetToken, 'court')).ok)
  const rp = await auth.resetPassword(resetToken, 'nouveau-vitrail-9')
  check('nouveau mot de passe enregistré', rp.ok && (await auth.login('ana@x.ca', 'nouveau-vitrail-9')).ok)
  check('les anciennes sessions sont fermées', (await auth.accountFromToken(anaToken)) === null)
  check('le lien ne sert qu\'une fois', !(await auth.resetPassword(resetToken, 'encore-autre-88')).ok)

  // Invitation jamais ouverte : « première connexion » renvoie un NOUVEAU lien, l'ancien cesse de marcher
  const old = await auth.createInvitation({ email: 'zoe@x.ca', organizationId: 'orgB', role: 'owner', invitedBy: null })
  tables.invitations.at(-1)!.created_at = new Date(Date.now() - 10 * 60_000).toISOString()
  const again = await auth.linksForEmail('zoe@x.ca')
  check('invitée sans compte : nouveau lien d\'invitation', again.length === 1 && again[0].kind === 'invitation')
  check('l\'ancien lien ne marche plus', (await auth.invitationInfo(old.token)) === null && (await auth.invitationInfo(again[0].token)) !== null)

  console.log('Compte existant invité ailleurs')
  const invB = await auth.createInvitation({ email: 'ana@x.ca', organizationId: 'orgB', role: 'volunteer', invitedBy: null })
  check('sans être connecté : refusé (pas de prise de contrôle par le lien)', !(await auth.acceptInvitation(invB.token, { name: 'X', password: 'pirate-pirate-1', signedIn: null })).ok)
  const anaAcc = await auth.accountFromToken((rp as { token: string }).token)
  const okB = await auth.acceptInvitation(invB.token, { signedIn: anaAcc })
  check('connectée avec le bon compte : ajoutée à B, mot de passe inchangé', okB.ok && (await auth.login('ana@x.ca', 'nouveau-vitrail-9')).ok && tables.memberships.some(m => m.account_id === anaId && m.organization_id === 'orgB'))

  done()
}
main().catch(e => { console.error(e); process.exit(1) })

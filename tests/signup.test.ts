import { check, done, mocks } from './helpers'
import { reset, tables } from './fake-db'

// Inscription d'un organisme, entraînement, mise en ligne, adresses de la plateforme.
const jar = new Map<string, string>()
mocks['next/headers'] = {
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined) }),
  headers: async () => new Headers(),
}
process.env.PLATFORM_DOMAIN = 'donivers.test'

async function main() {
  const auth = await import('../lib/auth')
  const su = await import('../lib/signup')
  const hosts = await import('../lib/hosts')
  const { forgetTenantCache, resolveTenant } = await import('../lib/tenant')
  const { paymentModeFor } = await import('../lib/env')

  const seed = () => {
    reset()
    forgetTenantCache()
    jar.clear()
    tables.organizations = [{ id: 'orgA', status: 'live', name_fr: 'École A', texts: {}, photo_moderation: 'live', stripe_account_id: 'acct_A', stripe_ready: true, practice_of: null }]
    tables.organization_slugs = [{ slug: 'ecole', organization_id: 'orgA', is_current: true }]
    tables.vitraux = [{ id: 'permA', organization_id: 'orgA', kind: 'permanent', slug: null, name: 'A', state: 'active', in_main: true, goal_cents: 0 }]
  }

  console.log('Adresses de la plateforme')
  check('domaine nu = plateforme', hosts.isPlatformHost('donivers.test') && hosts.isPlatformHost('www.donivers.test:443'))
  check('un organisme n\'est pas la plateforme', !hosts.isPlatformHost('ecole.donivers.test'))
  process.env.LEGACY_PLATFORM_DOMAINS = 'donivers.studioexistence.com, ancien.ca'
  check('ancien domaine : organisme redirigé, chemin gardé', hosts.legacyRedirect('ecole.donivers.studioexistence.com', '/vitrail?src=qr') === 'https://ecole.donivers.test/vitrail?src=qr')
  check('ancien domaine nu → vitrine', hosts.legacyRedirect('ancien.ca', '/') === 'https://donivers.test/')
  check('domaine actuel : pas de redirection', hosts.legacyRedirect('ecole.donivers.test', '/') === null)
  check('domaine qui ressemble : pas de redirection', hosts.legacyRedirect('ecole.xancien.ca', '/') === null)
  delete process.env.LEGACY_PLATFORM_DOMAINS
  check('identifiant réservé', hosts.orgSlugProblem('studio') === 'reserve' && hosts.orgSlugProblem('www') === 'reserve')
  check('« -- » réservé à l\'entraînement', hosts.orgSlugProblem('mon--org') === 'forme')
  check('trop long pour son entraînement', hosts.orgSlugProblem('a'.repeat(34)) === 'forme' && hosts.orgSlugProblem('a'.repeat(33)) === null)
  const { linkTo } = await import('../lib/email')
  check('lien en prévisualisation : ?org= gardé', linkTo('https://x.vercel.app?org=ecole', '/admin/invitation?jeton=1') === 'https://x.vercel.app/admin/invitation?jeton=1&org=ecole')
  check('lien normal', linkTo('https://ecole.donivers.test/', '/inscription?jeton=2') === 'https://ecole.donivers.test/inscription?jeton=2')

  console.log('Organisme choisi en prévisualisation')
  seed()
  tables.organizations.push({ id: 'orgB', status: 'live', name_fr: 'B', texts: {}, photo_moderation: 'live', stripe_account_id: null, stripe_ready: false, practice_of: null })
  tables.organization_slugs.push({ slug: 'bee', organization_id: 'orgB', is_current: true })
  tables.vitraux.push({ id: 'permB', organization_id: 'orgB', kind: 'permanent', slug: null, name: 'B', state: 'active', in_main: true, goal_cents: 0 })
  const preq = new Request('https://x.vercel.app/vitrail', { headers: { host: 'x.vercel.app', cookie: `${hosts.PREVIEW_ORG_COOKIE}=bee` } })
  const env = process.env as Record<string, string | undefined>
  env.VERCEL_ENV = 'preview'
  let tr = await resolveTenant(preq)
  check('prévisualisation : le témoin choisit l\'organisme', 'tenant' in tr && tr.tenant.org.id === 'orgB')
  env.VERCEL_ENV = 'production'
  forgetTenantCache()
  process.env.DEFAULT_ORG_SLUG = 'ecole'
  tr = await resolveTenant(preq)
  check('production : le témoin est ignoré', 'tenant' in tr && tr.tenant.org.id === 'orgA')
  delete env.VERCEL_ENV

  console.log('Invitation à créer un organisme')
  seed()
  const inv = await auth.createInvitation({ email: 'julie@x.ca', organizationId: null, role: 'owner', invitedBy: null, orgName: 'Théâtre du Lac', message: 'Bienvenue', locale: 'fr' })
  const row = tables.invitations[0]
  check('14 jours, organisme vide', row.organization_id === null && new Date(row.expires_at as string).getTime() - Date.now() > 13 * 86_400_000)
  const si = await su.signupInvitation(inv.token)
  check('lue par l\'inscription', si?.email === 'julie@x.ca' && si.orgName === 'Théâtre du Lac')
  check('refusée par l\'acceptation d\'une invitation de membre', !(await auth.acceptInvitation(inv.token, { name: 'J', password: 'vitre-ambre-42' })).ok)
  check('nom → adresse proposée', su.suggestSlug('Théâtre du Lac !') === 'theatredulac')

  console.log('Adresse disponible')
  check('libre', (await su.checkOrgSlug('theatredulac')).ok)
  check('prise', !(await su.checkOrgSlug('ecole')).ok)
  tables.organization_slugs.push({ slug: 'lac--essai', organization_id: 'x', is_current: true })
  const lac = await su.checkOrgSlug('lac')
  check('prise par l\'entraînement d\'un autre', !lac.ok && lac.reason === 'pris')
  const res = await su.checkOrgSlug('plateforme')
  check('réservée', !res.ok && res.reason === 'reserve')

  console.log('Autre adresse : code de confirmation')
  let r = await su.signup({ token: inv.token, name: 'Julie', email: 'autre@x.ca', password: 'vitre-ambre-42', orgName: 'Théâtre du Lac', slug: 'theatredulac', terms: true })
  check('autre adresse sans code : refusée', !r.ok && r.error === 'courriel')
  const code = await su.newSignupCode(si!, 'autre@x.ca')
  check('code créé (seule son empreinte est gardée)', code.ok && !JSON.stringify(tables.signup_codes).includes((code as { code: string }).code))
  check('même adresse que l\'invitation : pas de code', !(await su.newSignupCode(si!, 'julie@x.ca')).ok)
  check('mauvais code', !(await su.verifySignupCode(si!, 'autre@x.ca', '000000')).ok || (code as { code: string }).code === '000000')
  check('bon code', (await su.verifySignupCode(si!, 'autre@x.ca', (code as { code: string }).code)).ok)
  for (let i = 0; i < 5; i++) await su.verifySignupCode(si!, 'autre@x.ca', '999999')

  console.log('Création')
  r = await su.signup({ token: inv.token, name: 'Julie', email: 'autre@x.ca', password: 'vitre-ambre-42', orgName: 'Théâtre du Lac', slug: 'theatredulac', terms: false })
  check('sans les conditions : refusé', !r.ok && r.error === 'conditions')
  r = await su.signup({ token: inv.token, name: 'Julie', email: 'autre@x.ca', password: 'vitre-ambre-42', orgName: 'Théâtre du Lac', slug: 'theatredulac', terms: true })
  check('créé', r.ok)
  const org = tables.organizations.find(o => o.name_fr === 'Théâtre du Lac' && !o.practice_of)!
  const practice = tables.organizations.find(o => o.practice_of === org.id)!
  check('langue de l\'inscription, nom dans ses textes', JSON.stringify(org.locales) === '["fr"]' && (org.texts as { fr?: { name?: string } }).fr?.name === 'Théâtre du Lac')
  check('organisme en brouillon, conditions enregistrées', org.status === 'draft' && org.terms_version === su.TERMS_VERSION && !!org.terms_accepted_by)
  check('son entraînement existe, à l\'adresse --essai', !!practice && tables.organization_slugs.some(s => s.slug === 'theatredulac--essai' && s.organization_id === practice.id))
  check('un vitrail permanent chacun', tables.vitraux.filter(v => v.organization_id === org.id || v.organization_id === practice.id).length === 2)
  const acc = tables.accounts.find(a => a.email === 'autre@x.ca')!
  check('propriétaire de l\'organisme réel seulement', tables.memberships.length === 1 && tables.memberships[0].organization_id === org.id && tables.memberships[0].role === 'owner')
  check('invitation servie', !!tables.invitations[0].accepted_at && !(await su.signupInvitation(inv.token)))
  check('session ouverte', r.ok && (await auth.accountFromToken(r.sessionToken))?.email === 'autre@x.ca')

  console.log('Entraînement et mise en ligne')
  forgetTenantCache()
  check('brouillon : dons fermés', paymentModeFor({ status: 'draft', stripeReady: false, practiceOf: null }) === 'off' || process.env.PAYMENT_MODE !== 'stripe')
  const role = await auth.accessRole(acc.id as string, { id: practice.id as string, practiceOf: org.id as string })
  check('l\'équipe accède à l\'entraînement par l\'organisme réel', role === 'owner')
  check('un inconnu n\'y accède pas', (await auth.accessRole('personne', { id: practice.id as string, practiceOf: org.id as string })) === null)
  check('mise en ligne refusée sans Stripe', !(await su.goLive(org.id as string)).ok)
  check('mise en ligne refusée pour l\'entraînement', (await su.goLive(practice.id as string)).ok === false)
  org.stripe_ready = true
  const jur = await su.goLive(org.id as string)
  check('mise en ligne refusée sans coordonnées juridiques (Loi 25)', !jur.ok && jur.error === 'juridique')
  org.legal = { entity: 'Théâtre du Lac inc.', address: '1 rue du Lac', officerName: 'Julie, directrice', officerEmail: 'julie@x.ca', officerPhone: '450 555-0000', retention: '7 ans' }
  check('mise en ligne avec Stripe prêt et coordonnées complètes', (await su.goLive(org.id as string)).ok && org.status === 'live' && !!org.went_live_at)
  check('pas deux fois', !(await su.goLive(org.id as string)).ok)
  check('l\'entraînement reste en brouillon', practice.status === 'draft')

  console.log('Course et compte existant')
  const inv2 = await auth.createInvitation({ email: 'autre@x.ca', organizationId: null, role: 'owner', invitedBy: null })
  r = await su.signup({ token: inv2.token, name: 'Julie', email: 'autre@x.ca', password: 'mauvais-mot-de-passe', orgName: 'Deux', slug: 'deux', terms: true })
  check('compte existant : son mot de passe est exigé', !r.ok && r.error === 'compte')
  const before = tables.organizations.length
  r = await su.signup({ token: inv2.token, name: 'Julie', email: 'autre@x.ca', password: 'vitre-ambre-42', orgName: 'Deux', slug: 'theatredulac', terms: true })
  check('adresse déjà prise : rien n\'est créé', !r.ok && r.error === 'adressePrise' && tables.organizations.length === before)
  r = await su.signup({ token: inv2.token, name: 'Julie', email: 'autre@x.ca', password: 'vitre-ambre-42', orgName: 'Deux', slug: 'deux', terms: true })
  check('second organisme pour le même compte', r.ok && tables.memberships.filter(m => m.account_id === acc.id).length === 2)

  console.log('Courriels de l\'entraînement')
  tables.email_log = []
  const { sendEmail } = await import('../lib/email')
  await sendEmail({ kind: 'receipt', to: 'inconnu@x.ca', locale: 'fr', organizationId: practice.id as string, subject: 's', content: { heading: 'h', paragraphs: ['p'] } as never })
  const blocked = (tables.email_log ?? []).find(l => l.to_email === 'inconnu@x.ca')
  check('hors équipe : non envoyé', !blocked || blocked.status === 'skipped')
  done()
}
main().catch(e => {
  console.error(e)
  process.exit(1)
})

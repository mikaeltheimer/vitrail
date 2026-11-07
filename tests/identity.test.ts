import { check, done, mocks } from './helpers'
import { reset, tables } from './fake-db'

// Identité des organismes en base (étape 5) : textes, repli, langues, entraînement, courriels, mise en ligne.
mocks['next/headers'] = { cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }
process.env.SUPABASE_URL = 'https://exemple.supabase.co'

async function main() {
  const shared = await import('../lib/identity-shared')
  const id = await import('../lib/identity')
  const { forgetTenantCache } = await import('../lib/tenant')
  const { emailIdentity, buildReceipt } = await import('../lib/email')
  const { surfaceOf } = await import('../lib/hosts')
  const { orgInitials } = await import('../components/OrgBrand')

  const seed = () => {
    reset()
    forgetTenantCache()
    id.forgetIdentity()
    tables.organizations = [
      {
        id: 'ecole', status: 'live', name_fr: "École d'art de Sutton", website_url: 'https://ecoleartsutton.ca/', practice_of: null, photo_moderation: 'live', stripe_ready: true,
        locales: ['fr', 'en'], logo_path: '/ecole-logo.png', icon_path: null, theme: { logoSize: [400, 99] }, sender_name: null, reply_to: null,
        texts: { fr: { name: "École d'art de Sutton", why: "L'École avance sans subvention." }, en: { name: 'Sutton School of Art' } },
        legal: { officerEmail: 'dpo@ecole.ca' },
      },
      { id: 'ecole-essai', status: 'draft', name_fr: "École d'art de Sutton", practice_of: 'ecole', photo_moderation: 'live', stripe_ready: false, locales: ['fr'], texts: {}, legal: {}, theme: {} },
      { id: 'lac', status: 'draft', name_fr: 'Théâtre du Lac', practice_of: null, photo_moderation: 'live', stripe_ready: false, locales: ['en'], texts: { en: { name: 'Lake Theatre' } }, legal: {}, theme: {}, logo_path: 'org/lac/logo-1.png' },
    ]
    tables.organization_slugs = [
      { slug: 'ecoleartsutton', organization_id: 'ecole', is_current: true },
      { slug: 'ecoleartsutton--essai', organization_id: 'ecole-essai', is_current: true },
      { slug: 'lac', organization_id: 'lac', is_current: true },
    ]
  }

  console.log('Textes et repli')
  seed()
  const ecole = (await id.getIdentity({ id: 'ecole', practiceOf: null }))!
  check('textes de la langue', ecole.texts.fr.why === "L'École avance sans subvention.")
  check('anglais vide → version française', ecole.texts.en.why === "L'École avance sans subvention.")
  check('nom anglais', ecole.texts.en.name === 'Sutton School of Art')
  check('champ jamais rempli → texte neutre avec SON nom', ecole.texts.fr.testimonial.question.includes("École d'art de Sutton"))
  check('présentation vide → section masquée', ecole.texts.fr.about === '')
  check('logo statique', ecole.logoUrl === '/ecole-logo.png' && ecole.logoSize?.[0] === 400)
  check('réponse : le responsable', ecole.replyTo === 'dpo@ecole.ca')
  const lac = (await id.getIdentity({ id: 'lac', practiceOf: null }))!
  check('nouvel organisme : rien de l\'École', !JSON.stringify(lac).match(/cole|Sutton/))
  check('organisme anglophone : langue principale anglaise', lac.locales.join() === 'en' && lac.texts.fr.name === 'Lake Theatre')
  check('logo téléversé : adresse du bucket', lac.logoUrl === 'https://exemple.supabase.co/storage/v1/object/public/photos/org/lac/logo-1.png')
  check('sans site : lien vide', lac.texts.en.url === '')

  console.log('Entraînement')
  const essai = (await id.getIdentity({ id: 'ecole-essai', practiceOf: 'ecole' }))!
  check('reprend l\'identité de l\'organisme réel', essai.orgId === 'ecole' && essai.locales.join() === 'fr,en' && essai.logoUrl === '/ecole-logo.png')
  check('courriel de l\'entraînement : identité de l\'organisme réel', (await id.identityOrNeutral('ecole-essai')).orgId === 'ecole')
  check('organisme inconnu : identité neutre de la plateforme', (await id.identityOrNeutral('personne')).texts.fr.name === 'Donivers')

  console.log('Langues')
  check('langue offerte gardée', shared.clampLocale(['fr', 'en'], 'en') === 'en')
  check('langue non offerte → principale', shared.clampLocale(['en'], 'fr') === 'en')
  check('colonne vide → français', shared.parseLocales(null).join() === 'fr' && shared.parseLocales(['xx', 'en', 'en']).join() === 'en')

  console.log('Courriels')
  const e = emailIdentity(lac, 'fr')
  check('courriel en anglais pour un organisme anglophone', e.locale === 'en')
  check('expéditeur : le nom de l\'organisme', e.from.fromName === 'Lake Theatre')
  const r = buildReceipt({ amountCents: 2500, token: 'x', locale: e.locale, baseUrl: 'https://lac.test', org: e.build.org })
  check('reçu : nom et question de l\'organisme', r.subject.includes('Lake Theatre') && JSON.stringify(r.content).includes('Why do you support Lake Theatre?'))

  console.log('Mise en ligne')
  check('tout manque', shared.missingForLaunch({}).length === 6)
  check('espaces = vide', shared.missingForLaunch({ entity: '  ', address: 'a', officerName: 'b', officerEmail: 'c', officerPhone: 'd', retention: 'e' }).join() === 'entity')

  console.log('Mon vitrail : enregistrement')
  seed()
  let current: { id: string; practiceOf: string | null } = { id: 'lac', practiceOf: null }
  mocks['@/lib/auth'] = { requireAdmin: async () => ({ ctx: { tenant: { org: current } } }) }
  const route = await import('../app/api/admin/identite/route')
  const post = (body: unknown) => route.POST(new Request('https://lac.test/api/admin/identite', { method: 'POST', body: JSON.stringify(body) }) as never)
  const ok = { locales: ['en', 'fr'], texts: { en: { name: 'Lake Theatre', about: '  Theatre by the lake.  ' }, fr: { name: 'Théâtre du Lac' } }, websiteUrl: 'lactheatre.org', legal: { officerEmail: 'DPO@Lac.org' }, senderName: '', replyTo: '' }
  let res = await post(ok)
  const row = tables.organizations.find(o => o.id === 'lac')!
  check('enregistré', res.status === 200 && row.name_fr === 'Lake Theatre' && JSON.stringify(row.locales) === '["en","fr"]')
  check('texte nettoyé, site complété en https', (row.texts as { en: { about: string } }).en.about === 'Theatre by the lake.' && row.website_url === 'https://lactheatre.org/')
  check('courriel du responsable en minuscules, date posée', (row.legal as { officerEmail: string; updated: string }).officerEmail === 'dpo@lac.org' && /^\d{4}-\d{2}-\d{2}$/.test((row.legal as { updated: string }).updated))
  check('manque renvoyé', ((await res.json()) as { missing: string[] }).missing.length === 5)
  res = await post({ ...ok, texts: { en: { name: '' } } })
  check('nom obligatoire dans la langue principale', res.status === 400)
  res = await post({ ...ok, texts: { en: { name: 'x'.repeat(81) } } })
  check('texte trop long refusé', res.status === 400)
  res = await post({ ...ok, locales: ['de'] })
  check('langue inconnue refusée', res.status === 400)
  res = await post({ ...ok, websiteUrl: 'javascript:alert(1)' })
  check('site web : pas de javascript:', res.status === 400)
  res = await post({ ...ok, legal: { officerEmail: 'pas-un-courriel' } })
  check('courriel du responsable invalide refusé', res.status === 400)
  current = { id: 'ecole-essai', practiceOf: 'ecole' }
  res = await post(ok)
  check('entraînement : refusé (identité de l\'organisme réel)', res.status === 400)
  delete mocks['@/lib/auth']

  console.log('Sortes de pages et initiales')
  process.env.PLATFORM_DOMAIN = 'donivers.test'
  check('vitrine', surfaceOf('donivers.test', '/') === 'platform' && surfaceOf('x.vercel.app', '/inscription') === 'platform')
  check('console', surfaceOf('lac.donivers.test', '/admin') === 'console' && surfaceOf('lac.donivers.test', '/api/admin/identite') === 'console')
  check('page d\'organisme', surfaceOf('lac.donivers.test', '/vitrail') === 'org' && surfaceOf('lac.donivers.test', '/adminx') === 'org')
  check('initiales', orgInitials("École d'art de Sutton") === 'ÉS' && orgInitials('Lake Theatre') === 'LT' && orgInitials('Photogravie') === 'P')
  done()
}
main().catch(e => {
  console.error(e)
  process.exit(1)
})

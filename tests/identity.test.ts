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
  check('tout manque (NEQ et conservation facultatifs)', shared.missingForLaunch({}).length === 5)
  check('espaces = vide', shared.missingForLaunch({ entity: '  ', address: 'a', officerName: 'b', officerEmail: 'c', officerPhone: 'd' }).join() === 'entity')
  check('téléphone : 10 chiffres', shared.formatPhone('514-666-7766') === '+1 514 666 7766' && shared.formatPhone('(514) 666 7766') === '+1 514 666 7766')
  check('téléphone : avec le 1', shared.formatPhone('1 514 666 7766') === '+1 514 666 7766' && shared.formatPhone('+15146667766') === '+1 514 666 7766')
  check('téléphone : poste', shared.formatPhone('514 666 7766 poste 12') === '+1 514 666 7766 poste 12')
  check('téléphone : étranger ou incomplet laissé tel quel', shared.formatPhone('+33 1 23 45 67 89') === '+33 1 23 45 67 89' && shared.formatPhone('666 77') === '666 77')

  console.log('Mon vitrail (console) : coordonnées seulement')
  seed()
  let current: { id: string; practiceOf: string | null } = { id: 'lac', practiceOf: null }
  mocks['@/lib/auth'] = { requireAdmin: async () => ({ ctx: { tenant: { org: current } } }) }
  const route = await import('../app/api/admin/identite/route')
  const post = (body: unknown) => route.POST(new Request('https://lac.test/api/admin/identite', { method: 'POST', body: JSON.stringify(body) }) as never)
  const ok = { websiteUrl: 'lactheatre.org', legal: { officerEmail: 'DPO@Lac.org', entity: '  Lake Theatre Inc.  ' }, senderName: '', replyTo: '', texts: { en: { name: 'Pirate' } } }
  let res = await post(ok)
  const row = tables.organizations.find(o => o.id === 'lac')!
  check('enregistré, site complété en https', res.status === 200 && row.website_url === 'https://lactheatre.org/')
  check('coordonnées nettoyées, date posée', (row.legal as { entity: string }).entity === 'Lake Theatre Inc.' && (row.legal as { officerEmail: string }).officerEmail === 'dpo@lac.org' && /^\d{4}-\d{2}-\d{2}$/.test((row.legal as { updated: string }).updated))
  check('les textes n\'y passent plus (atelier)', (row.texts as { en: { name: string } }).en.name === 'Lake Theatre')
  check('manque renvoyé', ((await res.json()) as { missing: string[] }).missing.length === 3)
  res = await post({ ...ok, websiteUrl: 'javascript:alert(1)' })
  check('site web : pas de javascript:', res.status === 400)
  res = await post({ ...ok, legal: { officerEmail: 'pas-un-courriel' } })
  check('courriel du responsable invalide refusé', res.status === 400)
  current = { id: 'ecole-essai', practiceOf: 'ecole' }
  check('depuis l\'atelier : refusé', (await post(ok)).status === 400)

  console.log('Atelier : brouillon, publication, abandon')
  seed()
  current = { id: 'ecole-essai', practiceOf: 'ecole' }
  const at = await import('../app/api/atelier/route')
  const apost = async (body: unknown) => {
    const r = (await at.POST(new Request('https://x.test/api/atelier', { method: 'POST', body: JSON.stringify(body) }) as never))!
    return { status: r.status, body: (await r.json()) as { pending: boolean; texts: Record<string, Record<string, string>>; locales: string[] } }
  }
  let ar = await apost({ action: 'save', texts: { fr: { name: "École d'art de Sutton", why: '  Nouveau pourquoi.  ' } } })
  check('brouillon enregistré', ar.status === 200 && ar.body.pending && ar.body.texts.fr.why === 'Nouveau pourquoi.')
  check('anglais gardé dans le brouillon', ar.body.texts.en.name === 'Sutton School of Art')
  id.forgetIdentity()
  check('l\'atelier montre le brouillon', (await id.getIdentity({ id: 'ecole-essai', practiceOf: 'ecole' }))!.texts.fr.why === 'Nouveau pourquoi.')
  check('le vrai vitrail garde la version publiée', (await id.getIdentity({ id: 'ecole', practiceOf: null }))!.texts.fr.why === "L'École avance sans subvention.")
  ar = await apost({ action: 'save', locales: ['en'] })
  check('langues du brouillon', ar.body.locales.join() === 'en')
  check('langue inconnue refusée', (await apost({ action: 'save', locales: ['de'] })).status === 400)
  check('texte trop long refusé', (await apost({ action: 'save', texts: { fr: { name: 'x'.repeat(81) } } })).status === 400)
  ar = await apost({ action: 'publish' })
  const ecoleRow = tables.organizations.find(o => o.id === 'ecole')!
  check('publié : le vrai vitrail change', ar.status === 200 && !ar.body.pending && (ecoleRow.texts as { fr: { why: string } }).fr.why === 'Nouveau pourquoi.' && JSON.stringify(ecoleRow.locales) === '["en"]')
  check('publié : nom de la langue principale', ecoleRow.name_fr === 'Sutton School of Art' && tables.organizations.find(o => o.id === 'ecole-essai')!.name_fr === 'Sutton School of Art')
  check('plus rien à publier', (await apost({ action: 'publish' })).status === 400)
  await apost({ action: 'save', texts: { en: { why: 'Oops' } } })
  ar = await apost({ action: 'discard' })
  check('abandon : retour à la version publiée', !ar.body.pending && ar.body.texts.en.why !== 'Oops' && !(ecoleRow.draft))
  console.log('Atelier : images')
  const removed: string[] = []
  const fdb = (await import('./fake-db')).fakeDb as unknown as { storage?: unknown }
  fdb.storage = { from: () => ({ remove: async (p: string[]) => (removed.push(...p), { error: null }), upload: async () => ({ error: null }) }) }
  const { setDraftImage } = await import('../lib/atelier')
  ecoleRow.logo_path = 'org/ecole/logo-publie.png'
  await setDraftImage('ecole', 'logo', 'org/ecole/logo-a.png', [300, 80])
  await setDraftImage('ecole', 'logo', 'org/ecole/logo-b.png', [300, 80])
  check('image de brouillon remplacée : effacée', removed.join() === 'org/ecole/logo-a.png')
  check('image publiée gardée tant que non publié', ecoleRow.logo_path === 'org/ecole/logo-publie.png')
  await apost({ action: 'publish' })
  check('publié : l\'ancienne image publiée est effacée', ecoleRow.logo_path === 'org/ecole/logo-b.png' && removed.includes('org/ecole/logo-publie.png'))
  await setDraftImage('ecole', 'logo', 'org/ecole/logo-c.png', [300, 80])
  await apost({ action: 'discard' })
  check('abandon : l\'image non publiée est effacée', removed.includes('org/ecole/logo-c.png') && ecoleRow.logo_path === 'org/ecole/logo-b.png')
  check('fichier statique jamais effacé', !removed.some(p => p.startsWith('/')))

  current = { id: 'ecole', practiceOf: null }
  check('hors de l\'atelier : refusé', (await apost({ action: 'save', texts: {} })).status === 404)
  delete mocks['@/lib/auth']

  console.log('Sortes de pages et initiales')
  process.env.PLATFORM_DOMAIN = 'donivers.test'
  check('vitrine', surfaceOf('donivers.test', '/') === 'platform' && surfaceOf('x.vercel.app', '/inscription') === 'platform')
  check('console', surfaceOf('lac.donivers.test', '/admin') === 'console' && surfaceOf('lac.donivers.test', '/api/admin/identite') === 'console')
  check('page d\'organisme', surfaceOf('lac.donivers.test', '/vitrail') === 'org' && surfaceOf('lac.donivers.test', '/adminx') === 'org')
  check('initiales', orgInitials("École d'art de Sutton") === 'ÉS' && orgInitials('Lake Theatre') === 'LT' && orgInitials('Photogravie') === 'P')
  console.log('Questions du témoignage')
  {
    const rq = shared.resolveQuestions
    const stored = { fr: { question: 'Pourquoi ?', question2: 'Un souvenir ?', question3: '' }, en: { question: 'Why?' } }
    check('les questions de la langue, vides retirées', JSON.stringify(rq(stored, ['fr', 'en'], 'fr', 'neutre')) === JSON.stringify(['Pourquoi ?', 'Un souvenir ?']))
    check('une langue avec sa propre première question ne reprend pas celles de l’autre', JSON.stringify(rq(stored, ['fr', 'en'], 'en', 'neutral')) === JSON.stringify(['Why?']))
    check('langue sans question : celles de la langue principale', JSON.stringify(rq({ fr: { question: 'A ?', question2: 'B ?' } }, ['fr', 'en'], 'en', 'x')) === JSON.stringify(['A ?', 'B ?']))
    check('aucune question : la question neutre', JSON.stringify(rq({}, ['fr'], 'fr', 'neutre')) === JSON.stringify(['neutre']))
    check('doublons retirés', rq({ fr: { question: 'A', question2: 'A' } }, ['fr'], 'fr', 'x').length === 1)
    const { cleanQuestion, validateProfile } = await import('../lib/validate')
    check('question acceptée seulement si c’est une des questions de l’organisme', cleanQuestion(' Pourquoi ? ', ['Pourquoi ?']) === 'Pourquoi ?' && cleanQuestion('Achetez ici', ['Pourquoi ?']) === null && cleanQuestion(42, ['42']) === null)
    const v = validateProfile({ message: 'Merci', question: 'Pourquoi ?' }, undefined, ['Pourquoi ?'])
    check('profil : la question suit le témoignage', v.ok && v.value.question === 'Pourquoi ?')
    const w = validateProfile({ message: '', question: 'Pourquoi ?' }, undefined, ['Pourquoi ?'])
    check('profil sans témoignage : pas de question', w.ok && w.value.question === null)
    seed()
    tables.organizations[0].texts = { fr: { name: 'École', question: 'Pourquoi ?', question2: 'Un souvenir ?' }, en: { question: 'Why?' } }
    const qs = await id.questionsOf({ id: 'ecole', practiceOf: null })
    check('toutes les questions de l’organisme, dans toutes ses langues', qs.length === 3 && qs.includes('Why?') && qs.includes('Un souvenir ?'), qs)
  }

  done()
}
main().catch(e => {
  console.error(e)
  process.exit(1)
})

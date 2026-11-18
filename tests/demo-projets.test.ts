import { check, done, mocks } from './helpers'
import { reset, tables } from './fake-db'

// Démonstrations par projet (lib/demo-projets.ts) : création au nom d'un organisme, contenu neutre, logo, régénération,
// suppression ; jamais un vrai organisme, un atelier ni la démo de la vitrine.
mocks['next/headers'] = { cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }
process.env.SUPABASE_URL = 'https://exemple.supabase.co'
const P = 'https://exemple.supabase.co/storage/v1/object/public/photos/'

/** Un PNG minimal : signature, puis largeur et hauteur aux octets 16 et 20 (bloc IHDR). */
function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(40)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b)
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}

async function main() {
  const files = new Set<string>()
  const fdb = (await import('./fake-db')).fakeDb as unknown as { storage?: unknown }
  fdb.storage = {
    from: () => ({
      upload: async (p: string) => (files.add(p), { data: { path: p }, error: null }),
      remove: async (ps: string[]) => (ps.forEach(p => files.delete(p)), { data: [], error: null }),
    }),
  }
  const demo = await import('../lib/demo')
  const projets = await import('../lib/demo-projets')
  const { identityFromRow } = await import('../lib/identity')
  const { NEUTRAL_TESTIMONIALS_EN, NEUTRAL_TESTIMONIALS_FR, TESTIMONIALS_FR } = await import('../lib/demo-data')
  const { paymentModeFor } = await import('../lib/env')
  const NOW = Date.parse('2026-12-04T19:00:00Z')
  const orgOf = (slug: string) => tables.organizations.find(o => o.id === tables.organization_slugs.find(s => s.slug === slug)?.organization_id)
  const donorsOf = (id: unknown) => tables.donors.filter(d => d.organization_id === id)

  console.log('Contenu neutre')
  check('témoignages neutres : aucun ne nomme le Centre de la vitrine', [...NEUTRAL_TESTIMONIALS_FR, ...NEUTRAL_TESTIMONIALS_EN].every(t => !/centre|village/i.test(t.text)))
  check('témoignages neutres : sans doublon, distincts de ceux de la vitrine', new Set(NEUTRAL_TESTIMONIALS_FR.map(t => t.text)).size === NEUTRAL_TESTIMONIALS_FR.length && !NEUTRAL_TESTIMONIALS_FR.some(t => TESTIMONIALS_FR.some(v => v.text === t.text)))
  check('graine propre à l’adresse', projets.seedOf('theatre-du-lac') === projets.seedOf('theatre-du-lac') && projets.seedOf('theatre-du-lac') !== projets.seedOf('musee-du-lac'))

  console.log('Création')
  reset()
  files.clear()
  tables.organizations = [{ id: 'vrai', name_fr: 'Vrai organisme', status: 'live', showcase: false, theme: {}, practice_of: null, texts: {}, locales: ['fr'] }]
  tables.organization_slugs = [{ slug: 'vrai', organization_id: 'vrai', is_current: true }]
  tables.vitraux = [{ id: 'vrai-v', organization_id: 'vrai', kind: 'permanent' }]
  tables.donors = [{ id: 'vrai-d', organization_id: 'vrai', email: 'a@exemple.org', show_name: true, photo_url: null }]
  tables.donations = [{ id: 'vrai-n', organization_id: 'vrai', donor_id: 'vrai-d', amount_cents: 5000 }]
  await demo.generateDemo(NOW)
  const vitrine = tables.organizations.find(o => o.showcase)!

  const refuse = async (input: Record<string, unknown>) => {
    const r = await projets.createProjectDemo({ slug: 'theatre-du-lac', locales: ['fr'], texts: { fr: { name: 'Théâtre du Lac' } }, ...input }, NOW)
    return r.ok ? 'ok' : r.error
  }
  check('adresse réservée refusée (« demo », « studio »)', (await refuse({ slug: 'demo' })) === 'reserve' && (await refuse({ slug: 'studio' })) === 'reserve')
  check('adresse mal formée refusée', (await refuse({ slug: 'Théâtre du Lac' })) === 'forme' && (await refuse({ slug: 'a--b' })) === 'forme')
  check('adresse déjà prise refusée', (await refuse({ slug: 'vrai' })) === 'pris')
  check('nom exigé dans la langue principale', (await refuse({ texts: { fr: { name: ' ' } } })) === 'nom' && (await refuse({ locales: ['en', 'fr'], texts: { fr: { name: 'Théâtre du Lac' } } })) === 'nom')
  check('langues invalides refusées', (await refuse({ locales: [] })) === 'langues' && (await refuse({ locales: ['fr', 'de'] })) === 'langues')
  check('texte trop long refusé', (await refuse({ texts: { fr: { name: 'x'.repeat(81) } } })) === 'textes')
  check('refus : rien créé', tables.organizations.length === 2 && tables.organization_slugs.length === 2)

  const c = await projets.createProjectDemo({ slug: ' Theatre-du-Lac ', locales: ['fr', 'en'], texts: { fr: { name: 'Théâtre du Lac', vitrailTitle: 'Un théâtre pour tout le monde' }, en: { name: 'Lake Theatre' } } }, NOW)
  check('créée', c.ok && c.slug === 'theatre-du-lac')
  const org = orgOf('theatre-du-lac')!
  check('organisme de démonstration, marqué « par projet », en ligne', !!org && org.showcase === true && (org.theme as { demoProjet?: boolean }).demoProjet === true && org.status === 'live' && org.name_fr === 'Théâtre du Lac')
  check('paiements fermés', paymentModeFor({ status: 'live', stripeReady: true, showcase: true }) === 'off')
  check('vitrail permanent, au titre choisi', tables.vitraux.filter(v => v.organization_id === org.id && v.kind === 'permanent' && v.name === 'Un théâtre pour tout le monde').length === 1)
  const ds = donorsOf(org.id)
  check(`${demo.DEMO_DONORS} donateurs fictifs`, ds.length === demo.DEMO_DONORS && ds.every(d => String(d.email).endsWith('@demo.invalid')))
  check('dons « seed », jamais Stripe', tables.donations.filter(n => n.organization_id === org.id).every(n => n.source === 'seed' && n.provider_ref === null))
  const neutral = new Set([...NEUTRAL_TESTIMONIALS_FR, ...NEUTRAL_TESTIMONIALS_EN].map(t => t.text))
  check('témoignages neutres seulement', ds.some(d => d.message) && ds.every(d => !d.message || neutral.has(d.message as string)))
  check('la question est celle de l’organisme, dans la langue du donateur', ds.filter(d => d.message).every(d => d.message_question === (d.locale === 'en' ? 'Why do you support Lake Theatre?' : 'Pourquoi soutenez-vous Théâtre du Lac ?')), ds.find(d => d.message)?.message_question)
  check('des donateurs dans les deux langues', ds.some(d => d.locale === 'en') && ds.some(d => d.locale === 'fr'))
  const id = identityFromRow(org as never)
  check('identité : démonstration par projet', id.showcase && id.showcaseProject)
  check('identité : la démo de la vitrine n’est pas « par projet »', identityFromRow(vitrine as never).showcase && !identityFromRow(vitrine as never).showcaseProject)
  check('la démo de la vitrine et le vrai organisme sont intacts', donorsOf(vitrine.id).length === demo.DEMO_DONORS && donorsOf('vrai').length === 1 && tables.donations.some(n => n.id === 'vrai-n'))

  const only = await projets.createProjectDemo({ slug: 'musee-du-lac', locales: ['fr'], texts: { fr: { name: 'Musée du Lac' }, en: { name: 'Ignoré' } } }, NOW)
  const musee = orgOf('musee-du-lac')!
  check('français seulement : aucun donateur anglophone, textes anglais écartés', only.ok && donorsOf(musee.id).every(d => d.locale === 'fr') && !(musee.texts as Record<string, unknown>).en)
  check('deux démonstrations : donateurs différents', JSON.stringify(donorsOf(musee.id).map(d => d.display_name)) !== JSON.stringify(ds.map(d => d.display_name)))

  console.log('Liste')
  const list = await projets.listProjectDemos()
  check('la liste a les deux démonstrations par projet, pas la vitrine ni le vrai organisme', list.length === 2 && list.every(d => ['theatre-du-lac', 'musee-du-lac'].includes(d.slug)))
  check('la liste donne nom, langues et nombre de donateurs', list.find(d => d.slug === 'theatre-du-lac')?.name === 'Théâtre du Lac' && list.every(d => d.donors === demo.DEMO_DONORS))

  console.log('Logo et photos')
  const refused = await projets.setProjectDemoImage(org.id, 'logo', Buffer.from('<svg/>'))
  check('logo : seulement un PNG', !refused.ok && refused.error === 'image' && files.size === 0)
  check('logo : dimensions bornées', !(await projets.setProjectDemoImage(org.id, 'logo', png(4000, 100))).ok)
  await projets.setProjectDemoImage(org.id, 'logo', png(300, 80))
  const first = org.logo_path as string
  check('logo rangé chez la démonstration, taille notée', first.startsWith(`org/${org.id}/logo-`) && files.has(first) && JSON.stringify((org.theme as { logoSize?: number[] }).logoSize) === '[300,80]')
  check('la marque « par projet » survit au logo', (org.theme as { demoProjet?: boolean }).demoProjet === true)
  await projets.setProjectDemoImage(org.id, 'logo', png(200, 60))
  check('logo remplacé : l’ancien fichier est effacé', !files.has(first) && files.has(org.logo_path as string) && files.size === 1)
  check('logo : jamais sur un vrai organisme ni sur la vitrine', !(await projets.setProjectDemoImage('vrai', 'logo', png(10, 10))).ok && !(await projets.setProjectDemoImage(vitrine.id, 'logo', png(10, 10))).ok && files.size === 1)
  await demo.addDemoPhoto(Buffer.from([0xff, 0xd8, 0xff, 0]), (await projets.projectDemoId(org.id))!)
  const photo = donorsOf(org.id).find(d => d.photo_url)?.photo_url as string
  check('photo rangée chez la démonstration (pas chez la vitrine)', !!photo && photo.startsWith(`${P}org/${org.id}/d/`) && !donorsOf(vitrine.id).some(d => d.photo_url))
  check('projectDemoId : null pour un vrai organisme, la vitrine, un inconnu', (await projets.projectDemoId('vrai')) === null && (await projets.projectDemoId(vitrine.id)) === null && (await projets.projectDemoId('nulle-part')) === null && (await projets.projectDemoId(null)) === null)

  console.log('Régénérer et modifier')
  const before = JSON.stringify(donorsOf(org.id).map(d => d.display_name))
  check('régénérer', (await projets.regenerateProjectDemo(org.id, NOW + 86_400_000)).ok)
  check('régénérer : mêmes donateurs, photo gardée, pas de doublon', JSON.stringify(donorsOf(org.id).map(d => d.display_name)) === before && donorsOf(org.id).filter(d => d.photo_url).length === 1 && donorsOf(org.id).length === demo.DEMO_DONORS)
  check('régénérer : jamais un vrai organisme ni la vitrine', !(await projets.regenerateProjectDemo('vrai', NOW)).ok && !(await projets.regenerateProjectDemo(vitrine.id, NOW)).ok && donorsOf('vrai').length === 1)
  const u = await projets.updateProjectDemo(org.id, { locales: ['fr'], texts: { fr: { name: 'Théâtre du Grand Lac', question: 'Pourquoi le théâtre ?' } } }, NOW)
  check('modifier : nom, langues et question suivent', u.ok && org.name_fr === 'Théâtre du Grand Lac' && donorsOf(org.id).every(d => d.locale === 'fr') && donorsOf(org.id).filter(d => d.message).every(d => d.message_question === 'Pourquoi le théâtre ?'))
  check('modifier : logo et marque gardés', !!org.logo_path && (org.theme as { demoProjet?: boolean }).demoProjet === true)
  check('modifier : jamais un vrai organisme', !(await projets.updateProjectDemo('vrai', { locales: ['fr'], texts: { fr: { name: 'Piraté' } } }, NOW)).ok && tables.organizations.find(o => o.id === 'vrai')!.name_fr === 'Vrai organisme')

  console.log('Supprimer')
  check('supprimer : jamais un vrai organisme ni la vitrine', !(await projets.deleteProjectDemo('vrai')).ok && !(await projets.deleteProjectDemo(vitrine.id)).ok && tables.organizations.length === 4)
  const orgId = org.id
  check('supprimer', (await projets.deleteProjectDemo(orgId)).ok)
  check('supprimer : organisme, adresse, vitrail, donateurs et dons effacés', !tables.organizations.some(o => o.id === orgId) && !tables.organization_slugs.some(s => s.slug === 'theatre-du-lac') && !tables.vitraux.some(v => v.organization_id === orgId) && !donorsOf(orgId).length && !tables.donations.some(n => n.organization_id === orgId))
  check('supprimer : logo et photo effacés', files.size === 0)
  check('supprimer : les autres sont intacts', donorsOf(musee.id).length === demo.DEMO_DONORS && donorsOf(vitrine.id).length === demo.DEMO_DONORS && donorsOf('vrai').length === 1 && tables.vitraux.some(v => v.id === 'vrai-v'))
  check('l’adresse est de nouveau libre', (await refuse({})) === 'ok')

  console.log('Limite')
  reset()
  tables.organizations = Array.from({ length: projets.PROJECT_DEMO_MAX }, (_, i) => ({ id: `p${i}`, name_fr: `P${i}`, showcase: true, practice_of: null, theme: { demoProjet: true }, created_at: '2026-11-01T00:00:00Z' }))
  tables.organization_slugs = []
  check(`au plus ${projets.PROJECT_DEMO_MAX} démonstrations`, (await refuse({})) === 'limite')

  console.log('Écran jumelé')
  const { validateScreenPiece } = await import('../lib/demo-screen')
  const piece = { name: 'Camille', message: 'Bravo', question: 'Pourquoi soutenez-vous Théâtre du Lac ?', color: (await import('../lib/config')).VALID_COLORS[0], amountCents: 2500 }
  const own = validateScreenPiece(piece, ['Pourquoi soutenez-vous Théâtre du Lac ?'])
  check('la question d’une démonstration par projet est acceptée sur son écran', own.ok && own.value.question === piece.question)
  const other = validateScreenPiece(piece)
  check('sans ses questions (démo de la vitrine) : question écartée, don gardé', other.ok && other.value.question === null)
}

main().then(done, e => { console.error(e); process.exit(1) })

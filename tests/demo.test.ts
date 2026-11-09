import { check, done, mocks } from './helpers'
import { reset, tables } from './fake-db'

// Vitrail de démonstration (étape C) : génération déterministe, lecture seule, photos gardées d'une génération à l'autre.
mocks['next/headers'] = { cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }
process.env.SUPABASE_URL = 'https://exemple.supabase.co'
const P = 'https://exemple.supabase.co/storage/v1/object/public/photos/'

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
  const { paymentModeFor } = await import('../lib/env')
  const { ANON_LABEL } = await import('../lib/config')
  const { TESTIMONIALS_EN, TESTIMONIALS_FR } = await import('../lib/demo-data')

  const NOW = Date.parse('2026-12-04T19:00:00Z')
  console.log('Génération')
  const a = demo.generateDemoDonors(NOW)
  const b = demo.generateDemoDonors(NOW)
  check('déterministe (même graine, mêmes donateurs)', JSON.stringify(a) === JSON.stringify(b))
  check(`${demo.DEMO_DONORS} donateurs`, a.length === demo.DEMO_DONORS)
  const named = a.filter(d => d.showName)
  check('environ 3 sur 4 nommés', named.length > 120 && named.length < 170, named.length)
  check('noms uniques', new Set(named.map(d => d.displayName)).size === named.length)
  check('anonymes : étiquette standard', a.filter(d => !d.showName).every(d => d.displayName === ANON_LABEL))
  check('courriels inexistants (.invalid) et uniques', a.every(d => d.email.endsWith('@demo.invalid')) && new Set(a.map(d => d.email)).size === a.length)
  const messages = a.map(d => d.message).filter((m): m is string => !!m)
  check('témoignages sans répétition', new Set(messages).size === messages.length && messages.length > 40, messages.length)
  check('témoignage dans la langue du donateur', a.every(d => !d.message || (d.locale === 'en' ? TESTIMONIALS_EN : TESTIMONIALS_FR).includes(d.message)))
  const all = a.flatMap(d => d.donations)
  check('toutes les dates avant la génération, sur six semaines', all.every(n => Date.parse(n.at) < NOW && NOW - Date.parse(n.at) < 43 * 86_400_000))
  check('des dons récents (dernières 24 h) pour « Derniers dons »', all.some(n => NOW - Date.parse(n.at) < 86_400_000))
  const total = all.reduce((n, d) => n + d.amountCents, 0)
  check('total plausible pour un village (10 000 à 40 000 $)', total > 1_000_000 && total < 4_000_000, total / 100)
  check('quelques donateurs ont donné plusieurs fois', a.some(d => d.donations.length > 1))

  console.log('Lecture seule')
  check('paiements toujours fermés, même en mode démo global', paymentModeFor({ status: 'live', stripeReady: true, showcase: true }) === 'off')

  console.log('En base')
  reset()
  files.clear()
  tables.organizations = []
  tables.organization_slugs = []
  const s1 = await demo.generateDemo(NOW)
  const org = tables.organizations.find(o => o.showcase)
  check('organisme de démonstration créé', !!org && org.status === 'live' && org.name_fr === 'Fondation Pleine Lumière')
  check('adresse « demo »', tables.organization_slugs.some(s => s.slug === 'demo' && s.organization_id === org!.id))
  check('vitrail permanent', tables.vitraux.filter(v => v.organization_id === org!.id && v.kind === 'permanent').length === 1)
  check('donateurs et dons créés', s1.donors === demo.DEMO_DONORS && tables.donations.filter(n => n.organization_id === org!.id).length >= demo.DEMO_DONORS)
  check('dons « seed », jamais Stripe', tables.donations.every(n => n.source === 'seed' && n.provider_ref === null))

  // Deux photos attribuées, puis régénération : elles restent, sur d'autres morceaux nommés
  await demo.addDemoPhoto(Buffer.from([0xff, 0xd8, 0xff, 0]))
  await demo.addDemoPhoto(Buffer.from([0xff, 0xd8, 0xff, 1]))
  const photos = tables.donors.filter(d => d.photo_url).map(d => d.photo_url as string)
  check('photos rangées chez la démo', photos.length === 2 && photos.every(u => u.startsWith(`${P}org/${org!.id}/d/`)) && files.size === 2)
  check('photos sur des morceaux nommés', tables.donors.filter(d => d.photo_url).every(d => d.show_name))
  await demo.generateDemo(NOW + 86_400_000)
  check('régénérer : toujours un seul organisme et une seule adresse', tables.organizations.filter(o => o.showcase).length === 1 && tables.organization_slugs.filter(s => s.slug === 'demo').length === 1)
  check('régénérer : mêmes nombres, pas de doublons', tables.donors.filter(d => d.organization_id === org!.id).length === demo.DEMO_DONORS)
  const kept = tables.donors.filter(d => d.photo_url).map(d => d.photo_url as string).sort()
  check('régénérer : photos gardées', JSON.stringify(kept) === JSON.stringify([...photos].sort()) && files.size === 2)

  console.log('Jamais un autre organisme')
  reset()
  tables.organizations = [{ id: 'vrai', name_fr: 'Vrai organisme', status: 'live', showcase: false }]
  tables.organization_slugs = [{ slug: 'demo', organization_id: 'vrai', is_current: true }]
  let refused = false
  try {
    await demo.generateDemo(NOW)
  } catch {
    refused = true
  }
  check('« demo » pris par un vrai organisme : refusé, rien touché', refused && tables.organizations.length === 1 && !(tables.donors ?? []).length)
}

main().then(done, e => { console.error(e); process.exit(1) })

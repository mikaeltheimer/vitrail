import { check, done } from './helpers'
import { reset, rpcs, tables } from './fake-db'

// Adresse du vitrail : état affiché dans la console, vérification pendant la saisie, appel de la fonction SQL.
// Les règles elles-mêmes (brouillon, limite, atelier, transaction) vivent dans change_org_slug (migration 2026-11-24),
// éprouvée sur PostgreSQL ; ici, on vérifie ce que le serveur en fait.
process.env.PLATFORM_DOMAIN = 'donivers.test'

async function main() {
  const a = await import('../lib/org-address')
  const { forgetTenantCache } = await import('../lib/tenant')

  const seed = (wentLive: string | null) => {
    reset()
    forgetTenantCache()
    tables.organizations = [
      { id: 'orgA', status: wentLive ? 'live' : 'draft', went_live_at: wentLive, practice_of: null },
      { id: 'orgA2', status: 'draft', went_live_at: null, practice_of: 'orgA' },
      { id: 'orgB', status: 'live', went_live_at: '2026-11-01T00:00:00+00:00', practice_of: null },
    ]
    tables.organization_slugs = [
      { slug: 'ecole', organization_id: 'orgA', is_current: true, created_at: '2026-10-30T00:00:00+00:00' },
      { slug: 'ecole--essai', organization_id: 'orgA2', is_current: true, created_at: '2026-10-30T00:00:00+00:00' },
      { slug: 'musee', organization_id: 'orgB', is_current: true, created_at: '2026-10-30T00:00:00+00:00' },
      { slug: 'autre--essai', organization_id: 'orgB', is_current: false, created_at: '2026-10-30T00:00:00+00:00' },
    ]
  }

  console.log('État affiché')
  seed(null)
  let info = await a.addressInfo('orgA')
  check('brouillon : changements libres', info?.draft === true && info.changesLeft === null && info.current === 'ecole' && info.previous.length === 0)
  seed('2026-11-01T00:00:00+00:00')
  info = await a.addressInfo('orgA')
  check('en ligne, aucun changement : 2 sur 2', info?.draft === false && info.changesLeft === 2 && info.max === 2)
  tables.organization_slugs[0].is_current = false
  tables.organization_slugs.push({ slug: 'ecole2', organization_id: 'orgA', is_current: true, created_at: '2026-11-05T00:00:00+00:00' })
  info = await a.addressInfo('orgA')
  check('un changement : 1 restant, ancienne adresse listée', info?.changesLeft === 1 && info.current === 'ecole2' && info.previous.join() === 'ecole')
  tables.organization_slugs.push({ slug: 'ecole3', organization_id: 'orgA', is_current: false, created_at: '2026-11-06T00:00:00+00:00' })
  info = await a.addressInfo('orgA')
  check('deux changements : 0 restant, plus récente d\'abord', info?.changesLeft === 0 && info.previous.join() === 'ecole3,ecole')
  check('organisme inconnu : rien', (await a.addressInfo('nope')) === null)

  console.log('Vérification pendant la saisie')
  seed('2026-11-01T00:00:00+00:00')
  tables.organization_slugs[0].is_current = false
  tables.organization_slugs.push({ slug: 'ecole2', organization_id: 'orgA', is_current: true, created_at: '2026-11-05T00:00:00+00:00' })
  check('libre', (await a.checkAddress('orgA', 'theatre')) === 'disponible')
  check('majuscules et espaces ramenés', (await a.checkAddress('orgA', '  Theatre ')) === 'disponible')
  check('actuelle', (await a.checkAddress('orgA', 'ecole2')) === 'meme')
  check('ancienne : retour', (await a.checkAddress('orgA', 'ecole')) === 'retour')
  check('à un autre organisme', (await a.checkAddress('orgA', 'musee')) === 'pris')
  check('son atelier pris par un autre', (await a.checkAddress('orgA', 'autre')) === 'pris')
  check('« -- » refusé', (await a.checkAddress('orgA', 'ec--ole')) === 'forme')
  check('trop long avec le suffixe de l\'atelier', (await a.checkAddress('orgA', 'a'.repeat(34))) === 'forme')
  check('réservée', (await a.checkAddress('orgA', 'admin')) === 'reserve')

  console.log('Changement')
  seed('2026-11-01T00:00:00+00:00')
  const seen: Record<string, unknown>[] = []
  rpcs.change_org_slug = args => { seen.push(args); return 'ok' }
  let r = await a.changeAddress('orgA', ' Theatre ')
  check('appel avec l\'adresse normalisée et la limite', r.ok && r.slug === 'theatre' && seen[0].p_org === 'orgA' && seen[0].p_slug === 'theatre' && seen[0].p_max === 2)
  r = await a.changeAddress('orgA', 'ec--ole')
  check('forme refusée avant la base', !r.ok && r.error === 'forme' && seen.length === 1)
  r = await a.changeAddress('orgA', 'www')
  check('réservée refusée avant la base', !r.ok && r.error === 'reserve' && seen.length === 1)
  for (const code of ['meme', 'pris', 'limite'] as const) {
    rpcs.change_org_slug = () => code
    r = await a.changeAddress('orgA', 'theatre')
    check(`réponse « ${code} » transmise`, !r.ok && r.error === code)
  }
  rpcs.change_org_slug = () => 'impossible'
  r = await a.changeAddress('orgA', 'theatre')
  check('réponse « impossible »', !r.ok && r.error === 'impossible')
  rpcs.change_org_slug = () => { throw { code: '23505', message: 'Adresse déjà prise' } }
  r = await a.changeAddress('orgA', 'theatre')
  check('prise entre-temps (course) : « pris »', !r.ok && r.error === 'pris')
  rpcs.change_org_slug = () => { throw { code: '23514', message: 'check' } }
  r = await a.changeAddress('orgA', 'theatre')
  check('contrainte de la table : « reserve »', !r.ok && r.error === 'reserve')
  rpcs.change_org_slug = () => { throw { code: 'XX000', message: 'panne' } }
  let threw = false
  try { await a.changeAddress('orgA', 'theatre') } catch { threw = true }
  check('panne de la base : erreur remontée (message neutre à l\'écran)', threw)

  done()
}
main()

import { check, done } from './helpers'
import { reset, tables } from './fake-db'

// Écran jumelé de la démonstration : validation, séance isolée, durée d'affichage, plafond, ménage, fusion dans l'instantané.
process.env.SUPABASE_URL = 'https://exemple.supabase.co'

async function main() {
  const ds = await import('../lib/demo-screen')
  const { withDemoPieces, newScreenCode, SCREEN_CODE_RE } = await import('../lib/demoPieces')
  const { VALID_COLORS } = await import('../lib/config')
  const { DEMO_TEXTS } = await import('../lib/demo-data')

  const color = VALID_COLORS[0]
  const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  const ok = { name: 'Lou Tremblay', message: 'Pour les ateliers du samedi.', question: DEMO_TEXTS.fr!.question, color, amountCents: 2500, photo }

  console.log('Code de séance')
  const codes = Array.from({ length: 50 }, () => newScreenCode())
  check('12 lettres minuscules ou chiffres', codes.every(c => SCREEN_CODE_RE.test(c)))
  check('au hasard', new Set(codes).size === codes.length)
  check('refuse un code mal formé', !ds.isScreenCode('ABC') && !ds.isScreenCode('abcdefghijk!') && !ds.isScreenCode(undefined) && ds.isScreenCode('abcdefghij12'))

  console.log('Validation (mêmes règles que les vrais dons)')
  const v = ds.validateScreenPiece(ok)
  check('don complet accepté', v.ok && v.value.name === 'Lou Tremblay' && v.value.photo === photo && v.value.question === DEMO_TEXTS.fr!.question)
  const anon = ds.validateScreenPiece({ name: null, message: null, color, amountCents: 1000 })
  check('anonyme sans rien : accepté', anon.ok && anon.value.name === null && anon.value.photo === null)
  check('nom avec lien : refusé', !ds.validateScreenPiece({ ...ok, name: 'www.exemple.com' }).ok)
  check('témoignage trop long : refusé', !ds.validateScreenPiece({ ...ok, message: 'x'.repeat(2000) }).ok)
  check('couleur inconnue : refusée', !ds.validateScreenPiece({ ...ok, color: '#ff00ff' }).ok)
  check('montant hors limites : refusé', !ds.validateScreenPiece({ ...ok, amountCents: 0 }).ok)
  check('photo autre que JPEG : refusée', !ds.validateScreenPiece({ ...ok, photo: 'data:image/svg+xml;base64,PHN2Zz4=' }).ok)
  check('photo trop lourde : refusée', !ds.validateScreenPiece({ ...ok, photo: 'data:image/jpeg;base64,' + 'A'.repeat(ds.SCREEN_PHOTO_MAX) }).ok)
  const q = ds.validateScreenPiece({ ...ok, question: 'Une question inventée ?' })
  check('question étrangère à la démo : retirée', q.ok && q.value.question === null)
  const noMsg = ds.validateScreenPiece({ ...ok, message: '' })
  check('question sans témoignage : retirée', noMsg.ok && noMsg.value.question === null)

  console.log('En base')
  reset()
  const NOW = Date.parse('2026-11-20T23:00:00Z')
  const A = 'abcdefghij12'
  const B = 'zyxwvutsrq98'
  const piece = (v as { value: Parameters<typeof ds.addScreenPiece>[2] }).value
  check('ajout', (await ds.addScreenPiece('org-demo', A, piece, NOW)) === 'ok')
  await ds.addScreenPiece('org-demo', A, { ...piece, name: null, photo: null }, NOW + 1000)
  await ds.addScreenPiece('org-demo', B, piece, NOW)
  const listA = await ds.screenPieces('org-demo', A, NOW + 2000)
  check('seule la séance de cet écran', listA.length === 2)
  check('autre organisme : rien', (await ds.screenPieces('org-autre', A, NOW + 2000)).length === 0)
  check('du plus ancien au plus récent', listA[0].name === 'Lou Tremblay' && listA[1].name === null)
  check('identifiant distinct des morceaux du vitrail', listA.every(p => p.id.startsWith('ecran-')))
  check('photo servie à part (pas dans la liste)', listA[0].photoUrl?.startsWith(`/api/demo/ecran?code=${A}&photo=`) === true && listA[1].photoUrl === null && !JSON.stringify(listA).includes('base64'))
  const rowId = listA[0].id.slice('ecran-'.length)
  check('photo lue par la séance', (await ds.screenPhoto('org-demo', A, rowId, NOW)) === photo)
  check('photo refusée à une autre séance', (await ds.screenPhoto('org-demo', B, rowId, NOW)) === null)
  check('rien qui rattache à une personne', tables.demo_screen_pieces.every(r => !('email' in r) && !('ip' in r)))

  console.log('Durée et plafond')
  check('plus affiché après 12 h', (await ds.screenPieces('org-demo', A, NOW + ds.SCREEN_TTL_MS + 5000)).length === 0)
  await ds.addScreenPiece('org-demo', B, piece, NOW + ds.SCREEN_PURGE_MS + 5000)
  check('effacé après 24 h, au prochain envoi', !tables.demo_screen_pieces.some(r => r.screen_code === A))
  reset()
  for (let i = 0; i < ds.SCREEN_MAX_PIECES; i++) await ds.addScreenPiece('org-demo', A, piece, NOW + i)
  check(`plein à ${ds.SCREEN_MAX_PIECES} morceaux`, (await ds.addScreenPiece('org-demo', A, piece, NOW + 100)) === 'plein')
  check('les autres séances restent ouvertes', (await ds.addScreenPiece('org-demo', B, piece, NOW + 100)) === 'ok')

  console.log("Fusion dans l'instantané")
  const snap = {
    version: 'v1',
    totalCents: 10_000,
    donationsCount: 3,
    pieces: [
      { id: 'd1', name: 'A', message: null, photoUrl: null, color, amountCents: 5000, arrival: 1 },
      { id: 'd2', name: 'B', message: null, photoUrl: null, color, amountCents: 5000, arrival: 4 },
    ],
    recent: [{ id: 'r1', donorId: 'd2', name: 'B', message: null, photoUrl: null, amountCents: 5000, at: '2026-11-20T20:00:00Z' }],
  } as unknown as Parameters<typeof withDemoPieces>[0]
  check('sans morceau d’essai : instantané inchangé', withDemoPieces(snap, []) === snap)
  const merged = withDemoPieces(snap, listA.length ? listA : await ds.screenPieces('org-demo', A, NOW + 200))
  const added = merged.pieces.slice(2)
  check('morceaux ajoutés à la fin, arrivés après les autres', added.length > 0 && added.every((p, i) => p.arrival === 5 + i))
  check('nouvelle version (le pavage est recalculé)', merged.version !== snap.version && merged.version.startsWith('v1+'))
  check('total et nombre de dons mis à jour', merged.donationsCount === 3 + added.length && merged.totalCents === 10_000 + added.reduce((n, p) => n + p.amountCents, 0))
  check('le plus récent en tête de « Derniers dons »', merged.recent[0].id === added[added.length - 1].id)
  check('la question suit le témoignage', added.every(p => p.question === DEMO_TEXTS.fr!.question))

  done()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

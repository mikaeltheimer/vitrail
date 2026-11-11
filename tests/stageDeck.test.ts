import { check, done } from './helpers'

// Visite de l'écran : jamais un morceau sans rien à montrer, et les rangs répartis sur tout le tour.
async function main() {
  const { stageTier, buildTour } = await import('../lib/stageDeck')
  const { rng } = await import('../lib/demo')

  const piece = (id: string, name: string | null, photoUrl: string | null, message: string | null) => ({ id, name, photoUrl, message })
  check('photo et message : premier rang', stageTier(piece('a', 'Ana', 'u.jpg', 'Bonjour')) === 0)
  check('photo seule : deuxième rang', stageTier(piece('a', null, 'u.jpg', null)) === 1)
  check('message seul, anonyme : deuxième rang', stageTier(piece('a', null, null, 'Merci')) === 1)
  check('nom seul : troisième rang', stageTier(piece('a', 'Ana', null, null)) === 2)
  check('rien à montrer : écarté', stageTier(piece('a', null, null, null)) === null)
  check('message vide ou en blancs : rien à montrer', stageTier(piece('a', ' ', null, '  ')) === null)
  check('messages masqués sur l’écran : le message ne compte pas', stageTier(piece('a', null, null, 'Merci'), false) === null)

  // Un vitrail de 200 : 20 riches, 40 moyens, 100 noms seuls, 40 vides
  const pieces = [
    ...Array.from({ length: 20 }, (_, i) => piece(`r${i}`, 'X', 'p.jpg', 'm')),
    ...Array.from({ length: 40 }, (_, i) => piece(`m${i}`, 'X', null, 'm')),
    ...Array.from({ length: 100 }, (_, i) => piece(`n${i}`, 'X', null, null)),
    ...Array.from({ length: 40 }, (_, i) => piece(`v${i}`, null, null, null)),
  ]
  const r = rng(7)
  const tour = buildTour(pieces, true, () => r.next())
  check('le tour écarte les morceaux vides', tour.length === 160 && !tour.some(id => id.startsWith('v')))
  check('chaque morceau admissible passe une fois', new Set(tour).size === 160)
  // Chaque dixième du tour a sa part de chaque rang (à un morceau près, la répartition étant tirée par tranche)
  let even = true
  for (let k = 0; k < 10; k++) {
    const slice = tour.slice(k * 16, (k + 1) * 16)
    const rich = slice.filter(id => id.startsWith('r')).length
    const named = slice.filter(id => id.startsWith('n')).length
    if (rich < 1 || rich > 3 || named < 8 || named > 12) even = false
  }
  check('chaque dixième du tour mêle les rangs (pas de fin de tour faite de noms seuls)', even)
  check('le dernier quart a encore des morceaux riches', tour.slice(120).some(id => id.startsWith('r')))
  check('vitrail sans rien à montrer : tour vide', buildTour(pieces.filter(p => p.id.startsWith('v'))).length === 0)
  done()
}

main()

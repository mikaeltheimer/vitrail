import { check, done } from './helpers'

// Numéro d'arrivée (« 123e morceau ») : ordre du premier don, stable quand d'autres se retirent ; paliers.
async function main() {
  const { arrivalOrder, isMilestone } = await import('../lib/arrival')
  const rows = [
    { donation_id: 'n3', donor_id: 'b', created_at: '2026-12-04T19:05:00Z' },
    { donation_id: 'n1', donor_id: 'a', created_at: '2026-12-04T19:00:00Z' },
    { donation_id: 'n4', donor_id: 'a', created_at: '2026-12-05T10:00:00Z' },
    { donation_id: 'n2', donor_id: 'c', created_at: '2026-12-04T19:05:00Z' },
  ]
  const m = arrivalOrder(rows)
  check('le premier don décide du numéro', m.get('a')?.arrival === 1 && m.get('a')?.since === '2026-12-04T19:00:00Z')
  check('à la même seconde, ordre stable par identifiant du don', m.get('c')?.arrival === 2 && m.get('b')?.arrival === 3)
  check('un second don ne change ni le numéro ni la date', m.size === 3)
  check('l\'ordre des lignes reçues ne compte pas', JSON.stringify([...arrivalOrder([...rows].reverse())].sort()) === JSON.stringify([...m].sort()))
  check('paliers : 1, 10, 50, 100, 250, 500', [1, 10, 50, 100, 250, 500].every(isMilestone))
  check('puis chaque millier', isMilestone(1000) && isMilestone(3000) && !isMilestone(1500))
  check('les autres numéros ne sont pas des paliers', ![2, 11, 99, 101, 999].some(isMilestone))
  done()
}

main()

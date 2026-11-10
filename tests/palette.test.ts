import { check, done } from './helpers'

// Palette « Atelier+ » : cinq verres, anciennes couleurs ramenées au verre actuel, rien d'autre accepté.
async function main() {
  const { DEFAULT_GLASSES, LEGACY_GLASSES, currentGlass, contrast } = await import('../lib/theme')
  const { validateColor } = await import('../lib/validate')
  const { VALID_COLORS } = await import('../lib/config')

  check('cinq verres, identifiants uniques', DEFAULT_GLASSES.length === 5 && new Set(DEFAULT_GLASSES.map(g => g.id)).size === 5)
  check('chaque ancienne couleur mène à un verre actuel', Object.values(LEGACY_GLASSES).every(v => VALID_COLORS.includes(v)))
  check('ancien turquoise → jade', currentGlass('#3DB5A6') === '#1FA978')
  check('minuscules acceptées', currentGlass('#f0b24a') === '#F0B24A')
  check('couleur hors palette refusée', currentGlass('#123456') === null && currentGlass(42) === null)
  const v = validateColor('#6a78e6')
  check('validation : ancien indigo enregistré comme ciel', v.ok && v.value === '#5CC0F5')
  check('validation : couleur inconnue refusée', !validateColor('#000000').ok)
  // Chaque verre se détache du fond nuit, même sur un projecteur (marge large : 4:1 sur le fond pur)
  check('chaque verre ressort du fond nuit (≥ 4:1)', DEFAULT_GLASSES.every(g => contrast(g.value, '#0B0A12') >= 4))
  done()
}

main()

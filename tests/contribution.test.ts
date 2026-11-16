import { check, done } from './helpers'
import { fakeDb, reset, tables } from './fake-db'

// Contribution du donateur et plafond partagé (spécification du 16 novembre 2026). Les tableaux des sections 1 et 2.1
// de la spécification sont repris tels quels : s'ils changent, la règle a changé.

async function main() {
  const c = await import('../lib/contribution')
  const f = await import('../lib/platform-fee')
  const tax = await import('../lib/tax')
  const settings = await import('../lib/platform-settings')
  const B = c.DEFAULT_CONTRIBUTION_SETTINGS.brackets
  const est = c.DEFAULT_CONTRIBUTION_SETTINGS.stripeFeeEstimate
  void fakeDb

  console.log('Contribution suggérée (tableau 2.1)')
  const table21: [number, number][] = [
    [10_000, 1_500],
    [25_000, 3_750],
    [25_100, 3_758],
    [50_000, 5_750],
    [100_000, 9_750],
    [200_000, 16_750],
    [1_000_000, 72_750],
  ]
  for (const [don, attendu] of table21) {
    const s = c.suggestedContribution(don, B)
    check(`${don / 100} $ → ${attendu / 100} $`, s === attendu, s)
  }
  check('don nul ou invalide → 0', c.suggestedContribution(0, B) === 0 && c.suggestedContribution(NaN, B) === 0 && c.suggestedContribution(-5, B) === 0)

  console.log('La suggestion ne baisse jamais quand le don monte')
  let seed = 42
  const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648)
  let monotone = true
  let bornes = true
  let detail = ''
  for (let k = 0; k < 200 && monotone && bornes; k++) {
    const n = 1 + Math.floor(rand() * 4)
    const brackets: { upToCents?: number; rate: number }[] = []
    let bound = 0
    for (let i = 0; i < n; i++) {
      const rate = Math.round(rand() * 30_000) / 100_000
      if (i === n - 1) brackets.push({ rate })
      else brackets.push({ upToCents: (bound += 1 + Math.floor(rand() * 200_000)), rate })
    }
    const checked = c.validateContributionSettings({ ...c.DEFAULT_CONTRIBUTION_SETTINGS, brackets })
    if (!checked.ok) { monotone = false; detail = JSON.stringify(checked.errors); break }
    const rates = brackets.map(b => b.rate)
    let previous = -1
    for (let don = 1; don <= 3_000_000; don += 1 + Math.floor(rand() * 4_000)) {
      const s = c.suggestedContribution(don, brackets)
      if (s < previous) { monotone = false; detail = JSON.stringify({ brackets, don, s, previous }); break }
      // Bornes du taux effectif, à l'arrondi près : jamais plus que le plus haut taux, jamais moins que le plus bas
      if (s > Math.round(don * Math.max(...rates)) + 1 || s < Math.round(don * Math.min(...rates)) - 1) { bornes = false; detail = JSON.stringify({ brackets, don, s }); break }
      previous = s
    }
  }
  check('200 configurations valides au hasard : jamais de baisse', monotone, detail)
  check('taux effectif entre le plus bas et le plus haut des taux', bornes, detail)
  let decroit = true
  for (let don = 1; don <= 2_000_000; don += 37) {
    const s = c.suggestedContribution(don, B)
    if (s > Math.round(don * 0.15) || s < Math.round(don * 0.07)) decroit = false
  }
  check('grille 15 / 8 / 7 : taux effectif entre 7 % et 15 %', decroit)

  console.log('Menu')
  check('100 $ : 15 % retiré (égal à la suggestion)', JSON.stringify(c.menuRatesFor(10_000, c.DEFAULT_CONTRIBUTION_SETTINGS)) === '[0.05,0.1]')
  check('500 $ : les trois pourcentages', c.menuRatesFor(50_000, c.DEFAULT_CONTRIBUTION_SETTINGS).length === 3)
  check('montant d\'un pourcentage', c.menuContribution(12_500, 0.05) === 625)

  console.log('Estimation des frais Stripe (2,9 % + 0,30 $, moitié vers le haut)')
  check('11,50 $ → 0,63 $', c.estimateStripeFee(1_150, est) === 63)
  check('125 $ → 3,93 $ (362,5 arrondi vers le haut)', c.estimateStripeFee(12_500, est) === 393)
  check('143,75 $ → 4,47 $', c.estimateStripeFee(14_375, est) === 447)

  console.log('La règle (tableau de la section 1 : après le 100e donateur, organisme québécois non acquitté)')
  const capped = f.DEFAULT_BILLING_SCHEDULE
  const actif = { donorsCounted: 150, thresholdReached: true, settled: false, cumulCents: 0 }
  // don, contribution, F, S, N, P, reçu, net de taxes
  const table1: [number, number, number, number, number, number, number, number][] = [
    [1_000, 150, 63, 87, 28, 0, 87, 76],
    [12_500, 1_875, 447, 1_428, 350, 0, 1_428, 1_242],
    [50_000, 5_750, 1_647, 4_103, 1_400, 0, 4_103, 3_569],
    [200_000, 16_750, 6_316, 10_434, 5_600, 0, 10_434, 9_075],
    [12_500, 125, 396, 0, 350, 350, 350, 304],
    [12_500, 0, 393, 0, 350, 350, 350, 304],
  ]
  for (const [don, contribution, F, S, N, P, recu, net] of table1) {
    const r = f.computeDonationFees({ donCents: don, contributionCents: contribution, schedule: capped, state: actif, stripeFee: est })
    const taxes = tax.taxIncludedCents(r.applicationFeeCents, 'QC')
    const ok = r.stripeFeeEstimatedCents === F && r.surplusCents === S && r.commissionCents === N && r.orgShareCents === P && r.applicationFeeCents === recu && recu - taxes === net
    check(`${don / 100} $ + ${contribution / 100} $ → reçu ${recu / 100} $, net ${net / 100} $`, ok, { ...r, net: recu - taxes })
  }
  const unPourcent = f.computeDonationFees({ donCents: 12_500, contributionCents: 125, schedule: capped, state: actif, stripeFee: est })
  check('1 % : l\'organisme paie sa commission entière (pas de passe-droit)', unPourcent.orgShareCents === unPourcent.commissionCents && unPourcent.surplusCents === 0)

  console.log('Avant le 100e donateur')
  const avant = f.computeDonationFees({ donCents: 12_500, contributionCents: 1_875, schedule: capped, state: { donorsCounted: 99, thresholdReached: false, settled: false, cumulCents: 0 }, stripeFee: est })
  check('99 donateurs : N = 0, P = 0, le surplus compte', avant.commissionCents === 0 && avant.orgShareCents === 0 && avant.applicationFeeCents === 1_428)
  const sans = f.computeDonationFees({ donCents: 12_500, contributionCents: 0, schedule: capped, state: { donorsCounted: 99, thresholdReached: false, settled: false, cumulCents: 0 }, stripeFee: est })
  check('99 donateurs, sans contribution : rien à Donivers', sans.applicationFeeCents === 0)
  const cent = f.computeDonationFees({ donCents: 12_500, contributionCents: 0, schedule: capped, state: { donorsCounted: 100, thresholdReached: false, settled: false, cumulCents: 0 }, stripeFee: est })
  check('100 donateurs déjà comptés : le don paie (D2)', cent.orgShareCents === 350)
  const verrou = f.computeDonationFees({ donCents: 12_500, contributionCents: 0, schedule: capped, state: { donorsCounted: 97, thresholdReached: true, settled: false, cumulCents: 0 }, stripeFee: est })
  check('seuil franchi puis fusion (97) : paie encore (verrou)', verrou.orgShareCents === 350)
  const acquitteAvant = f.computeDonationFees({ donCents: 50_000, contributionCents: 5_750, schedule: capped, state: { donorsCounted: 37, thresholdReached: false, settled: false, cumulCents: 48_000 }, stripeFee: est })
  check('acquitté avant son 100e donateur : le surplus atteint le plafond', acquitteAvant.settlesNow && acquitteAvant.orgShareCents === 0 && acquitteAvant.surplusCents === 4_103)

  console.log('Le don qui atteint le plafond')
  const sGrand = f.computeDonationFees({ donCents: 200_000, contributionCents: 16_750, schedule: capped, state: { ...actif, cumulCents: 45_000 }, stripeFee: est })
  check('S ≥ R : P = 0, acquitté, le surplus au-delà reste à Donivers', sGrand.remainingCents === 4_500 && sGrand.orgShareCents === 0 && sGrand.settlesNow && sGrand.applicationFeeCents === 10_434)
  const sPetit = f.computeDonationFees({ donCents: 200_000, contributionCents: 0, schedule: capped, state: { ...actif, cumulCents: 48_000 }, stripeFee: est })
  check('S < R : P limité à R − S', sPetit.orgShareCents === 1_500 && sPetit.settlesNow)
  const mixte = f.computeDonationFees({ donCents: 200_000, contributionCents: 6_500, schedule: capped, state: { ...actif, cumulCents: 48_000 }, stripeFee: est })
  // F = 2,9 % de 2 065 $ + 0,30 $ = 60,19 $ ; S = 4,81 $ ; R − S = 10,19 $ ; N − S = 51,19 $ → P = 10,19 $
  check('S < R avec contribution : P = R − S', mixte.surplusCents === 481 && mixte.orgShareCents === 1_019 && mixte.surplusCents + mixte.orgShareCents === 1_500)
  const acquitte = f.computeDonationFees({ donCents: 12_500, contributionCents: 1_875, schedule: capped, state: { ...actif, settled: true, cumulCents: 49_500 }, stripeFee: est })
  check('acquitté : 0 % pour toujours, la contribution reste possible', acquitte.commissionCents === 0 && acquitte.orgShareCents === 0 && acquitte.applicationFeeCents === 1_428 && !acquitte.settlesNow)

  console.log('Grilles')
  check('ancienne forme → modèle plafonné par défaut', JSON.stringify(f.parseBillingSchedule({ rate: 0.028, tierRate: 0.005, tierAfterCents: 500_000 })) === JSON.stringify(capped))
  check('grille vide ou absente → défaut', f.parseBillingSchedule(null).model === 'capped' && f.parseBillingSchedule({}).model === 'capped')
  const ecole = f.parseBillingSchedule({ model: 'exempt', scope: 'principal' })
  const exempt = f.computeDonationFees({ donCents: 12_500, contributionCents: 1_875, schedule: ecole, state: actif, stripeFee: est })
  check('École exemptée : aucune commission, la contribution couvre les frais', ecole.model === 'exempt' && exempt.orgShareCents === 0 && exempt.applicationFeeCents === 1_428 && !exempt.settlesNow)
  const partenaire = f.parseBillingSchedule({ model: 'capped', freeDonors: 250, capCents: 19_500, rate: 0.02, contributionBrackets: { x: 1 } })
  check('grille de partenaire lue', partenaire.model === 'capped' && partenaire.freeDonors === 250 && partenaire.capCents === 19_500 && partenaire.rate === 0.02 && !!partenaire.contributionBrackets)
  const invalide = f.parseBillingSchedule({ model: 'capped', freeDonors: -3, capCents: 'x', rate: 0.9 })
  check('valeurs invalides → défaut, jamais de NaN', invalide.model === 'capped' && invalide.freeDonors === 100 && invalide.capCents === 49_500 && invalide.rate === 0.028)
  const horsPlafond = f.parseBillingSchedule({ model: 'capped', contributionCountsTowardCap: false })
  const hp = f.computeDonationFees({ donCents: 200_000, contributionCents: 16_750, schedule: horsPlafond, state: { ...actif, cumulCents: 45_000 }, stripeFee: est })
  check('contribution hors plafond : P = min(N − S, R)', hp.orgShareCents === 0 && !hp.settlesNow)

  console.log('Validation de la configuration')
  check('configuration par défaut valide', c.validateContributionSettings(c.DEFAULT_CONTRIBUTION_SETTINGS).ok)
  const erreurs = (raw: unknown) => { const r = c.validateContributionSettings(raw); return r.ok ? [] : r.errors }
  check('bornes non croissantes refusées', erreurs({ ...c.DEFAULT_CONTRIBUTION_SETTINGS, brackets: [{ upToCents: 500, rate: 0.1 }, { upToCents: 400, rate: 0.1 }, { rate: 0.05 }] }).length > 0)
  check('dernière tranche fermée refusée', erreurs({ ...c.DEFAULT_CONTRIBUTION_SETTINGS, brackets: [{ upToCents: 500, rate: 0.1 }] }).length > 0)
  check('taux au-dessus de 30 % refusé', erreurs({ ...c.DEFAULT_CONTRIBUTION_SETTINGS, brackets: [{ rate: 0.31 }] }).length > 0)
  check('taux négatif refusé', erreurs({ ...c.DEFAULT_CONTRIBUTION_SETTINGS, brackets: [{ rate: -0.01 }] }).length > 0)
  check('version manquante refusée', erreurs({ ...c.DEFAULT_CONTRIBUTION_SETTINGS, version: ' ' }).length > 0)
  check('estimation Stripe invalide refusée', erreurs({ ...c.DEFAULT_CONTRIBUTION_SETTINGS, stripeFeeEstimate: { rate: 0.029, fixedCents: 0.3 } }).length > 0)
  check('configuration cassée → défaut', c.parseContributionSettings({ brackets: 'x' }) === c.DEFAULT_CONTRIBUTION_SETTINGS)
  const propres = { version: 'essai', brackets: [{ rate: 0.1 }], menuRates: [], stripeFeeEstimate: est }
  check('tranches propres à l\'organisme', c.contributionSettingsFor(c.DEFAULT_CONTRIBUTION_SETTINGS, propres).version === 'essai')
  check('tranches propres invalides → celles de la plateforme', c.contributionSettingsFor(c.DEFAULT_CONTRIBUTION_SETTINGS, { brackets: [] }) === c.DEFAULT_CONTRIBUTION_SETTINGS)

  console.log('Tarif Stripe propre à un organisme')
  const reduit = f.parseBillingSchedule({ model: 'capped', stripeFeeEstimate: { rate: 0.022, fixedCents: 30 } })
  const tarif = c.stripeFeeEstimateFor(est, reduit.stripeFeeEstimate)
  check('tarif réduit lu dans la grille', tarif.rate === 0.022 && tarif.fixedCents === 30)
  check('tarif invalide ou absent → tarif standard', c.stripeFeeEstimateFor(est, { rate: 0.5, fixedCents: 30 }) === est && c.stripeFeeEstimateFor(est, undefined) === est)
  const avecReduit = f.computeDonationFees({ donCents: 12_500, contributionCents: 1_875, schedule: reduit, state: actif, stripeFee: tarif })
  // 2,2 % de 143,75 $ + 0,30 $ = 3,46 $ : tout le reste de la contribution revient à Donivers, l'organisme reçoit le don
  check('tarif réduit : le surplus grandit, l\'organisme reçoit le don', avecReduit.stripeFeeEstimatedCents === 346 && avecReduit.surplusCents === 1_529)

  console.log('Contribution reçue du navigateur')
  check('absente → 0', JSON.stringify(c.validateContributionCents(undefined, 5_000)) === '{"ok":true,"value":0}')
  check('égale au don : acceptée', c.validateContributionCents(5_000, 5_000).ok)
  check('plus que le don : refusée', JSON.stringify(c.validateContributionCents(5_001, 5_000)) === '{"ok":false,"reason":"too_high"}')
  check('décimale, négative ou texte : refusée', !c.validateContributionCents(1.5, 5_000).ok && !c.validateContributionCents(-1, 5_000).ok && !c.validateContributionCents('100', 5_000).ok)

  console.log('Taxes comprises')
  check('Québec : 14,28 $ comprend 1,86 $', tax.taxIncludedCents(1_428, 'QC') === 186)
  check('Ontario : 3,50 $ comprend 0,40 $', tax.taxIncludedCents(350, 'ON') === 40)
  check('province inconnue → 0', tax.taxIncludedCents(350, null) === 0)
  check('province : celle de l\'organisme', tax.taxProvinceFor({ orgProvince: 'QC', donorProvince: 'ON' }) === 'QC' && tax.taxProvinceFor({ orgProvince: 'XX' }) === null)
  check('taux venus de la base, invalides ignorés', tax.parseTaxRates({ QC: 0.15, ON: 'x', NS: 0.9 }).QC === 0.15 && tax.parseTaxRates({ ON: 'x' }).ON === 0.13 && tax.parseTaxRates({ NS: 0.9 }).NS === 0.14)

  console.log('Réglages de la plateforme')
  reset()
  settings.clearPlatformSettingsCache()
  const vide = await settings.platformSettings(1_000)
  check('ligne absente → valeurs par défaut', vide.contribution === c.DEFAULT_CONTRIBUTION_SETTINGS && vide.taxRates.QC === 0.14975)
  settings.clearPlatformSettingsCache()
  tables.platform_settings = [
    { key: 'contribution_brackets', value: { ...c.DEFAULT_CONTRIBUTION_SETTINGS, version: '2027-01', brackets: [{ upToCents: 10_000, rate: 0.12 }, { rate: 0.06 }] } },
    { key: 'tax_rates', value: { ON: 0.13, QC: 0.15 } },
  ]
  const lus = await settings.platformSettings(2_000)
  check('tranches lues dans la base', lus.contribution.version === '2027-01' && c.suggestedContribution(20_000, lus.contribution.brackets) === 1_800)
  check('taux de taxes lus dans la base', lus.taxRates.QC === 0.15)
  tables.platform_settings[0].value = { brackets: 'cassé' }
  check('cache d\'une minute', (await settings.platformSettings(30_000)).contribution.version === '2027-01')
  const casse = await settings.platformSettings(70_000)
  check('ligne invalide → défaut, jamais de paiement bloqué', casse.contribution === c.DEFAULT_CONTRIBUTION_SETTINGS)

  done()
}

main()

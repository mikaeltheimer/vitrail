import { check, done, mocks } from './helpers'

// Étape B : les erreurs de la console, de la connexion et de l'atelier sont des clés, traduites selon la langue de la
// requête. Aucune ne doit revenir en français à une personne qui a choisi l'anglais.
mocks['next/headers'] = { cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }
mocks['next/server'] = {
  after: (fn: () => unknown) => { void fn() },
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body, json: async () => body }) },
}

async function main() {
  const { errorMessage, errorResponse, err, internalError } = await import('../lib/errors')
  const { passwordProblem } = await import('../lib/auth')
  const { validateTexts } = await import('../lib/atelier')
  const fr = (await import('../messages/fr.json')).default.erreurs as Record<string, string>
  const en = (await import('../messages/en.json')).default.erreurs as Record<string, string>
  const req = (locale: 'fr' | 'en') => new Request('https://ecole.donivers.test/api/admin', { headers: { 'x-donivers-locale': locale } })
  const body = async (r: unknown) => ((await (r as { json: () => Promise<{ error: string; code: string }> }).json()))

  console.log('Mot de passe : une clé, pas une phrase')
  const short = passwordProblem('court', 'a@x.ca')
  check('trop court → motDePasseCourt, avec le minimum', short?.key === 'motDePasseCourt' && short.params?.min === 10)
  check('en anglais', errorMessage('en', short!) === 'The password must be at least 10 characters long.')
  check('en français', errorMessage('fr', short!) === 'Le mot de passe doit compter au moins 10 caractères.')
  check('courant → motDePasseCourant', passwordProblem('motdepasse123', 'a@x.ca')?.key === 'motDePasseCourant')
  check('avec le courriel → motDePasseCourriel', passwordProblem('mikael2026!!', 'mikael@x.ca')?.key === 'motDePasseCourriel')

  console.log('Réponse dans la langue de la requête')
  const rEn = await body(errorResponse(req('en'), err('dejaDansEquipe')))
  check('anglais', rEn.error === en.dejaDansEquipe && rEn.code === 'dejaDansEquipe')
  const rFr = await body(errorResponse(req('fr'), err('dejaDansEquipe')))
  check('français', rFr.error === fr.dejaDansEquipe)
  const money = errorMessage('en', err('remboursementMontant', { montant: { cents: 2500 } }))
  check('montant formaté selon la langue', money.includes('$25'), money)

  console.log('Erreur imprévue : jamais le détail technique à l’écran')
  const quiet = console.error
  console.error = () => {}
  const ie = internalError(req('en'), 'Essai', new Error('duplicate key value violates unique constraint "donors_pkey"'))
  console.error = quiet
  const ieb = await body(ie)
  check('message neutre, 500', (ie as unknown as { status: number }).status === 500 && ieb.error === en.erreurInterne && !ieb.error.includes('constraint'))

  console.log('Atelier')
  const long = validateTexts({ fr: { name: 'x'.repeat(500) } })
  check('texte trop long → clé avec le maximum', !long.ok && long.error.key === 'texteLong' && typeof long.error.params?.max === 'number')
  const lang = validateTexts({ de: { name: 'x' } })
  check('langue inconnue → clé', !lang.ok && lang.error.key === 'langueInconnue')

  console.log('Toutes les clés existent dans les deux langues, sans phrase française en anglais')
  const accents = /[àâçéèêëîïôûù]/
  check('mêmes clés', Object.keys(fr).every(k => k in en) && Object.keys(en).every(k => k in fr))
  const suspicious = Object.entries(en).filter(([, v]) => accents.test(v) && !/Français/.test(v))
  check('aucun texte accentué dans erreurs (en)', suspicious.length === 0, suspicious.map(([k]) => k))
}

main().then(done, e => { console.error(e); process.exit(1) })

import { check, done } from './helpers'
import { reset, tables } from './fake-db'

// Mon compte : nom, mot de passe (mot de passe actuel exigé, autres sessions fermées), adresse courriel (confirmée par lien).
async function main() {
  const { hashPassword, verifyPassword, tokenHash } = await import('../lib/auth')
  const { accountInfo, updateName, changePassword, requestEmailChange, confirmEmailChange, cancelEmailChange } = await import('../lib/account')

  const seed = async () => {
    reset()
    tables.accounts = [
      { id: 'a1', email: 'lou@exemple.ca', name: 'Lou', is_studio: false, password_hash: await hashPassword('ancien-mot-de-passe'), password_changed_at: null },
      { id: 'a2', email: 'pris@exemple.ca', name: 'Autre', is_studio: false, password_hash: await hashPassword('autre-mot-de-passe') },
    ]
    tables.sessions = [
      { token_hash: tokenHash('s1'), account_id: 'a1', expires_at: '2099-01-01T00:00:00Z', last_seen_at: new Date().toISOString() },
      { token_hash: tokenHash('s2'), account_id: 'a1', expires_at: '2099-01-01T00:00:00Z', last_seen_at: new Date().toISOString() },
      { token_hash: tokenHash('s3'), account_id: 'a2', expires_at: '2099-01-01T00:00:00Z', last_seen_at: new Date().toISOString() },
    ]
    tables.email_changes = []
    tables.login_failures = [{ email: 'lou@exemple.ca', created_at: new Date().toISOString() }]
  }
  const a1 = () => (tables.accounts as Record<string, unknown>[]).find(a => a.id === 'a1')!

  console.log('Nom')
  await seed()
  check('nom trop court refusé', !(await updateName('a1', ' L ')).ok)
  check('nom enregistré (espaces réduits)', (await updateName('a1', '  Lou   Tremblay ')).ok && a1().name === 'Lou Tremblay')

  console.log('Mot de passe')
  await seed()
  const bad = await changePassword('a1', 'pas-le-bon', 'nouveau-mot-de-passe-1')
  check('mot de passe actuel faux : refusé', !bad.ok && bad.error.key === 'motDePasseActuelFaux', bad)
  const same = await changePassword('a1', 'ancien-mot-de-passe', 'ancien-mot-de-passe')
  check('identique : refusé', !same.ok && same.error.key === 'motDePasseIdentique', same)
  const short = await changePassword('a1', 'ancien-mot-de-passe', 'court')
  check('trop court : refusé', !short.ok && short.error.key === 'motDePasseCourt', short)
  const ok = await changePassword('a1', 'ancien-mot-de-passe', 'nouveau-mot-de-passe-1')
  const sessions = tables.sessions as Record<string, unknown>[]
  check('changé', ok.ok && (await verifyPassword('nouveau-mot-de-passe-1', a1().password_hash as string)) && !!a1().password_changed_at)
  check('anciennes sessions fermées, une nouvelle pour cet appareil, l’autre compte intact', sessions.filter(s => s.account_id === 'a1').length === 1 && ok.ok && sessions.some(s => s.token_hash === tokenHash(ok.token)) && sessions.some(s => s.account_id === 'a2'))

  console.log('Adresse courriel')
  await seed()
  check('adresse invalide', !(await requestEmailChange('a1', 'pas-une-adresse', 'ancien-mot-de-passe')).ok)
  const wrong = await requestEmailChange('a1', 'neuve@exemple.ca', 'faux')
  check('mot de passe faux', !wrong.ok && wrong.error.key === 'motDePasseActuelFaux')
  const sameE = await requestEmailChange('a1', ' LOU@exemple.ca ', 'ancien-mot-de-passe')
  check('même adresse', !sameE.ok && sameE.error.key === 'courrielIdentique')
  const taken = await requestEmailChange('a1', 'pris@exemple.ca', 'ancien-mot-de-passe')
  check('adresse d’un autre compte : refusée', !taken.ok && taken.error.key === 'courrielIndisponible')
  const req = await requestEmailChange('a1', 'Neuve@Exemple.ca', 'ancien-mot-de-passe')
  check('demande enregistrée (empreinte seulement), adresse inchangée', req.ok && a1().email === 'lou@exemple.ca' && (tables.email_changes as Record<string, unknown>[]).length === 1 && req.ok && !(JSON.stringify(tables.email_changes).includes(req.token)))
  check('en attente visible', (await accountInfo('a1'))?.pendingEmail === 'neuve@exemple.ca')
  const again = await requestEmailChange('a1', 'autre@exemple.ca', 'ancien-mot-de-passe')
  check('deux demandes en moins de 2 min : refusée', !again.ok && again.error.key === 'courrielDejaDemande')
  const conf = req.ok ? await confirmEmailChange(req.token) : null
  check('lien confirmé : adresse changée, ancienne renvoyée pour l’avis', !!conf?.ok && conf.ok && conf.oldEmail === 'lou@exemple.ca' && a1().email === 'neuve@exemple.ca', conf)
  check('échecs de connexion de l’ancienne adresse effacés', (tables.login_failures as unknown[]).length === 0)
  check('lien déjà utilisé', req.ok && !(await confirmEmailChange(req.token)).ok)
  check('plus rien en attente', (await accountInfo('a1'))?.pendingEmail === null)

  console.log('Cas limites')
  await seed()
  const r2 = await requestEmailChange('a1', 'neuve@exemple.ca', 'ancien-mot-de-passe')
  ;(tables.accounts as Record<string, unknown>[]).push({ id: 'a3', email: 'neuve@exemple.ca', name: 'Arrivé entre-temps', password_hash: 'x' })
  const raced = r2.ok ? await confirmEmailChange(r2.token) : null
  check('adresse prise entre la demande et le clic : refusée', !!raced && !raced.ok && raced.error.key === 'courrielIndisponible' && a1().email === 'lou@exemple.ca')
  await seed()
  const r3 = await requestEmailChange('a1', 'neuve@exemple.ca', 'ancien-mot-de-passe')
  ;(tables.email_changes as Record<string, unknown>[])[0].expires_at = '2000-01-01T00:00:00Z'
  check('lien expiré', r3.ok && !(await confirmEmailChange(r3.token)).ok && a1().email === 'lou@exemple.ca')
  await seed()
  const r4 = await requestEmailChange('a1', 'neuve@exemple.ca', 'ancien-mot-de-passe')
  await cancelEmailChange('a1')
  check('demande annulée : le lien ne vaut plus', r4.ok && !(await confirmEmailChange(r4.token)).ok && a1().email === 'lou@exemple.ca')
  check('jeton vide ou démesuré', !(await confirmEmailChange('')).ok && !(await confirmEmailChange('x'.repeat(200))).ok)

  console.log('Courriels')
  const { buildEmailChange, buildEmailChanged } = await import('../lib/email')
  const c = buildEmailChange({ token: 'JETON', locale: 'fr', baseUrl: 'https://ecole.donivers.com', oldEmail: 'lou@exemple.ca' })
  check('confirmation : lien vers /admin/courriel, ancienne adresse nommée', c.content.button?.url === 'https://ecole.donivers.com/admin/courriel?jeton=JETON&lang=fr' && c.content.paragraphs.join(' ').includes('lou@exemple.ca'), c.content)
  const n = buildEmailChanged({ locale: 'en', newEmail: 'neuve@exemple.ca' })
  check('avis (anglais) : nouvelle adresse nommée, sans lien', n.content.paragraphs.join(' ').includes('neuve@exemple.ca') && !n.content.button && /address/.test(n.subject), n)

  done()
}
main()

import { check, done, mocks } from './helpers'
import { reset, tables } from './fake-db'

// Suppression des renseignements d'un donateur (Loi 25) : ce qui part, ce qui reste, et jamais chez un autre organisme.
mocks['next/headers'] = { cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }
process.env.SUPABASE_URL = 'https://exemple.supabase.co'
const PHOTOS = 'https://exemple.supabase.co/storage/v1/object/public/photos/'

async function main() {
  const removed: string[] = []
  const fdb = (await import('./fake-db')).fakeDb as unknown as { storage?: unknown }
  fdb.storage = { from: () => ({ remove: async (p: string[]) => (removed.push(...p), { error: null }) }) }
  const { eraseDonor, erasedEmail, isErasedEmail } = await import('../lib/erase')
  const { sendEmail } = await import('../lib/email')

  const photoA = `${PHOTOS}org/ecole/d/11111111-1111-1111-1111-111111111111.jpg`
  const seed = () => {
    reset()
    removed.length = 0
    tables.donors = [
      {
        id: 'ana', organization_id: 'ecole', email: 'ana@exemple.ca', display_name: 'Ana', show_name: true, message: 'Bravo', message_status: 'approved',
        quote_consent: true, photo_url: photoA, photo_status: 'approved', color: '#1FA978', hidden: false, locale: 'en',
        mailing_consent_at: '2026-11-01T00:00:00Z', mailing_consent_version: 'v1', mailing_consent_locale: 'en', mailing_withdrawn_at: null, erased_at: null,
      },
      // La même personne chez un AUTRE organisme : rien ne doit y bouger
      {
        id: 'ana-lac', organization_id: 'lac', email: 'ana@exemple.ca', display_name: 'Ana', show_name: true, message: 'Ailleurs', photo_url: null,
        photo_status: 'approved', color: '#F58FA3', hidden: false, locale: 'fr', erased_at: null,
      },
    ]
    tables.donations = [
      { id: 'd1', organization_id: 'ecole', donor_id: 'ana', amount_cents: 5000, refunded_cents: 0, provider_ref: 'cs_1', source: 'stripe' },
      { id: 'd2', organization_id: 'lac', donor_id: 'ana-lac', amount_cents: 2000, refunded_cents: 0, provider_ref: 'cs_2', source: 'stripe' },
    ]
    tables.edit_tokens = [{ token_hash: 'h1', donor_id: 'ana' }, { token_hash: 'h2', donor_id: 'ana-lac' }]
    tables.reports = [{ id: 'r1', organization_id: 'ecole', donor_id: 'ana', reason: 'x' }, { id: 'r2', organization_id: 'lac', donor_id: 'ana-lac', reason: 'y' }]
    tables.email_log = [
      { id: 'e1', organization_id: 'ecole', donor_id: 'ana', to_email: 'ana@exemple.ca', kind: 'receipt', status: 'delivered' },
      { id: 'e2', organization_id: 'ecole', donor_id: null, to_email: 'ana@exemple.ca', kind: 'receipt', status: 'sent' },
      { id: 'e3', organization_id: 'lac', donor_id: 'ana-lac', to_email: 'ana@exemple.ca', kind: 'receipt', status: 'delivered' },
    ]
  }

  console.log('Suppression des renseignements')
  seed()
  const r = await eraseDonor('ecole', 'ana')
  check('réussie', r.ok, r)
  const ana = tables.donors.find(d => d.id === 'ana')!
  check('courriel remplacé par une adresse inexistante', ana.email === erasedEmail('ana') && isErasedEmail(ana.email as string))
  check('nom, témoignage, photo effacés', ana.display_name === 'Anonyme' && !ana.show_name && ana.message === null && ana.photo_url === null && ana.quote_consent === false)
  check('langue remise à la valeur neutre', ana.locale === 'fr')
  check('consentement à la liste effacé', ana.mailing_consent_at === null && ana.mailing_consent_version === null && ana.mailing_consent_locale === null)
  check('date de suppression notée', typeof ana.erased_at === 'string')
  check('couleur gardée (le morceau reste)', ana.color === '#1FA978')
  check('dons gardés', tables.donations.length === 2 && tables.donations[0].donor_id === 'ana')
  check('jetons supprimés', !tables.edit_tokens.some(x => x.donor_id === 'ana'))
  check('signalements supprimés', !tables.reports.some(x => x.donor_id === 'ana'))
  check('journal supprimé (par fiche ET par adresse)', !tables.email_log.some(x => x.organization_id === 'ecole'))
  check('fichier de la photo effacé', removed.length === 1 && removed[0] === 'org/ecole/d/11111111-1111-1111-1111-111111111111.jpg', removed)

  console.log('Autre organisme intact')
  const lac = tables.donors.find(d => d.id === 'ana-lac')!
  check('fiche intacte', lac.email === 'ana@exemple.ca' && lac.message === 'Ailleurs' && !lac.erased_at)
  check('jeton intact', tables.edit_tokens.some(x => x.donor_id === 'ana-lac'))
  check('signalement intact', tables.reports.some(x => x.id === 'r2'))
  check('journal intact', tables.email_log.some(x => x.id === 'e3'))

  console.log('Bornes')
  seed()
  const cross = await eraseDonor('lac', 'ana')
  check("le donateur d'un autre organisme : introuvable", !cross.ok && cross.status === 404)
  check('rien touché', tables.donors.find(d => d.id === 'ana')!.email === 'ana@exemple.ca' && tables.email_log.length === 3)
  await eraseDonor('ecole', 'ana')
  const again = await eraseDonor('ecole', 'ana')
  check('relancer sur une fiche supprimée : sans effet néfaste', again.ok && tables.donors.find(d => d.id === 'ana')!.email === erasedEmail('ana'))

  console.log('Aucun courriel vers une fiche supprimée')
  const before = tables.email_log.length
  const sent = await sendEmail({ to: erasedEmail('ana'), kind: 'magic_link', locale: 'fr', donorId: 'ana', organizationId: 'ecole', subject: 'x', content: { blocks: [] } } as never)
  check('refusé', sent === false)
  check('rien consigné au journal', tables.email_log.length === before)
}

main().then(done, e => { console.error(e); process.exit(1) })

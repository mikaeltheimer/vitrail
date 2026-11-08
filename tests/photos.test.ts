import { check, done } from './helpers'
import { reset, tables } from './fake-db'

// Photos rangées par organisme (étape A) : validation liée à l'organisme, et rangement des anciennes photos u/.
process.env.SUPABASE_URL = 'https://exemple.supabase.co'
const P = 'https://exemple.supabase.co/storage/v1/object/public/photos/'
const U1 = '11111111-1111-1111-1111-111111111111'
const U2 = '22222222-2222-2222-2222-222222222222'
const U3 = '33333333-3333-3333-3333-333333333333'
const U4 = '44444444-4444-4444-4444-444444444444'

async function main() {
  // Stockage factice : un dossier plat de chemins → date de création
  const files = new Map<string, string>()
  const fdb = (await import('./fake-db')).fakeDb as unknown as { storage?: unknown }
  fdb.storage = {
    from: () => ({
      list: async (dir: string) => ({ data: [...files].filter(([p]) => p.startsWith(dir + '/') && !p.slice(dir.length + 1).includes('/')).map(([p, at]) => ({ name: p.slice(dir.length + 1), created_at: at })), error: null }),
      copy: async (a: string, b: string) => {
        if (!files.has(a)) return { data: null, error: { message: 'Object not found' } }
        if (files.has(b)) return { data: null, error: { message: 'The resource already exists' } }
        files.set(b, files.get(a)!)
        return { data: { path: b }, error: null }
      },
      remove: async (ps: string[]) => (ps.forEach(p => files.delete(p)), { data: [], error: null }),
    }),
  }
  const photos = await import('../lib/photos')
  const { validateProfile } = await import('../lib/validate')
  const { migrateLegacyPhotos } = await import('../lib/photo-migration')

  console.log('Validation liée à l’organisme')
  check('photo de cet organisme : acceptée', photos.validatePhotoPath(`org/ecole/d/${U1}.jpg`, 'ecole').ok)
  check("photo d'un autre organisme : refusée", !photos.validatePhotoPath(`org/lac/d/${U1}.jpg`, 'ecole').ok)
  check('ancien chemin u/ : refusé pour un nouveau don', !photos.validatePhotoPath(`u/${U1}.jpg`, 'ecole').ok)
  check('logo de l’organisme : refusé comme photo', !photos.validatePhotoPath('org/ecole/logo-1.png', 'ecole').ok)
  check('remontée de dossier : refusée', !photos.validatePhotoPath(`org/ecole/d/../../lac/d/${U1}.jpg`, 'ecole').ok)
  check('profil sans organisme : photo refusée', !validateProfile({ photoPath: `org/ecole/d/${U1}.jpg` }).ok)
  check('profil avec organisme : photo acceptée', validateProfile({ photoPath: `org/ecole/d/${U1}.jpg` }, 'ecole').ok)
  check('webhook : seulement une photo de cet organisme', photos.isOrgPhotoUrl(`${P}org/ecole/d/${U1}.jpg`, 'ecole') && !photos.isOrgPhotoUrl(`${P}org/lac/d/${U1}.jpg`, 'ecole') && !photos.isOrgPhotoUrl(`${P}u/${U1}.jpg`, 'ecole'))
  check('adresse extérieure : jamais', !photos.isOrgPhotoUrl(`https://ailleurs.example/photos/org/ecole/d/${U1}.jpg`, 'ecole'))
  check('effacement : ancienne photo reconnue', photos.pathFromPublicUrl(`${P}u/${U1}.jpg`, 'ecole') === `u/${U1}.jpg`)
  check("effacement : photo d'un autre organisme ignorée", photos.pathFromPublicUrl(`${P}org/lac/d/${U1}.jpg`, 'ecole') === null)

  const NOW = Date.parse('2026-11-08T12:00:00Z')
  const seed = () => {
    reset()
    files.clear()
    files.set(`u/${U1}.jpg`, '2026-11-01T00:00:00Z') // École
    files.set(`u/${U2}.jpg`, '2026-11-01T00:00:00Z') // cité par l'École ET par le Lac (ancien code)
    files.set(`u/${U3}.jpg`, '2026-11-01T00:00:00Z') // orphelin ancien
    files.set(`u/${U4}.jpg`, '2026-11-08T11:00:00Z') // orphelin récent (don peut-être en cours)
    tables.donors = [
      { id: 'a', organization_id: 'ecole', photo_url: `${P}u/${U1}.jpg` },
      { id: 'b', organization_id: 'ecole', photo_url: `${P}u/${U2}.jpg` },
      { id: 'c', organization_id: 'lac', photo_url: `${P}u/${U2}.jpg` },
      { id: 'd', organization_id: 'lac', photo_url: `${P}org/lac/d/${U1}.jpg` }, // déjà rangée
      { id: 'e', organization_id: 'lac', photo_url: null },
    ]
  }

  console.log('Rangement : à blanc')
  seed()
  const dry = await migrateLegacyPhotos({ apply: false, purgeOrphans: false, now: NOW })
  check('compte les fiches à ranger', dry.legacyDonors === 3 && dry.moved === 3, dry)
  check('compte les orphelins (et les anciens)', dry.orphans === 2 && dry.orphansOld === 1, dry)
  check('ne touche à rien', files.size === 4 && tables.donors[0].photo_url === `${P}u/${U1}.jpg`)

  console.log('Rangement : réel')
  const run = await migrateLegacyPhotos({ apply: true, purgeOrphans: true, now: NOW })
  check('sans erreur', run.errors.length === 0, run.errors)
  check('fiches rangées dans leur organisme', tables.donors[0].photo_url === `${P}org/ecole/d/${U1}.jpg` && tables.donors[1].photo_url === `${P}org/ecole/d/${U2}.jpg`)
  check('fichier partagé : une copie par organisme', tables.donors[2].photo_url === `${P}org/lac/d/${U2}.jpg` && files.has(`org/ecole/d/${U2}.jpg`) && files.has(`org/lac/d/${U2}.jpg`))
  check('anciens fichiers effacés', !files.has(`u/${U1}.jpg`) && !files.has(`u/${U2}.jpg`))
  check('orphelin ancien effacé, récent gardé', !files.has(`u/${U3}.jpg`) && files.has(`u/${U4}.jpg`))
  check('fiche déjà rangée intacte', tables.donors[3].photo_url === `${P}org/lac/d/${U1}.jpg`)

  console.log('Reprise')
  const again = await migrateLegacyPhotos({ apply: true, purgeOrphans: false, now: NOW })
  check('relancer : rien à faire, sans erreur', again.legacyDonors === 0 && again.moved === 0 && again.errors.length === 0, again)

  seed()
  files.set(`org/ecole/d/${U1}.jpg`, '2026-11-01T00:00:00Z') // copie faite, fiche pas encore mise à jour (passage interrompu)
  const resumed = await migrateLegacyPhotos({ apply: true, purgeOrphans: false, now: NOW })
  check('passage interrompu : repris sans erreur', resumed.errors.length === 0 && tables.donors[0].photo_url === `${P}org/ecole/d/${U1}.jpg`, resumed.errors)

  seed()
  files.delete(`u/${U1}.jpg`)
  const missing = await migrateLegacyPhotos({ apply: true, purgeOrphans: false, now: NOW })
  check('fichier absent : signalé, fiche laissée', missing.missing === 1 && tables.donors[0].photo_url === `${P}u/${U1}.jpg`)

  seed()
  tables.donors[0].photo_url = `${P}org/ecole/d/${U3}.jpg` // le donateur a changé sa photo entre la lecture et l'écriture : simulé
  const r2 = await migrateLegacyPhotos({ apply: true, purgeOrphans: false, now: NOW })
  check('photo déjà changée par le donateur : non touchée', tables.donors[0].photo_url === `${P}org/ecole/d/${U3}.jpg` && r2.errors.length === 0)
}

main().then(done, e => { console.error(e); process.exit(1) })

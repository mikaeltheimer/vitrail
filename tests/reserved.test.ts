import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import './helpers'
import { check, done } from './helpers'
import { RESERVED_CAMPAIGN_SLUGS, orgSlugFromHost } from '../lib/tenant'

console.log('Routes et adresses')
const appDir = path.resolve(__dirname, '../app')
const folders = readdirSync(appDir).filter(n => statSync(path.join(appDir, n)).isDirectory() && !n.startsWith('(') && !n.startsWith('['))
for (const f of folders) check(`app/${f} est réservé`, (RESERVED_CAMPAIGN_SLUGS as readonly string[]).includes(f))

process.env.PLATFORM_DOMAIN = 'donivers.test'
check('sous-domaine', orgSlugFromHost('ecoleartsutton.donivers.test') === 'ecoleartsutton')
check('avec port', orgSlugFromHost('ecoleartsutton.donivers.test:3000') === 'ecoleartsutton')
check('domaine nu', orgSlugFromHost('donivers.test') === null)
check('deux niveaux refusés', orgSlugFromHost('gala.ecoleartsutton.donivers.test') === null)
check('autre domaine', orgSlugFromHost('vitrail.studioexistence.com') === null)
check('hôte vide', orgSlugFromHost(null) === null)
check('forme invalide', orgSlugFromHost('-x-.donivers.test') === null)
check('majuscules', orgSlugFromHost('EcoleArtSutton.Donivers.Test') === 'ecoleartsutton')
done()

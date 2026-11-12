// Page d'essai TEMPORAIRE : capture.ts la copie dans app/ le temps des captures, puis la retire. Jamais commitée dans app/.
// Le vrai écran de projection, avec l'identité de la démo construite ici (aucune base) ; son /api/vitrail est simulé par
// Playwright avec les donateurs fictifs de la démo.
import { OrgIdentityProvider } from '@/components/OrgIdentity'
import { identityFromRow } from '@/lib/identity'
import { DEMO_NAME, DEMO_TEXTS } from '@/lib/demo-data'
import Ecran from '@/app/ecran/page'

export default function CapturesEcran() {
  const identity = identityFromRow({ id: 'demo', name_fr: DEMO_NAME, website_url: null, texts: DEMO_TEXTS, legal: null, theme: null, logo_path: null, icon_path: null, locales: ['fr', 'en'], sender_name: null, reply_to: null, showcase: true })
  return (
    <OrgIdentityProvider identity={identity} surface="org">
      <Ecran />
    </OrgIdentityProvider>
  )
}

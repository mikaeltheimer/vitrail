import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentAccount, organizationsOf } from '@/lib/auth'
import { CONFIG } from '@/lib/config'
import AdminLogin from '@/app/admin/AdminLogin'
import NoAccess from '@/app/admin/NoAccess'

export const dynamic = 'force-dynamic'
export const metadata = { title: `Connexion — ${CONFIG.brand.name}`, robots: { index: false } } // i18n-ok : écran de connexion (FR, étape 7)

// « Se connecter » de la vitrine : après la connexion, la personne va à la console de son organisme
// (directement s'il n'y en a qu'un ; la liste sinon). Un compte Studio va à la section Studio.
export default async function ConnexionPage() {
  const account = await currentAccount()
  if (!account) return <AdminLogin orgName={CONFIG.brand.name} />
  if (account.isStudio) redirect('/studio')
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost'
  const orgs = await organizationsOf(account.id, new Request(`https://${host}/connexion`, { headers: h }))
  if (orgs.length === 1) redirect(orgs[0].url)
  return <NoAccess orgName={CONFIG.brand.name} email={account.email} orgs={orgs} />
}

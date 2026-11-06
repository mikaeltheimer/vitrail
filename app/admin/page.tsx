import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { currentAccount, organizationsOf, roleIn } from '@/lib/auth'
import { resolveTenant } from '@/lib/tenant'
import AdminLogin from './AdminLogin'
import Console from '@/components/console/Console'
import NoAccess from './NoAccess'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Console — Donivers', robots: { index: false } }

// La console de l'organisme de l'adresse : il faut être connecté ET membre de CET organisme.
export default async function AdminPage() {
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost'
  const r = await resolveTenant(new Request(`https://${host}/admin`, { headers: h }))
  if (!('tenant' in r)) notFound()
  const account = await currentAccount()
  if (!account) return <AdminLogin orgName={r.tenant.org.name} />
  const role = await roleIn(account.id, r.tenant.org.id)
  if (!role) return <NoAccess orgName={r.tenant.org.name} email={account.email} orgs={await organizationsOf(account.id)} />
  return <Console />
}

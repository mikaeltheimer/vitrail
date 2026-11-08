import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CONFIG } from '@/lib/config'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { accessRole, currentAccount, organizationsOf } from '@/lib/auth'
import { resolveTenant } from '@/lib/tenant'
import AdminLogin from './AdminLogin'
import Console from '@/components/console/Console'
import NoAccess from './NoAccess'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('acces')
  return { title: t('metaConsole', { brand: CONFIG.brand.name }), robots: { index: false } }
}

// La console de l'organisme de l'adresse : il faut être connecté ET membre de CET organisme.
export default async function AdminPage() {
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost'
  const req = new Request(`https://${host}/admin`, { headers: h })
  const r = await resolveTenant(req)
  if (!('tenant' in r)) notFound()
  const account = await currentAccount()
  if (!account) return <AdminLogin orgName={r.tenant.org.name} />
  const role = await accessRole(account.id, r.tenant.org)
  if (!role) {
    // Liens vers SES organismes, vus depuis cette adresse (en prévisualisation : ?org=). Un seul : on l'y emmène directement.
    const orgs = await organizationsOf(account.id, req)
    if (orgs.length === 1) redirect(orgs[0].url)
    return <NoAccess orgName={r.tenant.org.name} email={account.email} orgs={orgs} />
  }
  return <Console />
}

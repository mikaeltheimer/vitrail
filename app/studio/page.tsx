import { redirect } from 'next/navigation'
import { currentAccount } from '@/lib/auth'
import { CONFIG } from '@/lib/config'
import AdminLogin from '@/app/admin/AdminLogin'
import StudioPanel from '@/components/studio/StudioPanel'

export const dynamic = 'force-dynamic'
export const metadata = { title: `Studio — ${CONFIG.brand.name}`, robots: { index: false } }

// Section Studio (comptes is_studio) : demandes d'invitation, invitations, organismes. Aucune donnée de donateur.
export default async function StudioPage() {
  const account = await currentAccount()
  if (!account) return <AdminLogin orgName={`${CONFIG.brand.name} · Studio`} />
  if (!account.isStudio) redirect('/connexion')
  return <StudioPanel />
}

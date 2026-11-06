import Invitation from './Invitation'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Invitation — Donivers', robots: { index: false } }

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams
  return <Invitation token={typeof jeton === 'string' ? jeton : ''} />
}

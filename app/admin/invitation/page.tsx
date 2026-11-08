import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CONFIG } from '@/lib/config'
import Invitation from './Invitation'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('acces')
  return { title: t('metaInvitation', { brand: CONFIG.brand.name }), robots: { index: false } }
}

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams
  return <Invitation token={typeof jeton === 'string' ? jeton : ''} />
}

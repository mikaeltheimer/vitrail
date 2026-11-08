import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CONFIG } from '@/lib/config'
import Reset from './Reset'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('acces')
  return { title: t('metaReinitialiser', { brand: CONFIG.brand.name }), robots: { index: false } }
}

export default function ResetPage() {
  return <Reset />
}

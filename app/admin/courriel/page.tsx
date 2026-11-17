import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CONFIG } from '@/lib/config'
import Confirm from './Confirm'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('acces')
  return { title: t('metaCourriel', { brand: CONFIG.brand.name }), robots: { index: false } }
}

export default function EmailChangePage() {
  return <Confirm />
}

import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CONFIG } from '@/lib/config'
import { headers } from 'next/headers'
import Signup from '@/components/plateforme/Signup'
import { platformDomain } from '@/lib/hosts'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('inscription')
  return { title: t('metaTitre', { brand: CONFIG.brand.name }), robots: { index: false } }
}

export default async function InscriptionPage({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams
  // Le domaine affiché après l'adresse : celui de la plateforme, sinon (prévisualisation) l'hôte de la requête
  const h = await headers()
  const domain = platformDomain() || (h.get('x-forwarded-host') || h.get('host') || '').split(',')[0].trim().replace(/:\d+$/, '')
  return <Signup token={typeof jeton === 'string' ? jeton : ''} domain={domain} />
}

import type { Metadata } from 'next'
import { NotFoundPage } from '@/components/ErrorPages'

export const metadata: Metadata = { robots: { index: false } }

export default function NotFound() {
  return <NotFoundPage />
}

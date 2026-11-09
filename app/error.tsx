'use client'

import { useEffect } from 'react'
import { ErrorPage } from '@/components/ErrorPages'

// Erreur pendant le rendu d'une page : le gabarit racine (langue, identité de l'organisme) est encore là.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return <ErrorPage digest={error.digest} reset={reset} />
}

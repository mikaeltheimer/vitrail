'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import AuthFrame from '@/components/AuthFrame'

// Confirmation d'une nouvelle adresse (lien reçu à cette adresse). Un bouton plutôt qu'une confirmation à l'ouverture :
// les antivirus des messageries ouvrent les liens tout seuls.
export default function Confirm() {
  const t = useTranslations('acces')
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    setError(null)
    const jeton = new URLSearchParams(window.location.search).get('jeton') ?? ''
    const res = await fetch('/api/compte/courriel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jeton }) })
    const body = (await res.json().catch(() => ({}))) as { email?: string; error?: string }
    if (res.ok && body.email) setDone(body.email)
    else setError(body.error || t('erreur'))
    setBusy(false)
  }

  return (
    <AuthFrame>
      <h1 className="m-0 text-2xl font-bold">{t('courriel.titre')}</h1>
      {done ? (
        <>
          <p role="status" className="mt-3 text-sm">
            {t('courriel.fait', { email: done })}
          </p>
          <a className="btn mt-6" href="/admin">
            {t('courriel.console')}
          </a>
        </>
      ) : (
        <>
          <p className="muted mt-1 text-sm">{t('courriel.aide')}</p>
          {error && (
            <p role="alert" className="mt-4 text-sm" style={{ color: '#f87171' }}>
              {error}
            </p>
          )}
          <button className="btn mt-6" onClick={() => void confirm()} disabled={busy}>
            {t('courriel.confirmer')}
          </button>
        </>
      )}
    </AuthFrame>
  )
}

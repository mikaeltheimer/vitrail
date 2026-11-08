'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import LanguageSwitch from '@/components/LanguageSwitch'
import { PASSWORD_MIN } from '@/lib/password-rules'

// Nouveau mot de passe depuis le lien reçu par courriel. Les autres appareils sont déconnectés.
export default function Reset() {
  const t = useTranslations('acces')
  const te = useTranslations('erreurs')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setError(te('motsDePasseDifferents'))
    setBusy(true)
    setError(null)
    const jeton = new URLSearchParams(window.location.search).get('jeton') ?? ''
    const res = await fetch('/api/admin/reinitialiser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jeton, password }) })
    if (res.ok) {
      window.location.href = '/admin'
      return
    }
    setError((await res.json().catch(() => ({}))).error || t('erreur'))
    setBusy(false)
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">{t('reinitialiser.titre')}</h1>
      <p className="muted mt-1 text-sm">{t('reinitialiser.aide', { min: PASSWORD_MIN })}</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input className="field" type="password" autoComplete="new-password" placeholder={t('reinitialiser.nouveau')} aria-label={t('reinitialiser.nouveau')} value={password} onChange={e => setPassword(e.target.value)} autoFocus required />
        <input className="field" type="password" autoComplete="new-password" placeholder={t('reinitialiser.encore')} aria-label={t('reinitialiser.encore')} value={confirm} onChange={e => setConfirm(e.target.value)} required />
        {error && (
          <p role="alert" className="text-sm" style={{ color: '#f87171' }}>
            {error}
          </p>
        )}
        <button className="btn" disabled={busy || !password || !confirm}>
          {t('reinitialiser.enregistrer')}
        </button>
      </form>
      <p className="muted mt-10 text-xs">
        <LanguageSwitch style={{ textDecoration: 'underline' }} />
      </p>
    </main>
  )
}

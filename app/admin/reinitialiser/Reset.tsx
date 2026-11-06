'use client'

import { useState } from 'react'

// Nouveau mot de passe depuis le lien reçu par courriel. Les autres appareils sont déconnectés.
export default function Reset() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setError('Les deux mots de passe ne sont pas identiques.')
    setBusy(true)
    setError(null)
    const jeton = new URLSearchParams(window.location.search).get('jeton') ?? ''
    const res = await fetch('/api/admin/reinitialiser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jeton, password }) })
    if (res.ok) {
      window.location.href = '/admin'
      return
    }
    setError((await res.json().catch(() => ({}))).error || 'Erreur.')
    setBusy(false)
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
      <p className="muted mt-1 text-sm">10 caractères ou plus. Vos autres appareils seront déconnectés.</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input className="field" type="password" autoComplete="new-password" placeholder="Nouveau mot de passe" value={password} onChange={e => setPassword(e.target.value)} autoFocus required />
        <input className="field" type="password" autoComplete="new-password" placeholder="Encore une fois" value={confirm} onChange={e => setConfirm(e.target.value)} required />
        {error && (
          <p role="alert" className="text-sm" style={{ color: '#f87171' }}>
            {error}
          </p>
        )}
        <button className="btn" disabled={busy || !password || !confirm}>
          Enregistrer
        </button>
      </form>
    </main>
  )
}

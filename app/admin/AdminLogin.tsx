'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Connexion : courriel + mot de passe. « Mot de passe oublié ou première connexion » envoie un lien par courriel
// (réinitialisation, ou nouvelle invitation pour une personne invitée qui n'a pas encore créé son accès).
export default function AdminLogin({ orgName }: { orgName: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'link' | 'sent'>('login')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    if (mode === 'link') {
      await fetch('/api/admin/lien', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      setMode('sent')
      setBusy(false)
      return
    }
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    if (res.ok) {
      router.refresh()
      return
    }
    setError((await res.json().catch(() => ({}))).error || 'Erreur.')
    setBusy(false)
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Console</h1>
      <p className="muted mt-1 text-sm">{orgName} — réservé à l&apos;équipe.</p>

      {mode === 'sent' ? (
        <div className="mt-6 space-y-3 text-sm">
          <p role="status">
            Si un accès existe pour {email}, un lien vient de partir. Il vaut une heure (sept jours pour une invitation). Pensez à regarder dans les
            indésirables.
          </p>
          <button className="btn btn-ghost" onClick={() => setMode('login')}>
            Retour à la connexion
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input className="field" type="email" autoComplete="username" placeholder="Courriel" value={email} onChange={e => setEmail(e.target.value)} autoFocus required />
          {mode === 'login' && (
            <input className="field" type="password" autoComplete="current-password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} required />
          )}
          {error && (
            <p role="alert" className="text-sm" style={{ color: '#f87171' }}>
              {error}
            </p>
          )}
          <button className="btn" disabled={busy || !email || (mode === 'login' && !password)}>
            {mode === 'login' ? 'Se connecter' : 'Recevoir un lien'}
          </button>
          <p className="text-sm">
            {mode === 'login' ? (
              <button type="button" className="underline" onClick={() => { setMode('link'); setError(null) }}>
                Mot de passe oublié ou première connexion?
              </button>
            ) : (
              <button type="button" className="underline" onClick={() => { setMode('login'); setError(null) }}>
                J&apos;ai mon mot de passe
              </button>
            )}
          </p>
        </form>
      )}
    </main>
  )
}

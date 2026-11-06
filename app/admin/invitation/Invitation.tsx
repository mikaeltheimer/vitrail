'use client'

import { useEffect, useState } from 'react'

interface Info {
  email: string
  role: 'owner' | 'volunteer'
  orgName: string | null
  accountExists: boolean
  signedInAs: string | null
}

// Accepter une invitation : choisir son nom et son mot de passe (nouvelle personne), ou simplement accepter si l'on est
// déjà connecté avec le compte invité. Le jeton reste dans l'adresse de cette page ; il n'est jamais journalisé.
export default function Invitation({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/invitation?jeton=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async r => (r.ok ? setInfo(await r.json()) : setError((await r.json().catch(() => ({}))).error || 'Invitation introuvable.')))
      .catch(() => setError('Invitation introuvable.'))
  }, [token])

  async function accept(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/admin/invitation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jeton: token, name, password }) })
    if (res.ok) {
      window.location.href = '/admin'
      return
    }
    setError((await res.json().catch(() => ({}))).error || 'Erreur.')
    setBusy(false)
  }

  const role = info?.role === 'owner' ? 'propriétaire' : 'bénévole'
  const sameAccount = info?.accountExists && info.signedInAs === info.email
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Invitation</h1>
      {!info && !error && <p className="muted mt-4">Chargement…</p>}
      {info && (
        <p className="mt-2 text-sm">
          Rejoindre l&apos;équipe de <b>{info.orgName ?? '—'}</b> comme <b>{role}</b>, avec l&apos;adresse {info.email}.
        </p>
      )}
      {info && info.accountExists && !sameAccount && (
        <p className="mt-4 text-sm">
          Un accès existe déjà pour {info.email}.{' '}
          <a className="underline" href="/admin">
            Connectez-vous avec ce compte
          </a>
          , puis rouvrez le lien de l&apos;invitation.
        </p>
      )}
      {info && (sameAccount || !info.accountExists) && (
        <form onSubmit={accept} className="mt-6 space-y-3">
          {!info.accountExists && (
            <>
              <input className="field" autoComplete="name" placeholder="Votre nom" value={name} onChange={e => setName(e.target.value)} required />
              <input className="field" type="email" autoComplete="username" value={info.email} readOnly aria-label="Courriel" />
              <input
                className="field"
                type="password"
                autoComplete="new-password"
                placeholder="Mot de passe (10 caractères ou plus)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </>
          )}
          <button className="btn" disabled={busy}>
            {info.accountExists ? "Accepter l'invitation" : 'Créer mon accès'}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm" style={{ color: '#f87171' }}>
          {error}
        </p>
      )}
    </main>
  )
}

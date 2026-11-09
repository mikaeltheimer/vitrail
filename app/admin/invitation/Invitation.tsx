'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import AuthFrame from '@/components/AuthFrame'
import { PASSWORD_MIN } from '@/lib/password-rules'

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
  const t = useTranslations('acces')
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/invitation?jeton=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async r => (r.ok ? setInfo(await r.json()) : setError((await r.json().catch(() => ({}))).error || t('invitation.introuvable'))))
      .catch(() => setError(t('invitation.introuvable')))
  }, [token, t])

  async function accept(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/admin/invitation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jeton: token, name, password }) })
    if (res.ok) {
      window.location.href = '/admin'
      return
    }
    setError((await res.json().catch(() => ({}))).error || t('erreur'))
    setBusy(false)
  }

  const role = t(`invitation.role.${info?.role === 'owner' ? 'owner' : 'volunteer'}`)
  const sameAccount = info?.accountExists && info.signedInAs === info.email
  return (
    <AuthFrame>
      <h1 className="m-0 text-2xl font-bold">{t('invitation.titre')}</h1>
      {!info && !error && <p className="muted mt-4">{t('invitation.chargement')}</p>}
      {info && <p className="mt-2 text-sm">{t.rich('invitation.rejoindre', { org: info.orgName ?? '—', role, email: info.email, b: c => <b>{c}</b> })}</p>}
      {info && info.accountExists && !sameAccount && (
        <p className="mt-4 text-sm">
          {t.rich('invitation.compteExiste', {
            email: info.email,
            lien: c => (
              <a className="underline" href="/admin">
                {c}
              </a>
            ),
          })}
        </p>
      )}
      {info && (sameAccount || !info.accountExists) && (
        <form onSubmit={accept} className="mt-6 space-y-3">
          {!info.accountExists && (
            <>
              <input className="field" autoComplete="name" placeholder={t('invitation.votreNom')} aria-label={t('invitation.votreNom')} value={name} onChange={e => setName(e.target.value)} required />
              <input className="field" type="email" autoComplete="username" value={info.email} readOnly aria-label={t('invitation.courriel')} />
              <input
                className="field"
                type="password"
                autoComplete="new-password"
                placeholder={t('invitation.motDePasse', { min: PASSWORD_MIN })}
                aria-label={t('invitation.motDePasse', { min: PASSWORD_MIN })}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </>
          )}
          <button className="btn" disabled={busy}>
            {info.accountExists ? t('invitation.accepter') : t('invitation.creerAcces')}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm" style={{ color: '#f87171' }}>
          {error}
        </p>
      )}
    </AuthFrame>
  )
}

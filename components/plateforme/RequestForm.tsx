'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

type Err = 'organisme' | 'nom' | 'courriel' | 'trop' | 'serveur'

/** Demande d'invitation. Le champ « site » est un piège à robots : invisible, il doit rester vide. */
export default function RequestForm() {
  const t = useTranslations('plateforme.demande')
  const [f, setF] = useState({ orgName: '', name: '', email: '', message: '', site: '' })
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<Err | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  if (state === 'done')
    return (
      <p role="status" className="card text-[17px]">
        {t('merci')}
      </p>
    )

  return (
    <form
      className="card grid gap-4 sm:grid-cols-2"
      onSubmit={async e => {
        e.preventDefault()
        setState('busy')
        setError(null)
        try {
          const res = await fetch('/api/plateforme/demande', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
          if (res.ok) return setState('done')
          const b = (await res.json().catch(() => ({}))) as { error?: Err }
          setError(b.error ?? 'serveur')
        } catch {
          setError('serveur')
        }
        setState('idle')
      }}
    >
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        {t('organisme')}
        <input className="field" required maxLength={120} value={f.orgName} onChange={set('orgName')} />
      </label>
      <label className="flex flex-col gap-1.5">
        {t('nom')}
        <input className="field" required maxLength={80} autoComplete="name" value={f.name} onChange={set('name')} />
      </label>
      <label className="flex flex-col gap-1.5">
        {t('courriel')}
        <input className="field" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
      </label>
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        {t('message')}
        <textarea className="field" rows={3} maxLength={1000} value={f.message} onChange={set('message')} />
      </label>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <input tabIndex={-1} autoComplete="off" value={f.site} onChange={set('site')} />
      </div>
      {error && (
        <p role="alert" className="text-sm sm:col-span-2" style={{ color: '#F58FA3' }}>
          {t(`erreurs.${error}`)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <button className="btn !w-auto" disabled={state === 'busy'}>
          {state === 'busy' ? t('envoi') : t('envoyer')}
        </button>
        <span className="muted text-[13px]">{t('confidentialite')}</span>
      </div>
    </form>
  )
}

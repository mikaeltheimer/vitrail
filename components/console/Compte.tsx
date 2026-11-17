'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { PASSWORD_MIN } from '@/lib/password-rules'
import type { AccountInfo } from '@/lib/account'
import { GREEN, RED, Sheet, useDay } from './ui'

// Mon compte (ouvert depuis le menu du compte, pour tous les rôles) : nom, adresse courriel, mot de passe.
// Un changement d'adresse ne se fait qu'après le clic sur le lien envoyé à la nouvelle adresse.

type Note = { ok: boolean; text: string } | null

async function post(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; email?: string }> {
  const res = await fetch('/api/compte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const body = (await res.json().catch(() => ({}))) as { error?: string; email?: string }
  return { ok: res.ok, ...body }
}

export default function Compte({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const t = useTranslations('console.monCompte')
  const tc = useTranslations('console')
  const day = useDay()
  const [info, setInfo] = useState<AccountInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/compte', { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    if (res.ok) {
      setInfo(body as AccountInfo)
      setLoadError(null)
    } else setLoadError((body as { error?: string }).error || tc('erreur'))
  }, [tc])
  useEffect(() => {
    const id = setTimeout(() => void load(), 0)
    return () => clearTimeout(id)
  }, [load])

  return (
    <Sheet title={t('titre')} onClose={onClose} closeLabel={tc('fermer')}>
      {loadError && <p style={{ color: RED }}>{loadError}</p>}
      {!info && !loadError && <p className="muted">{tc('chargement')}</p>}
      {info && (
        <div className="space-y-5 text-sm">
          <NameBlock info={info} onSaved={() => (void load(), onChanged())} />
          <EmailBlock info={info} reload={load} />
          <PasswordBlock info={info} day={day} />
        </div>
      )}
    </Sheet>
  )
}

function Message({ note }: { note: Note }) {
  if (!note) return null
  return (
    <p role={note.ok ? 'status' : 'alert'} style={{ color: note.ok ? GREEN : RED }}>
      {note.text}
    </p>
  )
}

function NameBlock({ info, onSaved }: { info: AccountInfo; onSaved: () => void }) {
  const t = useTranslations('console.monCompte')
  const tc = useTranslations('console')
  const [name, setName] = useState(info.name)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const changed = name.trim() !== info.name
  return (
    <form
      className="card space-y-3"
      onSubmit={async e => {
        e.preventDefault()
        setBusy(true)
        const r = await post({ action: 'nom', name })
        setBusy(false)
        setNote(r.ok ? { ok: true, text: t('nomOk') } : { ok: false, text: r.error || tc('erreur') })
        if (r.ok) onSaved()
      }}
    >
      <label className="block space-y-1">
        <span className="font-bold">{t('nom')}</span>
        <input className="field" value={name} onChange={e => (setName(e.target.value), setNote(null))} maxLength={80} autoComplete="name" />
        <span className="muted block text-xs">{t('nomAide')}</span>
      </label>
      <Message note={note} />
      {changed && (
        <button className="btn !w-auto" disabled={busy || name.trim().length < 2}>
          {t('enregistrer')}
        </button>
      )}
    </form>
  )
}

function EmailBlock({ info, reload }: { info: AccountInfo; reload: () => Promise<void> }) {
  const t = useTranslations('console.monCompte')
  const tc = useTranslations('console')
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  return (
    <section className="card space-y-3" aria-labelledby="compte-courriel">
      <div>
        <h3 id="compte-courriel" className="font-bold">
          {t('courriel')}
        </h3>
        <p className="break-all text-[15px]">{info.email}</p>
        <p className="muted text-xs">{t('courrielAide')}</p>
      </div>
      {info.pendingEmail && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(240,178,74,0.10)' }}>
          <span className="break-all">{t('enAttente', { email: info.pendingEmail })}</span>
          <button
            className="text-sm underline"
            style={{ background: 'transparent', color: 'var(--accent)' }}
            onClick={async () => {
              const r = await post({ action: 'annulerCourriel' })
              setNote(r.ok ? { ok: true, text: t('annule') } : { ok: false, text: r.error || tc('erreur') })
              await reload()
            }}
          >
            {t('annulerChangement')}
          </button>
        </div>
      )}
      <Message note={note} />
      {!open ? (
        <button className="chip !px-3" onClick={() => (setOpen(true), setNote(null))}>
          {t('changerCourriel')}
        </button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async e => {
            e.preventDefault()
            setBusy(true)
            const r = await post({ action: 'courriel', email, password })
            setBusy(false)
            if (r.ok) {
              setNote({ ok: true, text: t('lienEnvoye', { email: r.email ?? email }) })
              setOpen(false)
              setEmail('')
              setPassword('')
              await reload()
            } else setNote({ ok: false, text: r.error || tc('erreur') })
          }}
        >
          <label className="block space-y-1">
            <span className="muted text-xs">{t('nouveauCourriel')}</span>
            <input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required autoFocus />
          </label>
          <label className="block space-y-1">
            <span className="muted text-xs">{t('confirmerAvecMotDePasse')}</span>
            <input className="field" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn !w-auto" disabled={busy || !email || !password}>
              {t('envoyerLien')}
            </button>
            <button type="button" className="btn btn-ghost !w-auto" onClick={() => (setOpen(false), setNote(null))}>
              {t('annuler')}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function PasswordBlock({ info, day }: { info: AccountInfo; day: (iso: string) => string }) {
  const t = useTranslations('console.monCompte')
  const tc = useTranslations('console')
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  return (
    <section className="card space-y-3" aria-labelledby="compte-mdp">
      <div>
        <h3 id="compte-mdp" className="font-bold">
          {t('motDePasse')}
        </h3>
        {info.passwordChangedAt && <p className="muted text-xs">{t('motDePasseModifie', { date: day(info.passwordChangedAt) })}</p>}
      </div>
      <Message note={note} />
      {!open ? (
        <button className="chip !px-3" onClick={() => (setOpen(true), setNote(null))}>
          {t('changerMotDePasse')}
        </button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async e => {
            e.preventDefault()
            if (next !== again) return setNote({ ok: false, text: t('differents') })
            setBusy(true)
            const r = await post({ action: 'motDePasse', current, next })
            setBusy(false)
            if (r.ok) {
              setNote({ ok: true, text: t('motDePasseOk') })
              setOpen(false)
              setCurrent('')
              setNext('')
              setAgain('')
            } else setNote({ ok: false, text: r.error || tc('erreur') })
          }}
        >
          <p className="muted text-xs">{t('motDePasseAide', { min: PASSWORD_MIN })}</p>
          <label className="block space-y-1">
            <span className="muted text-xs">{t('actuel')}</span>
            <input className="field" type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required autoFocus />
          </label>
          <label className="block space-y-1">
            <span className="muted text-xs">{t('nouveau')}</span>
            <input className="field" type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" minLength={PASSWORD_MIN} required />
          </label>
          <label className="block space-y-1">
            <span className="muted text-xs">{t('encore')}</span>
            <input className="field" type="password" value={again} onChange={e => setAgain(e.target.value)} autoComplete="new-password" required />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn !w-auto" disabled={busy || !current || !next || !again}>
              {t('enregistrer')}
            </button>
            <button type="button" className="btn btn-ghost !w-auto" onClick={() => (setOpen(false), setNote(null))}>
              {t('annuler')}
            </button>
          </div>
          <p className="muted text-xs">{t('oublie')}</p>
        </form>
      )}
    </section>
  )
}

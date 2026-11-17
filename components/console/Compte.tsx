'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { PASSWORD_MIN } from '@/lib/password-rules'
import type { AccountInfo } from '@/lib/account'
import { GREEN, RED, Sheet, useDay } from './ui'

// Mon compte (ouvert depuis le menu du compte, pour tous les rôles) : nom, adresse courriel, mot de passe.
// Un changement d'adresse ne se fait qu'après le clic sur le lien envoyé à la nouvelle adresse.

type Note = { ok: boolean; text: string } | null

async function post(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; code?: string; email?: string }> {
  const res = await fetch('/api/compte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; email?: string }
  return { ok: res.ok, ...body }
}

// Une erreur s'affiche sous le champ qu'elle concerne (Mika, 17 nov.) ; les autres sous le formulaire
const FIELD_OF: Record<string, string> = {
  nomInvalide: 'name',
  courrielRequis: 'email',
  courrielInvalide: 'email',
  courrielIdentique: 'email',
  courrielIndisponible: 'email',
  motDePasseCourt: 'next',
  motDePasseLong: 'next',
  motDePasseCourant: 'next',
  motDePasseCourriel: 'next',
  motDePasseIdentique: 'next',
}
type Errors = Record<string, string>

/** Ce qu'il faut pour relier un champ à son erreur (lecteurs d'écran compris). */
function fieldProps(id: string, errors: Errors) {
  return errors[id] ? { 'aria-invalid': true, 'aria-describedby': `compte-err-${id}` } : {}
}

function FieldError({ id, errors }: { id: string; errors: Errors }) {
  if (!errors[id]) return null
  return (
    <span id={`compte-err-${id}`} role="alert" className="block text-xs" style={{ color: RED }}>
      {errors[id]}
    </span>
  )
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
  const [errors, setErrors] = useState<Errors>({})
  const changed = name.trim() !== info.name
  return (
    <form
      className="card space-y-3"
      noValidate
      onSubmit={async e => {
        e.preventDefault()
        setBusy(true)
        const r = await post({ action: 'nom', name })
        setBusy(false)
        if (r.ok) {
          setNote({ ok: true, text: t('nomOk') })
          onSaved()
        } else setErrors({ name: r.error || tc('erreur') })
      }}
    >
      <label className="block space-y-1">
        <span className="font-bold">{t('nom')}</span>
        <input className="field" value={name} onChange={e => (setName(e.target.value), setNote(null), setErrors({}))} maxLength={80} autoComplete="name" {...fieldProps('name', errors)} />
        <FieldError id="name" errors={errors} />
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
  const [errors, setErrors] = useState<Errors>({})
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
          noValidate
          onSubmit={async e => {
            e.preventDefault()
            setBusy(true)
            const r = await post({ action: 'courriel', email, password })
            setBusy(false)
            setErrors({})
            if (r.ok) {
              setNote({ ok: true, text: t('lienEnvoye', { email: r.email ?? email }) })
              setOpen(false)
              setEmail('')
              setPassword('')
              await reload()
            } else {
              const field = r.code === 'motDePasseActuelFaux' ? 'password' : FIELD_OF[r.code ?? '']
              if (field) setErrors({ [field]: r.error || tc('erreur') })
              else setNote({ ok: false, text: r.error || tc('erreur') })
            }
          }}
        >
          <label className="block space-y-1">
            <span className="muted text-xs">{t('nouveauCourriel')}</span>
            <input className="field" type="email" value={email} onChange={e => (setEmail(e.target.value), setErrors(x => ({ ...x, email: '' })))} autoComplete="email" required autoFocus {...fieldProps('email', errors)} />
            <FieldError id="email" errors={errors} />
          </label>
          <label className="block space-y-1">
            <span className="muted text-xs">{t('confirmerAvecMotDePasse')}</span>
            <input className="field" type="password" value={password} onChange={e => (setPassword(e.target.value), setErrors(x => ({ ...x, password: '' })))} autoComplete="current-password" required {...fieldProps('password', errors)} />
            <FieldError id="password" errors={errors} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn !w-auto" disabled={busy || !email || !password}>
              {t('envoyerLien')}
            </button>
            <button type="button" className="btn btn-ghost !w-auto" onClick={() => (setOpen(false), setNote(null), setErrors({}))}>
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
  const [errors, setErrors] = useState<Errors>({})
  const clear = (id: string) => setErrors(x => ({ ...x, [id]: '' }))
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
          noValidate
          onSubmit={async e => {
            e.preventDefault()
            setNote(null)
            if (next !== again) return setErrors({ again: t('differents') })
            setBusy(true)
            const r = await post({ action: 'motDePasse', current, next })
            setBusy(false)
            setErrors({})
            if (r.ok) {
              setNote({ ok: true, text: t('motDePasseOk') })
              setOpen(false)
              setCurrent('')
              setNext('')
              setAgain('')
            } else {
              const field = r.code === 'motDePasseActuelFaux' ? 'current' : FIELD_OF[r.code ?? '']
              if (field) setErrors({ [field]: r.error || tc('erreur') })
              else setNote({ ok: false, text: r.error || tc('erreur') })
            }
          }}
        >
          <p className="muted text-xs">{t('motDePasseAide', { min: PASSWORD_MIN })}</p>
          <label className="block space-y-1">
            <span className="muted text-xs">{t('actuel')}</span>
            <input className="field" type="password" value={current} onChange={e => (setCurrent(e.target.value), clear('current'))} autoComplete="current-password" required autoFocus {...fieldProps('current', errors)} />
            <FieldError id="current" errors={errors} />
          </label>
          <label className="block space-y-1">
            <span className="muted text-xs">{t('nouveau')}</span>
            <input className="field" type="password" value={next} onChange={e => (setNext(e.target.value), clear('next'))} autoComplete="new-password" required {...fieldProps('next', errors)} />
            <FieldError id="next" errors={errors} />
          </label>
          <label className="block space-y-1">
            <span className="muted text-xs">{t('encore')}</span>
            <input className="field" type="password" value={again} onChange={e => (setAgain(e.target.value), clear('again'))} autoComplete="new-password" required {...fieldProps('again', errors)} />
            <FieldError id="again" errors={errors} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn !w-auto" disabled={busy || !current || !next || !again}>
              {t('enregistrer')}
            </button>
            <button type="button" className="btn btn-ghost !w-auto" onClick={() => (setOpen(false), setNote(null), setErrors({}))}>
              {t('annuler')}
            </button>
          </div>
          <p className="muted text-xs">{t('oublie')}</p>
        </form>
      )}
    </section>
  )
}

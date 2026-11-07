'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { CONFIG } from '@/lib/config'
import { formatMoney } from '@/lib/format'
import { DEFAULT_FEE_SCHEDULE } from '@/lib/platform-fee'
import type { Locale } from '@/i18n/config'
import { Mark } from './Brand'

type Step = 'compte' | 'code' | 'organisme' | 'conditions'
interface Info {
  email: string
  orgName: string | null
  message: string | null
  slug: string
}
type SlugState = 'idle' | 'busy' | 'ok' | 'pris' | 'reserve' | 'forme'

const suggest = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 33)

// Inscription d'un organisme, sur invitation : compte (code si autre adresse), organisme, conditions.
export default function Signup({ token, domain }: { token: string; domain: string }) {
  const t = useTranslations('inscription')
  const locale = useLocale() as Locale
  const [info, setInfo] = useState<Info | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [step, setStep] = useState<Step>('compte')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verified, setVerified] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [orgName, setOrgName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugState, setSlugState] = useState<SlugState>('idle')
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/inscription?jeton=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) return setInvalid(true)
        const d = (await r.json()) as Info
        setInfo(d)
        setEmail(d.email)
        setOrgName(d.orgName ?? '')
        setSlug(d.slug ?? '')
      })
      .catch(() => setInvalid(true))
  }, [token])

  const post = async (body: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/inscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jeton: token, ...body }) })
      const b = (await res.json().catch(() => ({}))) as Record<string, unknown>
      return { ok: res.ok, b }
    } catch {
      return { ok: false, b: { error: 'reseau' } as Record<string, unknown> }
    }
  }
  const showError = (b: Record<string, unknown>) => {
    const code = String(b.error ?? 'inconnue')
    setError(code === 'motdepasse' && typeof b.detail === 'string' ? b.detail : t.has(`erreurs.${code}` as 'erreurs.inconnue') ? t(`erreurs.${code}` as 'erreurs.inconnue') : t('erreurs.inconnue'))
  }

  // Adresse : vérifiée en direct (300 ms après la dernière frappe)
  const checkSlug = (value: string) => {
    if (slugTimer.current) clearTimeout(slugTimer.current)
    if (!value) return setSlugState('idle')
    setSlugState('busy')
    slugTimer.current = setTimeout(async () => {
      const { b } = await post({ action: 'adresse', slug: value })
      setSlugState(b.ok ? 'ok' : ((b.reason as SlugState) ?? 'forme'))
    }, 300)
  }
  useEffect(() => {
    if (step === 'organisme' && slug && slugState === 'idle') {
      const id = setTimeout(() => checkSlug(slug), 0)
      return () => clearTimeout(id)
    }
  })

  const n = step === 'compte' || step === 'code' ? 1 : step === 'organisme' ? 2 : 3
  const fee = DEFAULT_FEE_SCHEDULE
  const pct = (r: number) => new Intl.NumberFormat(locale === 'en' ? 'en-CA' : 'fr-CA', { style: 'percent', maximumFractionDigits: 1 }).format(r)
  const b = (c: React.ReactNode) => <b>{c}</b>

  if (invalid)
    return (
      <Frame>
        <h1 className="text-[28px] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
          {t('invalide')}
        </h1>
        <p className="muted">
          {t('invalideAide')} <a href={`mailto:${CONFIG.brand.studioLegal.email}`}>{CONFIG.brand.studioLegal.email}</a>
        </p>
      </Frame>
    )
  if (!info)
    return (
      <Frame>
        <p className="muted">{t('chargement')}</p>
      </Frame>
    )

  return (
    <Frame
      top={
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            {n > 1 || step === 'code' ? (
              <button
                className="chip flex h-11 w-11 items-center justify-center !p-0"
                aria-label={t('retour')}
                onClick={() => {
                  setError(null)
                  setStep(step === 'code' || step === 'organisme' ? 'compte' : 'organisme')
                }}
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            ) : (
              <Mark size={18} />
            )}
            <span className="muted text-[13px]">{t('etape', { n })}</span>
          </div>
          <div role="img" aria-label={t('etape', { n })} className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3].map(i => (
              <span key={i} className="h-1 rounded" style={{ background: i <= n ? 'var(--gold)' : 'rgba(244,239,230,0.15)' }} />
            ))}
          </div>
        </div>
      }
    >
      {step === 'compte' && (
        <form
          className="flex flex-1 flex-col gap-4"
          onSubmit={async e => {
            e.preventDefault()
            setError(null)
            const target = email.trim().toLowerCase()
            if (target !== info.email && verified !== target) {
              setBusy(true)
              const r = await post({ action: 'code', email: target })
              setBusy(false)
              if (!r.ok) return showError(r.b)
              setCode('')
              setNote(null)
              return setStep('code')
            }
            if (!slugTouched && !slug && orgName) setSlug(suggest(orgName))
            setStep('organisme')
          }}
        >
          <h1 className="m-0 text-[28px] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            {t('compte.titre')}
          </h1>
          <p className="m-0" style={{ color: '#D9D3E3' }}>
            {info.orgName ? t('compte.intro', { org: info.orgName }) : t('compte.introSansNom')}
          </p>
          {info.message && <p className="card m-0 text-sm italic">{t('compte.mot', { message: info.message })}</p>}
          <label className="flex flex-col gap-1.5">
            {t('compte.nom')}
            <input className="field" autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            {t('compte.courriel')}
            <input className="field" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
            <span className="muted text-[13px]">{t('compte.courrielAide')}</span>
          </label>
          <label className="flex flex-col gap-1.5">
            {t('compte.motdepasse')}
            <input className="field" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={e => setPassword(e.target.value)} />
            <span className="muted text-[13px]">
              {t('compte.motdepasseAide')} {t('compte.dejaCompte')}
            </span>
          </label>
          <Bottom error={error}>
            <button className="btn" disabled={busy}>
              {t('continuer')}
            </button>
          </Bottom>
        </form>
      )}

      {step === 'code' && (
        <form
          className="flex flex-1 flex-col gap-4"
          onSubmit={async e => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            const target = email.trim().toLowerCase()
            const r = await post({ action: 'verifier', email: target, code })
            setBusy(false)
            if (!r.ok) return showError(r.b)
            setVerified(target)
            if (!slug && orgName) setSlug(suggest(orgName))
            setStep('organisme')
          }}
        >
          <h1 className="m-0 text-[28px] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            {t('code.titre')}
          </h1>
          <p className="m-0" style={{ color: '#D9D3E3' }}>
            {t.rich('code.intro', { email: email.trim().toLowerCase(), b })}
          </p>
          <label className="flex flex-col gap-2">
            {t('code.champ')}
            <input
              className="field text-center !text-[28px] font-semibold tracking-[0.3em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </label>
          <p className="muted m-0 text-sm">
            {t('code.aide')}{' '}
            <button
              type="button"
              className="underline"
              onClick={async () => {
                setError(null)
                const r = await post({ action: 'code', email: email.trim().toLowerCase() })
                if (!r.ok) return showError(r.b)
                setNote(t('code.renvoye'))
              }}
            >
              {t('code.renvoyer')}
            </button>{' '}
            ·{' '}
            <button type="button" className="underline" onClick={() => setStep('compte')}>
              {t('code.corriger')}
            </button>
          </p>
          {note && (
            <p role="status" className="m-0 text-sm" style={{ color: '#3DB5A6' }}>
              {note}
            </p>
          )}
          <Bottom error={error}>
            <button className="btn" disabled={busy || code.length !== 6}>
              {t('code.confirmer')}
            </button>
          </Bottom>
        </form>
      )}

      {step === 'organisme' && (
        <form
          className="flex flex-1 flex-col gap-4"
          onSubmit={e => {
            e.preventDefault()
            setError(null)
            if (slugState === 'ok') setStep('conditions')
          }}
        >
          <h1 className="m-0 text-[28px] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            {t('organisme.titre')}
          </h1>
          <p className="m-0" style={{ color: '#D9D3E3' }}>
            {t('organisme.intro')}
          </p>
          <label className="flex flex-col gap-1.5">
            {t('organisme.nom')}
            <input
              className="field"
              required
              minLength={2}
              maxLength={120}
              value={orgName}
              onChange={e => {
                setOrgName(e.target.value)
                if (!slugTouched) {
                  const s = suggest(e.target.value)
                  setSlug(s)
                  checkSlug(s)
                }
              }}
            />
            <span className="muted text-[13px]">{t('organisme.nomAide')}</span>
          </label>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="adresse">{t('organisme.adresse')}</label>
            <div className="field flex items-stretch !p-0" style={{ borderColor: slugState === 'ok' ? 'rgba(61,181,166,0.6)' : slugState === 'idle' || slugState === 'busy' ? undefined : 'rgba(245,143,163,0.7)' }}>
              <input
                id="adresse"
                className="min-w-0 flex-1 bg-transparent py-3 pl-3.5 outline-none"
                value={slug}
                maxLength={33}
                autoCapitalize="none"
                spellCheck={false}
                onChange={e => {
                  const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                  setSlugTouched(true)
                  setSlug(v)
                  checkSlug(v)
                }}
                aria-describedby="adresse-etat adresse-aide"
              />
              <span className="muted flex items-center whitespace-nowrap px-3 text-[13px]">.{domain}</span>
            </div>
            <span id="adresse-etat" aria-live="polite" className="text-[13px]" style={{ color: slugState === 'ok' ? '#3DB5A6' : slugState === 'busy' || slugState === 'idle' ? 'var(--muted)' : '#F58FA3' }}>
              {slugState === 'busy' && t('organisme.verification')}
              {slugState === 'ok' && t('organisme.disponible')}
              {slugState === 'pris' && t('organisme.pris')}
              {slugState === 'reserve' && t('organisme.reserve')}
              {slugState === 'forme' && t('organisme.forme')}
            </span>
            <span id="adresse-aide" className="muted text-[13px]">
              {t('organisme.adresseAide')}
            </span>
          </div>
          <Bottom error={error}>
            <button className="btn" disabled={slugState !== 'ok' || orgName.trim().length < 2}>
              {t('continuer')}
            </button>
          </Bottom>
        </form>
      )}

      {step === 'conditions' && (
        <form
          className="flex flex-1 flex-col gap-4"
          onSubmit={async e => {
            e.preventDefault()
            setBusy(true)
            setError(null)
            const r = await post({ action: 'creer', name, email: email.trim().toLowerCase(), password, orgName, slug, terms })
            if (r.ok && typeof r.b.console === 'string') {
              window.location.href = r.b.console
              return
            }
            setBusy(false)
            showError(r.b)
            const code = String(r.b.error ?? '')
            if (['nom', 'courriel', 'motdepasse', 'compte'].includes(code)) setStep('compte')
            else if (['organisme', 'adresse', 'adresseReservee', 'adressePrise'].includes(code)) {
              setSlugState('idle')
              setStep('organisme')
            }
          }}
        >
          <h1 className="m-0 text-[28px] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            {t('conditions.titre')}
          </h1>
          <ul className="card m-0 list-none space-y-3 !p-4">
            {[
              t.rich('conditions.l1', { taux: pct(fee.rate), palier: pct(fee.tierRate), seuil: formatMoney(fee.tierAfterCents, locale), b }),
              t.rich('conditions.l2', { b }),
              t.rich('conditions.l3', { b }),
              t('conditions.l4'),
            ].map((x, i) => (
              <li key={i} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-2 h-2 w-2 flex-none rounded-full" style={{ background: 'var(--gold)' }} />
                <span>{x}</span>
              </li>
            ))}
          </ul>
          <a href="/plateforme/conditions" target="_blank" rel="noopener" className="text-sm">
            {t('conditions.lire')}
          </a>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-[22px] w-[22px] flex-none" style={{ accentColor: 'var(--gold)' }} checked={terms} onChange={e => setTerms(e.target.checked)} />
            <span>{t('conditions.accepte', { org: orgName.trim() })}</span>
          </label>
          <Bottom error={error}>
            <button className="btn" disabled={busy || !terms}>
              {busy ? t('conditions.creation') : t('conditions.creer')}
            </button>
            <p className="muted m-0 text-center text-[13px]">{t('conditions.note')}</p>
          </Bottom>
        </form>
      )}
    </Frame>
  )
}

function Frame({ children, top }: { children: React.ReactNode; top?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-6 text-[15px]">
      {top ?? <Mark size={18} />}
      {children}
    </main>
  )
}

function Bottom({ children, error }: { children: React.ReactNode; error: string | null }) {
  return (
    <div className="mt-auto flex flex-col gap-3 pt-4">
      {error && (
        <p role="alert" className="m-0 text-sm" style={{ color: '#F58FA3' }}>
          {error}
        </p>
      )}
      {children}
    </div>
  )
}

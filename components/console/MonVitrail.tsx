'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LEGAL_KEYS, LEGAL_MAX, type LegalKey } from '@/lib/identity-shared'
import { RED, Section, useDay } from './ui'

// Mon vitrail (propriétaire) : ce qui ne se voit pas sur le vitrail — site web, coordonnées juridiques, courriels.
// Ce qui se voit (nom, textes, logo, icône, langues) se personnalise dans l'ATELIER, en contexte, puis se publie.

interface Loaded {
  practice: boolean
  websiteUrl: string
  legal: Partial<Record<LegalKey, string>>
  senderName: string
  replyTo: string
  orgName: string
  missing: LegalKey[]
  atelierUrl: string | null
  pending: boolean
  publishedAt: string | null
}

type Form = Pick<Loaded, 'websiteUrl' | 'legal' | 'senderName' | 'replyTo'>

export default function MonVitrail({ switchUrl }: { switchUrl: string | null }) {
  const t = useTranslations('console.monVitrail')
  const day = useDay()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/identite', { cache: 'no-store' })
    if (!res.ok) return
    const d = (await res.json()) as Loaded
    setLoaded(d)
    if (!d.practice) setForm({ websiteUrl: d.websiteUrl, legal: d.legal, senderName: d.senderName, replyTo: d.replyTo })
  }, [])

  useEffect(() => {
    const id = setTimeout(() => void load(), 0)
    return () => clearTimeout(id)
  }, [load])

  const dirty = useMemo(() => {
    if (!loaded || !form) return false
    return JSON.stringify({ websiteUrl: loaded.websiteUrl, legal: loaded.legal, senderName: loaded.senderName, replyTo: loaded.replyTo }) !== JSON.stringify(form)
  }, [loaded, form])

  if (!loaded) return <Section title={t('titre')}><p className="card muted text-sm">{t('chargement')}</p></Section>
  if (loaded.practice)
    return (
      <Section title={t('titre')}>
        <div className="card space-y-3 text-sm">
          <p className="muted">{t('dansAtelier')}</p>
          {switchUrl && (
            <a className="btn btn-ghost" href={switchUrl}>
              {t('ouvrirReel')}
            </a>
          )}
        </div>
      </Section>
    )
  if (!form) return null

  const setLegal = (k: LegalKey, v: string) => setForm({ ...form, legal: { ...form.legal, [k]: v } })
  const save = async () => {
    setBusy(true)
    setMsg(null)
    const res = await fetch('/api/admin/identite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const b = (await res.json().catch(() => ({}))) as { error?: string }
    setBusy(false)
    if (res.ok) {
      setMsg({ ok: true, text: t('enregistre') })
      await load()
    } else setMsg({ ok: false, text: b.error || t('erreur') })
  }

  return (
    <Section title={t('titre')}>
      <div className="space-y-4">
        <div className="card space-y-3 text-sm" style={{ borderColor: 'rgba(240,178,74,0.45)' }}>
          <p className="font-semibold">{t('atelierTitre')}</p>
          <p className="muted">{t('atelierAide')}</p>
          <p className="text-xs" style={{ color: loaded.pending ? 'var(--accent)' : 'var(--muted)' }}>
            {loaded.pending ? t('brouillonEnAttente') : loaded.publishedAt ? t('publieLe', { date: day(loaded.publishedAt) }) : t('jamaisPublie')}
          </p>
          {loaded.atelierUrl && (
            <a className="btn" href={loaded.atelierUrl}>
              {t('ouvrirAtelier')}
            </a>
          )}
        </div>

        <p className="card text-sm" style={{ color: loaded.missing.length ? 'var(--accent)' : undefined }}>
          {loaded.missing.length ? t('manque', { count: loaded.missing.length }) : t('complet')}
        </p>

        <div className="card space-y-3 text-sm">
          <p className="font-semibold">{t('juridique')}</p>
          <p className="muted text-xs">{t('juridiqueAide')}</p>
          {LEGAL_KEYS.map(k => {
            const missing = loaded.missing.includes(k) && !form.legal[k]?.trim()
            const example = k === 'entity' ? t('entityExemple') : k === 'officerName' ? t('officerNameExemple') : k === 'retention' ? t('retentionExemple') : undefined
            return (
              <label key={k} className="block space-y-1">
                <span className="block">
                  {t(k)} <span style={{ color: missing ? RED : 'var(--muted)' }}>*</span>
                </span>
                {k === 'retention' || k === 'address' ? (
                  <textarea className="field min-h-[72px]" maxLength={LEGAL_MAX[k]} placeholder={example} value={form.legal[k] ?? ''} onChange={e => setLegal(k, e.target.value)} />
                ) : (
                  <input
                    className="field"
                    type={k === 'officerEmail' ? 'email' : k === 'officerPhone' ? 'tel' : 'text'}
                    maxLength={LEGAL_MAX[k]}
                    placeholder={example}
                    value={form.legal[k] ?? ''}
                    onChange={e => setLegal(k, e.target.value)}
                  />
                )}
              </label>
            )
          })}
          <a className="text-xs underline" href="/confidentialite" target="_blank" rel="noopener">
            {t('voirConfidentialite')} ↗
          </a>
        </div>

        <div className="card space-y-3 text-sm">
          <label className="block space-y-1">
            <span className="block font-semibold">{t('site')}</span>
            <input className="field" type="url" inputMode="url" placeholder="https://" value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })} />
            <span className="muted block text-xs">{t('siteAide')}</span>
          </label>
        </div>

        <div className="card space-y-3 text-sm">
          <p className="font-semibold">{t('courriels')}</p>
          <p className="muted text-xs">{t('courrielsAide')}</p>
          <label className="block space-y-1">
            <span className="block">{t('expediteur')}</span>
            <input className="field" maxLength={80} value={form.senderName} placeholder={loaded.orgName} onChange={e => setForm({ ...form, senderName: e.target.value })} />
            <span className="muted block text-xs">{t('expediteurAide')}</span>
          </label>
          <label className="block space-y-1">
            <span className="block">{t('repondre')}</span>
            <input className="field" type="email" value={form.replyTo} placeholder={form.legal.officerEmail || ''} onChange={e => setForm({ ...form, replyTo: e.target.value })} />
            <span className="muted block text-xs">{t('repondreAide')}</span>
          </label>
        </div>

        <div className="sticky bottom-[76px] z-10 flex flex-wrap items-center gap-3 rounded-2xl p-3 md:bottom-4" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <button className="btn" disabled={busy || !dirty} onClick={() => void save()}>
            {t('enregistrer')}
          </button>
          {msg ? (
            <span role="status" className="text-sm" style={{ color: msg.ok ? undefined : RED }}>
              {msg.text}
            </span>
          ) : (
            dirty && <span className="muted text-sm">{t('nonEnregistre')}</span>
          )}
        </div>
      </div>
    </Section>
  )
}

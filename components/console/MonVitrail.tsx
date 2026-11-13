'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LEGAL_KEYS, LEGAL_MAX, LEGAL_REQUIRED, formatPhone, type LegalKey } from '@/lib/identity-shared'
import { RED } from './ui'

// Ce qui ne se voit pas sur le vitrail (propriétaire, organisme réel) : site web, coordonnées juridiques, courriels.
// Chaque écran de Réglages en modifie une partie ; l'enregistrement envoie toujours l'ensemble (la route attend tout).
// Ce qui se voit (nom, textes, logo, icône, langues) se personnalise dans l'ATELIER, en contexte, puis se publie.

export interface Identity {
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

type Editable = Pick<Identity, 'websiteUrl' | 'legal' | 'senderName' | 'replyTo'>
const editable = (i: Identity): Editable => ({ websiteUrl: i.websiteUrl, legal: i.legal, senderName: i.senderName, replyTo: i.replyTo })

/** Coordonnées de l'organisme (GET /api/admin/identite), rechargées après chaque enregistrement. */
export function useIdentity() {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const load = useCallback(async (): Promise<Identity | null> => {
    const res = await fetch('/api/admin/identite', { cache: 'no-store' })
    if (!res.ok) return null
    const d = (await res.json()) as Identity
    setIdentity(d)
    return d
  }, [])
  useEffect(() => {
    const id = setTimeout(() => void load(), 0)
    return () => clearTimeout(id)
  }, [load])
  return { identity, reload: load }
}

/** Un formulaire sur une partie des coordonnées : brouillon local, enregistrement de l'ensemble, barre collante. */
function useIdentityForm(identity: Identity, reload: () => Promise<Identity | null>) {
  const t = useTranslations('console.monVitrail')
  const [form, setForm] = useState<Editable>(() => editable(identity))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = useMemo(() => JSON.stringify(editable(identity)) !== JSON.stringify(form), [identity, form])
  const save = async () => {
    setBusy(true)
    setMsg(null)
    const res = await fetch('/api/admin/identite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const b = (await res.json().catch(() => ({}))) as { error?: string }
    setBusy(false)
    if (res.ok) {
      setMsg({ ok: true, text: t('enregistre') })
      // Valeurs telles qu'enregistrées (adresse du site complétée, téléphone mis en forme)
      const fresh = await reload()
      if (fresh) setForm(editable(fresh))
    } else setMsg({ ok: false, text: b.error || t('erreur') })
  }
  const bar = (
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
  )
  return { form, setForm, bar }
}

export function JuridiqueForm({ identity, reload }: { identity: Identity; reload: () => Promise<Identity | null> }) {
  const t = useTranslations('console.monVitrail')
  const tl = useTranslations('confidentialite')
  const { form, setForm, bar } = useIdentityForm(identity, reload)
  const [customRetention, setCustomRetention] = useState(!!identity.legal.retention?.trim())
  const setLegal = (k: LegalKey, v: string) => setForm({ ...form, legal: { ...form.legal, [k]: v } })
  return (
    <div className="space-y-4">
      <p className="card text-sm" style={{ color: identity.missing.length ? 'var(--accent)' : undefined }}>
        {identity.missing.length ? t('manque', { count: identity.missing.length }) : t('complet')}
      </p>
      <div className="card space-y-3 text-sm">
        <p className="muted text-xs">{t('juridiqueAide')}</p>
        {LEGAL_KEYS.filter(k => k !== 'retention').map(k => {
          const required = LEGAL_REQUIRED.includes(k)
          const missing = identity.missing.includes(k) && !form.legal[k]?.trim()
          const example = k === 'entity' ? t('entityExemple') : k === 'neq' ? t('neqExemple') : k === 'officerName' ? t('officerNameExemple') : k === 'officerPhone' ? t('officerPhoneExemple') : undefined
          return (
            <label key={k} className="block space-y-1">
              <span className="block">
                {t(k)} {required && <span style={{ color: missing ? RED : 'var(--muted)' }}>*</span>}
              </span>
              {k === 'address' ? (
                <textarea className="field min-h-[72px]" maxLength={LEGAL_MAX[k]} value={form.legal[k] ?? ''} onChange={e => setLegal(k, e.target.value)} />
              ) : (
                <input
                  className="field"
                  type={k === 'officerEmail' ? 'email' : k === 'officerPhone' ? 'tel' : 'text'}
                  inputMode={k === 'officerPhone' ? 'tel' : undefined}
                  autoComplete={k === 'officerPhone' ? 'tel' : undefined}
                  maxLength={LEGAL_MAX[k]}
                  placeholder={example}
                  value={form.legal[k] ?? ''}
                  onChange={e => setLegal(k, e.target.value)}
                  // Le téléphone se met en forme quand on quitte la case : +1 514 666 7766
                  onBlur={k === 'officerPhone' ? e => setLegal(k, formatPhone(e.target.value)) : undefined}
                />
              )}
              {k === 'neq' && <span className="muted block text-xs">{t('neqAide')}</span>}
            </label>
          )
        })}
        <div className="space-y-2">
          <span className="block">{t('retention')}</span>
          {customRetention ? (
            <>
              <textarea className="field min-h-[120px]" maxLength={LEGAL_MAX.retention} value={form.legal.retention ?? ''} onChange={e => setLegal('retention', e.target.value)} />
              <span className="muted block text-xs">{t('retentionAide')}</span>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => {
                  setLegal('retention', '')
                  setCustomRetention(false)
                }}
              >
                {t('retentionRetablir')}
              </button>
            </>
          ) : (
            <>
              <span className="muted block text-xs">{t('retentionDefautTitre')}</span>
              <p className="rounded-xl p-3 text-[13px] leading-relaxed" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                {tl('retentionDefaut', { org: identity.orgName })}
              </p>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => {
                  setLegal('retention', tl('retentionDefaut', { org: identity.orgName }))
                  setCustomRetention(true)
                }}
              >
                {t('retentionModifier')}
              </button>
            </>
          )}
        </div>
        <a className="text-xs underline" href="/confidentialite" target="_blank" rel="noopener">
          {t('voirConfidentialite')} ↗
        </a>
      </div>
      {bar}
    </div>
  )
}

export function SiteWebForm({ identity, reload }: { identity: Identity; reload: () => Promise<Identity | null> }) {
  const t = useTranslations('console.monVitrail')
  const { form, setForm, bar } = useIdentityForm(identity, reload)
  return (
    <div className="space-y-3">
      <div className="card space-y-3 text-sm">
        <label className="block space-y-1">
          <span className="block font-semibold">{t('site')}</span>
          <input className="field" type="url" inputMode="url" placeholder="https://" value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })} />
          <span className="muted block text-xs">{t('siteAide')}</span>
        </label>
      </div>
      {bar}
    </div>
  )
}

export function CourrielsForm({ identity, reload }: { identity: Identity; reload: () => Promise<Identity | null> }) {
  const t = useTranslations('console.monVitrail')
  const { form, setForm, bar } = useIdentityForm(identity, reload)
  return (
    <div className="space-y-3">
      <div className="card space-y-3 text-sm">
        <p className="muted text-xs">{t('courrielsAide')}</p>
        <label className="block space-y-1">
          <span className="block">{t('expediteur')}</span>
          <input className="field" maxLength={80} value={form.senderName} placeholder={identity.orgName} onChange={e => setForm({ ...form, senderName: e.target.value })} />
          <span className="muted block text-xs">{t('expediteurAide')}</span>
        </label>
        <label className="block space-y-1">
          <span className="block">{t('repondre')}</span>
          <input className="field" type="email" value={form.replyTo} placeholder={form.legal.officerEmail || ''} onChange={e => setForm({ ...form, replyTo: e.target.value })} />
          <span className="muted block text-xs">{t('repondreAide')}</span>
        </label>
      </div>
      {bar}
    </div>
  )
}

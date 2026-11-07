'use client'

/* eslint-disable @next/next/no-img-element -- aperçu des images téléversées */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { LEGAL_KEYS, LEGAL_MAX, TEXT_MAX, type LegalKey, type StoredTexts, type TextField } from '@/lib/identity-shared'
import { RED, Section } from './ui'

// Mon vitrail (propriétaire) : langues, présentation, logo et icône, courriels, coordonnées juridiques.
// Enregistrement explicite (un bouton) : les pages publiques changent d'un coup, pas à chaque frappe.

interface Loaded {
  practice: boolean
  locales: Locale[]
  texts: StoredTexts
  fallbackName: string
  websiteUrl: string
  legal: Partial<Record<LegalKey, string>>
  senderName: string
  replyTo: string
  logoUrl: string | null
  iconUrl: string | null
  missing: LegalKey[]
}

type Form = Pick<Loaded, 'locales' | 'texts' | 'websiteUrl' | 'legal' | 'senderName' | 'replyTo'>

const LOCALE_CHOICES: { key: 'fr' | 'en' | 'frEn' | 'enFr'; locales: Locale[] }[] = [
  { key: 'fr', locales: ['fr'] },
  { key: 'en', locales: ['en'] },
  { key: 'frEn', locales: ['fr', 'en'] },
  { key: 'enFr', locales: ['en', 'fr'] },
]

const FIELDS: { f: TextField; area?: boolean }[] = [
  { f: 'name' },
  { f: 'about', area: true },
  { f: 'why', area: true },
  { f: 'whyShort' },
  { f: 'vitrailTitle' },
  { f: 'question' },
  { f: 'placeholder', area: true },
]

export default function MonVitrail({ switchUrl }: { switchUrl: string | null }) {
  const t = useTranslations('console.monVitrail')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [lang, setLang] = useState<Locale>('fr')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/identite', { cache: 'no-store' })
    if (!res.ok) return
    const d = (await res.json()) as Loaded
    setLoaded(d)
    if (!d.practice) {
      setForm({ locales: d.locales, texts: d.texts, websiteUrl: d.websiteUrl, legal: d.legal, senderName: d.senderName, replyTo: d.replyTo })
      setLang(d.locales[0])
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => void load(), 0)
    return () => clearTimeout(id)
  }, [load])

  const dirty = useMemo(() => {
    if (!loaded || !form) return false
    const base: Form = { locales: loaded.locales, texts: loaded.texts, websiteUrl: loaded.websiteUrl, legal: loaded.legal, senderName: loaded.senderName, replyTo: loaded.replyTo }
    return JSON.stringify(base) !== JSON.stringify(form)
  }, [loaded, form])

  if (!loaded) return <Section title={t('titre')}><p className="card muted text-sm">{t('chargement')}</p></Section>
  if (loaded.practice)
    return (
      <Section title={t('titre')}>
        <div className="card space-y-3 text-sm">
          <p className="muted">{t('entrainement')}</p>
          {switchUrl && (
            <a className="btn btn-ghost" href={switchUrl}>
              {t('ouvrirReel')}
            </a>
          )}
        </div>
      </Section>
    )
  if (!form) return null

  const primary = form.locales[0]
  const shown: Locale = form.locales.includes(lang) ? lang : primary
  const langName = (l: Locale) => (l === 'fr' ? t('francais') : t('anglais'))
  const setText = (l: Locale, f: TextField, v: string) => setForm({ ...form, texts: { ...form.texts, [l]: { ...form.texts[l], [f]: v } } })
  const setLegal = (k: LegalKey, v: string) => setForm({ ...form, legal: { ...form.legal, [k]: v } })
  const choice = LOCALE_CHOICES.find(c => c.locales.join() === form.locales.join())?.key ?? 'fr'

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
        <p className="card text-sm" style={{ color: loaded.missing.length ? 'var(--accent)' : undefined }}>
          {loaded.missing.length ? t('manque', { count: loaded.missing.length }) : t('complet')}
        </p>

        <fieldset className="card space-y-2 text-sm">
          <legend className="sr-only">{t('langues')}</legend>
          <p className="font-semibold">{t('langues')}</p>
          <p className="muted text-xs">{t('languesAide')}</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {LOCALE_CHOICES.map(c => (
              <label key={c.key} className="flex items-center gap-2">
                <input type="radio" name="langues" checked={choice === c.key} onChange={() => setForm({ ...form, locales: c.locales })} />
                {t(c.key)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="card space-y-3 text-sm">
          <p className="font-semibold">{t('textes')}</p>
          {form.locales.length > 1 && (
            <>
              <div className="flex gap-2">
                {form.locales.map(l => (
                  <button key={l} aria-pressed={shown === l} className="chip !px-3" onClick={() => setLang(l)}>
                    {langName(l)}
                  </button>
                ))}
              </div>
              <p className="muted text-xs">{t('textesAide', { autre: langName(form.locales[1]), principale: langName(primary) })}</p>
            </>
          )}
          {FIELDS.map(({ f, area }) => (
            <label key={`${shown}-${f}`} className="block space-y-1">
              <span className="block">{t(f === 'name' ? 'nom' : f)}</span>
              {area ? (
                <textarea className="field min-h-[88px]" lang={shown} maxLength={TEXT_MAX[f]} value={form.texts[shown]?.[f] ?? ''} onChange={e => setText(shown, f, e.target.value)} />
              ) : (
                <input
                  className="field"
                  lang={shown}
                  maxLength={TEXT_MAX[f]}
                  value={form.texts[shown]?.[f] ?? ''}
                  placeholder={f === 'name' && shown !== primary ? form.texts[primary]?.name || loaded.fallbackName : undefined}
                  onChange={e => setText(shown, f, e.target.value)}
                />
              )}
              {f === 'about' && <span className="muted block text-xs">{t('aboutAide')}</span>}
            </label>
          ))}
          <label className="block space-y-1">
            <span className="block">{t('site')}</span>
            <input className="field" type="url" inputMode="url" placeholder="https://" value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })} />
            <span className="muted block text-xs">{t('siteAide')}</span>
          </label>
        </div>

        <div className="card space-y-4 text-sm">
          <div>
            <p className="font-semibold">{t('images')}</p>
            <p className="muted text-xs">{t('imagesAide')}</p>
          </div>
          <ImageField type="logo" url={loaded.logoUrl} onDone={load} />
          <ImageField type="icon" url={loaded.iconUrl} onDone={load} />
        </div>

        <div className="card space-y-3 text-sm">
          <p className="font-semibold">{t('courriels')}</p>
          <p className="muted text-xs">{t('courrielsAide')}</p>
          <label className="block space-y-1">
            <span className="block">{t('expediteur')}</span>
            <input className="field" maxLength={80} value={form.senderName} placeholder={form.texts[primary]?.name || loaded.fallbackName} onChange={e => setForm({ ...form, senderName: e.target.value })} />
            <span className="muted block text-xs">{t('expediteurAide')}</span>
          </label>
          <label className="block space-y-1">
            <span className="block">{t('repondre')}</span>
            <input className="field" type="email" value={form.replyTo} placeholder={form.legal.officerEmail || ''} onChange={e => setForm({ ...form, replyTo: e.target.value })} />
            <span className="muted block text-xs">{t('repondreAide')}</span>
          </label>
        </div>

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

        <div className="sticky bottom-[76px] z-10 md:bottom-4 flex flex-wrap items-center gap-3 rounded-2xl p-3" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
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

/** Réduit l'image dans le navigateur (et rastérise un SVG), en PNG : la transparence est gardée. */
async function toPng(file: File, maxW: number, maxH: number): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const w0 = img.naturalWidth || maxW
    const h0 = img.naturalHeight || maxH
    for (const shrink of [1, 0.75, 0.5]) {
      const k = Math.min(1, maxW / w0, maxH / h0) * shrink
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(w0 * k))
      canvas.height = Math.max(1, Math.round(h0 * k))
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
      if (blob && blob.size <= 600_000) return blob
    }
    throw new Error('trop lourde')
  } finally {
    URL.revokeObjectURL(url)
  }
}

function ImageField({ type, url, onDone }: { type: 'logo' | 'icon'; url: string | null; onDone: () => Promise<void> }) {
  const t = useTranslations('console.monVitrail')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const send = async (file: File) => {
    setBusy(true)
    setMsg(null)
    try {
      const png = type === 'logo' ? await toPng(file, 800, 300) : await toPng(file, 256, 256)
      const res = await fetch(`/api/admin/identite/image?type=${type}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png })
      const b = (await res.json().catch(() => ({}))) as { error?: string }
      setMsg(res.ok ? { ok: true, text: t('imageOk') } : { ok: false, text: b.error || t('erreur') })
      if (res.ok) await onDone()
    } catch {
      setMsg({ ok: false, text: t('imageErreur') })
    }
    setBusy(false)
  }
  const remove = async () => {
    setBusy(true)
    const res = await fetch(`/api/admin/identite/image?type=${type}`, { method: 'DELETE' })
    if (res.ok) await onDone()
    setBusy(false)
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center justify-center rounded-xl" style={{ width: type === 'logo' ? 180 : 64, height: 64, background: '#0B0A12', border: '1px solid var(--line)' }}>
        {url ? <img src={url} alt="" style={{ maxWidth: '88%', maxHeight: 48 }} /> : <span className="muted text-xs">{t('aucune')}</span>}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold">{type === 'logo' ? t('logo') : t('icone')}</p>
        <p className="muted text-xs">{type === 'logo' ? t('logoAide') : t('iconeAide')}</p>
        <div className="flex flex-wrap gap-2">
          <label className={`btn btn-ghost !py-2 text-sm ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            {busy ? t('envoi') : url ? t('remplacer') : t('choisir')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void send(f)
              }}
            />
          </label>
          {url && (
            <button className="btn btn-ghost !py-2 text-sm" disabled={busy} onClick={() => void remove()}>
              {t('retirer')}
            </button>
          )}
        </div>
        {msg && (
          <p role="status" className="text-xs" style={{ color: msg.ok ? undefined : RED }}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  )
}

'use client'

/* eslint-disable @next/next/no-img-element -- aperçu des images téléversées */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { OrgIdentityProvider, useIdentityContext } from '@/components/OrgIdentity'
import { TEXT_FIELDS, TEXT_MAX, clampLocale, resolveTexts, type Defaults, type Identity, type OrgTexts, type StoredTexts, type TextField } from '@/lib/identity-shared'
import type { Locale } from '@/i18n/config'

// L'ATELIER : sur le vitrail d'entraînement, le propriétaire personnalise son vitrail EN CONTEXTE. Mode « Modifier » :
// chaque texte, le logo et l'icône s'entourent d'un pointillé ; un clic ouvre son éditeur. Les changements vont dans un
// brouillon (visible ici seulement) ; « Publier » les fait passer sur le vrai vitrail. Voir lib/atelier.ts.
// Pour les visiteurs et les bénévoles, l'atelier n'affiche rien de plus (l'API refuse : pas propriétaire).

export type EditTarget = TextField | 'logo' | 'icon'

interface AtelierState {
  editing: boolean
  open: (target: EditTarget) => void
  /** Hauteur de la barre de l'atelier (une ou deux lignes sur téléphone) : la page range son titre dessous. */
  barHeight: number
}
const Ctx = createContext<AtelierState | null>(null)
export const useAtelier = () => useContext(Ctx)

interface Draft {
  /** Console de l'organisme réel (l'atelier est sur une autre adresse). */
  consoleUrl?: string | null
  /** Photos et témoignages de l'atelier en attente d'approbation. */
  toModerate?: number
  pending: boolean
  fallbackName: string
  locales: Locale[]
  texts: StoredTexts
  logoUrl: string | null
  iconUrl: string | null
}

/** Textes neutres de la plateforme, dans la langue de la page (aperçu du brouillon). */
function useDefaults(): Defaults {
  const t = useTranslations('identite')
  return useCallback(
    (_l: Locale, org: string) => ({
      about: '',
      why: t('why', { org }),
      vitrailTitle: t('vitrailTitle'),
      testimonial: { question: t('question', { org }), cta: t('cta'), placeholder: t('placeholder', { org }), lead: t('lead'), consent: t('consent', { org }) },
    }),
    [t],
  )
}

const HIDDEN_ON = ['/ecran', '/screen', '/affiche']

export default function Atelier({ children }: { children: React.ReactNode }) {
  const { identity, surface } = useIdentityContext()
  const locale = useLocale() as Locale
  const defaults = useDefaults()
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('atelier')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editing, setEditing] = useState(false)
  const [target, setTarget] = useState<EditTarget | 'langues' | 'tout' | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [intro, setIntro] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [barHeight, setBarHeight] = useState(36)
  const watchBar = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const ro = new ResizeObserver(() => setBarHeight(Math.round(el.getBoundingClientRect().height)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const apply = (d: Draft) => setDraft(d)
  const load = useCallback(async () => {
    const res = await fetch('/api/atelier', { cache: 'no-store' }).catch(() => null)
    if (!res?.ok) return
    apply((await res.json()) as Draft)
  }, [])

  useEffect(() => {
    const id = setTimeout(() => {
      void load()
      // On arrive toujours hors du mode Modifier (on vient souvent faire un don fictif ou projeter l'écran) ;
      // l'explication de la première visite indique où se trouve « Modifier ».
      try {
        if (!localStorage.getItem('donivers:atelier-vu')) setIntro(true)
      } catch {}
    }, 0)
    return () => clearTimeout(id)
  }, [load])

  // La pastille « à modérer » suit les dons fictifs qu'on vient de faire (seulement le compte, le brouillon n'est pas touché)
  useEffect(() => {
    if (!draft) return
    const id = setInterval(async () => {
      const res = await fetch('/api/atelier', { cache: 'no-store' }).catch(() => null)
      if (!res?.ok) return
      const d = (await res.json()) as Draft
      setDraft(cur => (cur ? { ...cur, toModerate: d.toModerate } : cur))
    }, 10_000)
    return () => clearInterval(id)
  }, [draft !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!note) return
    const id = setTimeout(() => setNote(null), 4000)
    return () => clearTimeout(id)
  }, [note])

  // L'identité affichée : celle du serveur, avec le brouillon tel qu'on le tape (aperçu immédiat)
  const shown: Identity | null = useMemo(() => {
    if (!identity || !draft) return identity
    const texts = Object.fromEntries(
      (['fr', 'en'] as Locale[]).map(l => [l, resolveTexts(draft.texts, draft.locales, draft.fallbackName, identity.texts[l]?.url || null, defaults, l)]),
    ) as Record<Locale, OrgTexts>
    return { ...identity, locales: draft.locales, texts, logoUrl: draft.logoUrl, iconUrl: draft.iconUrl }
  }, [identity, draft, defaults])

  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/atelier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const b = (await res.json().catch(() => ({}))) as Draft & { error?: string }
    if (!res.ok) {
      setNote({ ok: false, text: b.error || t('erreur') })
      return null
    }
    return b
  }, [t])

  /** Un texte change : aperçu tout de suite, enregistrement du brouillon un instant après la dernière frappe. */
  const setText = (l: Locale, f: TextField, v: string) => {
    if (!draft) return
    const texts = { ...draft.texts, [l]: { ...draft.texts[l], [f]: v } }
    setDraft({ ...draft, texts, pending: true })
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void post({ action: 'save', texts }), 700)
  }

  if (!draft || surface !== 'org') return <Ctx.Provider value={null}>{children}</Ctx.Provider>
  const hiddenHere = HIDDEN_ON.some(p => pathname?.startsWith(p))
  const pageLocale = clampLocale(draft.locales, locale)

  const publish = async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      await post({ action: 'save', texts: draft.texts })
    }
    if (!confirm(t('publierConfirmer'))) return
    setBusy(true)
    const d = await post({ action: 'publish' })
    setBusy(false)
    if (d) {
      apply(d)
      setNote({ ok: true, text: t('publie') })
    }
  }
  const discard = async () => {
    if (!confirm(t('abandonnerConfirmer'))) return
    setBusy(true)
    const d = await post({ action: 'discard' })
    setBusy(false)
    if (d) {
      apply(d)
      router.refresh()
    }
  }

  return (
    <Ctx.Provider value={{ editing: editing && !hiddenHere, open: f => setTarget(f), barHeight: hiddenHere ? 0 : barHeight }}>
      <OrgIdentityProvider identity={shown} surface={surface}>
        {children}
        {!hiddenHere && (
          <div
            ref={watchBar}
            role="region"
            aria-label={t('titre')}
            className="fixed inset-x-2 top-[62px] z-[1200] flex flex-wrap items-center gap-1.5 rounded-2xl px-2 py-1.5 text-[12px] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:flex-nowrap md:whitespace-nowrap md:rounded-full"
            style={{ background: 'rgba(20,18,29,0.96)', border: '1px solid rgba(240,178,74,0.55)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)', color: '#F4EFE6' }}
          >
            {/* Retour à la console : en tête de barre, loin de Publier et Annuler (à droite) */}
            {draft.consoleUrl && (
              <a href={draft.consoleUrl} className="chip !px-2.5 !py-1 text-[12px]">
                ← {t('console')}
              </a>
            )}
            <span className="px-1.5 font-semibold" style={{ color: '#F0B24A' }}>
              {t('titre')}
            </span>
            <button className="chip !px-2.5 !py-1 text-[12px]" aria-pressed={editing} onClick={() => setEditing(!editing)}>
              {editing ? t('terminer') : t('modifier')}
            </button>
            {editing && (
              <>
                <button className="chip !px-2.5 !py-1 text-[12px]" onClick={() => setTarget('tout')}>
                  {t('textes')}
                </button>
                <button className="chip !px-2.5 !py-1 text-[12px]" onClick={() => setTarget('langues')}>
                  {t('langues')}
                </button>
              </>
            )}
            {!!draft.toModerate && (
              <a href="/admin#moderation" target="_blank" rel="noopener" className="chip !px-2.5 !py-1 text-[12px]" style={{ borderColor: '#F0B24A', color: '#F0B24A' }}>
                {t('aModerer', { count: draft.toModerate })} ↗
              </a>
            )}
            {/* Publier et Annuler restent groupés, poussés à droite : sur téléphone, la barre passe à la ligne plutôt que de les cacher */}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {draft.pending ? (
                <>
                  <button className="btn !w-auto !px-3 !py-1 !text-[12px]" disabled={busy} onClick={() => void publish()}>
                    {t('publier')}
                  </button>
                  <button className="chip !px-2.5 !py-1 text-[12px]" disabled={busy} onClick={() => void discard()} title={t('abandonnerAide')}>
                    {t('annulerCourt')}
                  </button>
                </>
              ) : (
                <span className="muted px-1.5 text-[11px]">{t('aJour')}</span>
              )}
            </span>
          </div>
        )}
        {note && (
          <p role="status" className="fixed left-1/2 z-[1300] -translate-x-1/2 rounded-xl px-4 py-2 text-sm" style={{ top: 112, background: '#14121D', border: `1px solid ${note.ok ? '#3DB5A6' : '#F58FA3'}`, color: '#F4EFE6' }}>
            {note.text}
          </p>
        )}
        {intro && !hiddenHere && (
          <Sheet
            side={false}
            title={t('introTitre')}
            onClose={() => {
              setIntro(false)
              try {
                localStorage.setItem('donivers:atelier-vu', '1')
              } catch {}
            }}
            closeLabel={t('compris')}
          >
            <p>{t('intro1')}</p>
            <p>{t('intro2')}</p>
            <p>{t('intro3')}</p>
          </Sheet>
        )}
        {target === 'langues' && <LanguagesSheet draft={draft} onClose={() => setTarget(null)} save={async locales => {
          const d = await post({ action: 'save', locales })
          if (d) {
            apply(d)
            router.refresh()
          }
        }} />}
        {target === 'tout' && <AllTexts draft={draft} onPick={f => setTarget(f)} onClose={() => setTarget(null)} />}
        {target && target !== 'langues' && target !== 'tout' && target !== 'logo' && target !== 'icon' && (
          <TextSheet key={target} field={target} draft={draft} pageLocale={pageLocale} setText={setText} onClose={() => setTarget(null)} />
        )}
        {(target === 'logo' || target === 'icon') && <ImageSheet type={target} url={target === 'logo' ? draft.logoUrl : draft.iconUrl} onDone={load} onClose={() => setTarget(null)} />}
      </OrgIdentityProvider>
    </Ctx.Provider>
  )
}

const WIDE = '(min-width: 1024px)'

/** Grand écran (ordinateur) : les éditeurs deviennent un panneau latéral. */
function useWide() {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(WIDE)
    const update = () => setWide(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return wide
}

/**
 * Fenêtre d'un éditeur. Téléphone et tablette : feuille du bas (ou centrée) sur un fond assombri.
 * Ordinateur (`side`) : panneau à droite, sans fond : le vitrail reste visible ET cliquable derrière,
 * on voit chaque frappe à sa place et un clic sur un autre pointillé change d'éditeur. Échap ferme.
 */
function Sheet({ title, onClose, closeLabel, children, side = true }: { title: string; onClose: () => void; closeLabel: string; children: React.ReactNode; side?: boolean }) {
  const wide = useWide()
  const panel = side && wide
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (panel)
    return (
      <aside
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className="fixed right-4 top-[112px] z-[1400] max-h-[calc(100dvh-128px)] w-[380px] space-y-3 overflow-y-auto rounded-2xl p-5 text-sm"
        style={{ background: '#14121D', border: '1px solid rgba(240,178,74,0.4)', boxShadow: '0 16px 50px rgba(0,0,0,0.6)', color: '#F4EFE6' }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="chip !px-2.5 !py-1 text-[12px]" onClick={onClose} aria-label={closeLabel}>
            ✕
          </button>
        </div>
        {children}
      </aside>
    )
  return (
    <div className="fixed inset-0 z-[1400] flex items-end justify-center sm:items-center" style={{ background: 'rgba(5,4,8,0.55)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[85vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-sm sm:rounded-2xl"
        style={{ background: '#14121D', border: '1px solid rgba(244,239,230,0.12)', color: '#F4EFE6' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
        <div className="pt-1">
          <button className="btn" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const AREA: TextField[] = ['about', 'why', 'placeholder']

function TextSheet({ field, draft, pageLocale, setText, onClose }: { field: TextField; draft: Draft; pageLocale: Locale; setText: (l: Locale, f: TextField, v: string) => void; onClose: () => void }) {
  const t = useTranslations('atelier')
  const primary = draft.locales[0]
  // La langue de la page d'abord : c'est celle qu'on voit changer derrière
  const order = [pageLocale, ...draft.locales.filter(l => l !== pageLocale)]
  return (
    <Sheet title={t(`champs.${field}`)} onClose={onClose} closeLabel={t('fermer')}>
      <p className="muted text-xs">{t(`ou.${field}`)}</p>
      {order.map(l => {
        const v = draft.texts[l]?.[field] ?? ''
        const fallback = l !== primary ? draft.texts[primary]?.[field] : undefined
        return (
          <label key={l} className="block space-y-1">
            {draft.locales.length > 1 && <span className="block text-xs font-semibold uppercase tracking-wide">{l === 'fr' ? t('francais') : t('anglais')}</span>}
            {AREA.includes(field) ? (
              <textarea className="field min-h-[110px]" lang={l} maxLength={TEXT_MAX[field]} value={v} placeholder={fallback || t('videNeutre')} onChange={e => setText(l, field, e.target.value)} autoFocus={l === pageLocale} onFocus={e => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)} />
            ) : (
              <input className="field" lang={l} maxLength={TEXT_MAX[field]} value={v} placeholder={fallback || t('videNeutre')} onChange={e => setText(l, field, e.target.value)} autoFocus={l === pageLocale} onFocus={e => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)} />
            )}
            <span className="muted block text-right text-xs">
              {v.length} / {TEXT_MAX[field]}
            </span>
          </label>
        )
      })}
      <p className="muted text-xs">{t('brouillonNote')}</p>
    </Sheet>
  )
}

function AllTexts({ draft, onPick, onClose }: { draft: Draft; onPick: (f: EditTarget) => void; onClose: () => void }) {
  const t = useTranslations('atelier')
  const primary = draft.locales[0]
  const items: EditTarget[] = ['logo', 'icon', ...TEXT_FIELDS]
  return (
    <Sheet title={t('tousLesTextes')} onClose={onClose} closeLabel={t('fermer')}>
      <ul className="space-y-1">
        {items.map(f => {
          const value = f === 'logo' ? draft.logoUrl : f === 'icon' ? draft.iconUrl : draft.texts[primary]?.[f]
          return (
            <li key={f}>
              <button className="console-row flex w-full items-start gap-3 rounded-xl p-2 text-left" onClick={() => onPick(f)}>
                <span className="flex-1">
                  <span className="block font-semibold">{t(`champs.${f}`)}</span>
                  <span className="muted block text-xs">{t(`ou.${f}`)}</span>
                </span>
                <span className="text-xs" style={{ color: value ? '#3DB5A6' : 'var(--muted)' }}>
                  {value ? t('rempli') : t('neutre')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

const LOCALE_CHOICES: { key: 'fr' | 'en' | 'frEn' | 'enFr'; locales: Locale[] }[] = [
  { key: 'fr', locales: ['fr'] },
  { key: 'en', locales: ['en'] },
  { key: 'frEn', locales: ['fr', 'en'] },
  { key: 'enFr', locales: ['en', 'fr'] },
]

function LanguagesSheet({ draft, onClose, save }: { draft: Draft; onClose: () => void; save: (l: Locale[]) => Promise<void> }) {
  const t = useTranslations('atelier')
  const current = draft.locales.join()
  return (
    <Sheet title={t('langues')} onClose={onClose} closeLabel={t('fermer')}>
      <p className="muted text-xs">{t('languesAide')}</p>
      <div className="grid gap-2">
        {LOCALE_CHOICES.map(c => (
          <label key={c.key} className="flex items-center gap-2">
            <input type="radio" name="langues" checked={current === c.locales.join()} onChange={() => void save(c.locales)} />
            {t(`langue.${c.key}`)}
          </label>
        ))}
      </div>
    </Sheet>
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

function ImageSheet({ type, url, onDone, onClose }: { type: 'logo' | 'icon'; url: string | null; onDone: () => Promise<void>; onClose: () => void }) {
  const t = useTranslations('atelier')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const send = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const png = type === 'logo' ? await toPng(file, 800, 300) : await toPng(file, 256, 256)
      const res = await fetch(`/api/atelier/image?type=${type}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png })
      if (res.ok) await onDone()
      else setError(((await res.json().catch(() => ({}))) as { error?: string }).error || t('erreur'))
    } catch {
      setError(t('imageErreur'))
    }
    setBusy(false)
  }
  const remove = async () => {
    setBusy(true)
    const res = await fetch(`/api/atelier/image?type=${type}`, { method: 'DELETE' })
    if (res.ok) await onDone()
    setBusy(false)
  }
  return (
    <Sheet title={t(`champs.${type}`)} onClose={onClose} closeLabel={t('fermer')}>
      <p className="muted text-xs">{t(`ou.${type}`)}</p>
      <p className="text-xs" style={{ color: '#F0B24A' }}>
        {t('imageClaire')}
      </p>
      <div className="flex items-center justify-center rounded-xl p-4" style={{ background: '#0B0A12', border: '1px solid rgba(244,239,230,0.12)', minHeight: 96 }}>
        {url ? <img src={url} alt="" style={{ maxWidth: '90%', maxHeight: type === 'logo' ? 80 : 64 }} /> : <span className="muted text-xs">{t('aucune')}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className={`btn ${busy ? 'pointer-events-none opacity-60' : ''}`}>
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
          <button className="btn btn-ghost" disabled={busy} onClick={() => void remove()}>
            {t('retirer')}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs" style={{ color: '#F58FA3' }}>
          {error}
        </p>
      )}
      <p className="muted text-xs">{t('brouillonNote')}</p>
    </Sheet>
  )
}

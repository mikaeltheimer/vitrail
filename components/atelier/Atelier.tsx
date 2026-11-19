'use client'

/* eslint-disable @next/next/no-img-element -- aperçu des images téléversées */
import { useConfirm } from '@/components/ConfirmDialog'
import Guide, { guideDone, guideSteps, type GuideAction, type GuideData } from './Guide'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { OrgIdentityProvider, useIdentityContext } from '@/components/OrgIdentity'
import { QUESTION_FIELDS, TEXT_FIELDS, TEXT_MAX, clampLocale, resolveTexts, type Defaults, type Identity, type OrgTexts, type StoredTexts, type TextField } from '@/lib/identity-shared'
import type { Locale } from '@/i18n/config'

// L'ATELIER : sur le vitrail d'entraînement, le propriétaire personnalise son vitrail EN CONTEXTE. Mode « Modifier » :
// chaque texte, le logo et l'icône s'entourent d'un pointillé ; un clic ouvre son éditeur. Les changements vont dans un
// brouillon (visible ici seulement) ; « Publier » les fait passer sur le vrai vitrail. Voir lib/atelier.ts.
// Pour les visiteurs et les bénévoles, l'atelier n'affiche rien de plus (l'API refuse : pas propriétaire).

export type EditTarget = TextField | 'logo' | 'icon' | 'total'

interface AtelierState {
  editing: boolean
  open: (target: EditTarget) => void
  /** Hauteur de la barre de l'atelier (une ou deux lignes sur téléphone) : la page range son titre dessous. */
  barHeight: number
  /** Montant collecté affiché, tel que dans le brouillon (aperçu avant de publier). */
  showTotal: boolean
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
  /** Montant collecté affiché sur le vitrail (absent d'une vieille réponse : affiché). */
  showTotal?: boolean
  logoUrl: string | null
  iconUrl: string | null
  /** Textes proposés par langue, « {org} » à remplacer (absents d'une vieille réponse : aucun texte proposé). */
  proposed?: Partial<Record<Locale, Partial<Record<TextField, string>>>>
  /** Pour le guide : l'état de la console, publication, dons fictifs (absent d'une vieille réponse). */
  guide?: GuideData
}

/** Le texte proposé pour un champ, avec le nom de l'organisme dans cette langue ; '' s'il n'y en a pas. */
function proposedFor(draft: Draft, l: Locale, f: TextField): string {
  const tpl = draft.proposed?.[l]?.[f] ?? ''
  if (!tpl) return ''
  const primary = draft.locales[0] ?? 'fr'
  const name = (draft.texts[l]?.name || draft.texts[primary]?.name || draft.fallbackName).trim()
  return tpl.replaceAll('{org}', name)
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
  const [target, setTarget] = useState<EditTarget | 'langues' | 'tout' | 'guide' | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [barHeight, setBarHeight] = useState(36)
  // Confirmations dans une fenêtre de Donivers, pas celle du navigateur (Mika, 17 nov.)
  const [confirmDialog, confirm] = useConfirm()
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
      // à la première visite, le guide s'ouvre (il dit quoi faire, et dans quel ordre).
      try {
        if (!localStorage.getItem('donivers:atelier-vu')) setTarget('guide')
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
      setDraft(cur => (cur ? { ...cur, toModerate: d.toModerate, guide: d.guide ?? cur.guide } : cur))
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
    if (!(await confirm({ title: t('publierTitre'), text: t('publierTexte'), confirmLabel: t('publier'), cancelLabel: t('pasMaintenant') }))) return
    setBusy(true)
    const d = await post({ action: 'publish' })
    setBusy(false)
    if (d) {
      apply(d)
      setNote({ ok: true, text: t('publie') })
    }
  }
  const steps = guideSteps(draft)
  const closeGuide = () => {
    setTarget(null)
    try {
      localStorage.setItem('donivers:atelier-vu', '1')
    } catch {}
  }
  const guideAction = (a: GuideAction) => {
    try {
      localStorage.setItem('donivers:atelier-vu', '1')
    } catch {}
    if (a === 'publier') return void publish()
    if (a === 'don') {
      // Le panneau de don est celui de la page du vitrail : on le lui demande
      setTarget(null)
      setEditing(false)
      window.dispatchEvent(new Event('donivers:don-fictif'))
      return
    }
    setEditing(true)
    setTarget(a)
  }
  const discard = async () => {
    if (!(await confirm({ title: t('abandonnerTitre'), text: t('abandonnerTexte'), confirmLabel: t('abandonner'), cancelLabel: t('garder'), danger: true }))) return
    setBusy(true)
    const d = await post({ action: 'discard' })
    setBusy(false)
    if (d) {
      apply(d)
      router.refresh()
    }
  }

  return (
    <Ctx.Provider value={{ editing: editing && !hiddenHere, open: f => setTarget(f), barHeight: hiddenHere ? 0 : barHeight, showTotal: draft.showTotal !== false }}>
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
            <button className="chip !px-2.5 !py-1 text-[12px]" aria-pressed={target === 'guide'} onClick={() => (target === 'guide' ? closeGuide() : setTarget('guide'))} style={target !== 'guide' && guideDone(steps) < steps.length ? { borderColor: '#F0B24A', color: '#F0B24A' } : undefined}>
              {t('guide.puce', { fait: guideDone(steps), total: steps.length })}
            </button>
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
        {confirmDialog}
        {target === 'guide' && !hiddenHere && (
          <Sheet title={t('guide.titre')} onClose={closeGuide} closeLabel={t('fermer')}>
            <Guide steps={steps} guide={draft.guide} pending={draft.pending} consoleUrl={draft.consoleUrl} onAction={guideAction} />
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
        {target === 'total' && (
          <TotalSheet
            value={draft.showTotal !== false}
            onClose={() => setTarget(null)}
            save={async v => {
              setDraft({ ...draft, showTotal: v, pending: true })
              const d = await post({ action: 'save', showTotal: v })
              if (d) apply(d)
            }}
          />
        )}
        {target && target !== 'langues' && target !== 'tout' && target !== 'guide' && target !== 'logo' && target !== 'icon' && target !== 'total' && (
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
        // La question du témoignage s'édite avec ses deux questions facultatives : chaque donateur en voit une au hasard
        const fields: readonly TextField[] = field === 'question' ? QUESTION_FIELDS : [field]
        return (
          <div key={l} className="space-y-2">
            {draft.locales.length > 1 && <span className="block text-xs font-semibold uppercase tracking-wide">{l === 'fr' ? t('francais') : t('anglais')}</span>}
            {fields.map(f => (
              <TextInput key={f} field={f} locale={l} label={fields.length > 1 && f !== 'question' ? t(`champs.${f}`) : null} draft={draft} primary={primary} autoFocus={l === pageLocale && f === field} setText={setText} />
            ))}
          </div>
        )
      })}
      <p className="muted text-xs">{t('brouillonNote')}</p>
    </Sheet>
  )
}

function TextInput({ field, locale: l, label, draft, primary, autoFocus, setText }: { field: TextField; locale: Locale; label: string | null; draft: Draft; primary: Locale; autoFocus: boolean; setText: (l: Locale, f: TextField, v: string) => void }) {
  const t = useTranslations('atelier')
  const v = draft.texts[l]?.[field] ?? ''
  const fallback = l !== primary ? draft.texts[primary]?.[field] : undefined
  // Champ vide : on montre le texte qui s'affichera vraiment (celui de la langue principale, sinon le texte proposé),
  // avec « Partir de ce texte » pour le retoucher. Présentation : une piste d'écriture (elle n'a pas de texte proposé).
  // Les questions facultatives n'ont rien : vides, elles ne sont simplement pas posées.
  const proposed = fallback ? '' : proposedFor(draft, l, field)
  const placeholder = fallback || proposed || (field === 'about' ? t('aboutPiste') : '')
  const common = {
    lang: l,
    maxLength: TEXT_MAX[field],
    value: v,
    placeholder,
    autoFocus,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length),
  }
  return (
    <label className="block space-y-1">
      {label && <span className="muted block text-xs">{label}</span>}
      {AREA.includes(field) ? (
        <textarea className="field min-h-[110px]" {...common} onChange={e => setText(l, field, e.target.value)} />
      ) : (
        <input className="field" {...common} onChange={e => setText(l, field, e.target.value)} />
      )}
      <span className="flex items-start justify-between gap-3 text-xs">
        <span className="muted">
          {!v && proposed && (
            <>
              {t('proposeNote')}{' '}
              <button type="button" className="underline" style={{ color: '#F0B24A' }} onClick={() => setText(l, field, proposed)}>
                {t('partirDe')}
              </button>
            </>
          )}
        </span>
        <span className="muted shrink-0">
          {v.length} / {TEXT_MAX[field]}
        </span>
      </span>
    </label>
  )
}

function AllTexts({ draft, onPick, onClose }: { draft: Draft; onPick: (f: EditTarget) => void; onClose: () => void }) {
  const t = useTranslations('atelier')
  const primary = draft.locales[0]
  // Les questions facultatives s'éditent avec la première (même fenêtre)
  const items: EditTarget[] = ['logo', 'icon', ...TEXT_FIELDS.filter(f => f !== 'question2' && f !== 'question3'), 'total']
  return (
    <Sheet title={t('tousLesTextes')} onClose={onClose} closeLabel={t('fermer')}>
      <ul className="space-y-1">
        {items.map(f => {
          if (f === 'total') {
            return (
              <li key={f}>
                <button className="console-row flex w-full items-start gap-3 rounded-xl p-2 text-left" onClick={() => onPick(f)}>
                  <span className="flex-1">
                    <span className="block font-semibold">{t('champs.total')}</span>
                    <span className="muted block text-xs">{t('ou.total')}</span>
                  </span>
                  <span className="muted text-xs">{draft.showTotal !== false ? t('montant.affiche') : t('montant.masque')}</span>
                </button>
              </li>
            )
          }
          const value = f === 'logo' ? draft.logoUrl : f === 'icon' ? draft.iconUrl : draft.texts[primary]?.[f]
          return (
            <li key={f}>
              <button className="console-row flex w-full items-start gap-3 rounded-xl p-2 text-left" onClick={() => onPick(f)}>
                <span className="flex-1">
                  <span className="block font-semibold">{t(`champs.${f}`)}</span>
                  <span className="muted block text-xs">{t(`ou.${f}`)}</span>
                </span>
                <span className="text-xs" style={{ color: value ? '#3DB5A6' : 'var(--muted)' }}>
                  {value ? t('rempli') : f !== 'logo' && f !== 'icon' && proposedFor(draft, primary, f) ? t('neutre') : t('vide')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

/** Montant collecté : affiché ou masqué sur le vitrail (dans le brouillon, comme le reste ; « Publier » l'applique). */
function TotalSheet({ value, save, onClose }: { value: boolean; save: (v: boolean) => Promise<void>; onClose: () => void }) {
  const t = useTranslations('atelier')
  return (
    <Sheet title={t('champs.total')} onClose={onClose} closeLabel={t('fermer')}>
      <div className="space-y-3 text-sm">
        <div role="radiogroup" aria-label={t('champs.total')} className="space-y-2">
          {[true, false].map(v => (
            <label key={String(v)} className="console-row flex cursor-pointer items-start gap-3 rounded-xl border p-3" style={{ borderColor: value === v ? '#F0B24A' : 'var(--line)' }}>
              <input type="radio" name="montant" className="mt-1" style={{ accentColor: '#F0B24A' }} checked={value === v} onChange={() => void save(v)} />
              <span>
                <span className="block font-semibold">{v ? t('montant.afficher') : t('montant.masquer')}</span>
                <span className="muted block text-xs">{v ? t('montant.afficherAide') : t('montant.masquerAide')}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="muted text-xs">{t('montant.objectif')}</p>
        <p className="muted text-xs">{t('montant.publier')}</p>
      </div>
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

'use client'

// Guide de l'atelier (Mika, 17 nov. 2026) : une liste d'étapes pour préparer son vitrail, plutôt que de laisser
// l'organisme deviner ce qu'il peut ou doit faire. Ouvert d'emblée à la première visite (il remplace l'ancienne
// fenêtre d'accueil), puis depuis « Guide · n sur 6 » dans la barre. Tout est déjà prêt avec des textes proposés :
// seule la présentation est « à faire » ; le reste est « proposé » tant que l'organisme ne l'a pas personnalisé.

import { useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import type { StoredTexts } from '@/lib/identity-shared'
import type { LaunchBlocker } from '@/lib/launch'

export interface GuideData {
  live: boolean
  published: boolean
  blockers: LaunchBlocker[]
  practiceDonations: number
}

export type GuideAction = 'about' | 'why' | 'logo' | 'tout' | 'don' | 'publier'
type State = 'aFaire' | 'propose' | 'fait'

interface Step {
  key: 'presentation' | 'why' | 'logo' | 'titreQuestion' | 'don' | 'publier'
  state: State
  action: GuideAction
}

/** Les six étapes et leur état, d'après le brouillon. Partagé par la pastille de la barre et le panneau. */
export function guideSteps(d: { texts: StoredTexts; locales: Locale[]; logoUrl: string | null; iconUrl: string | null; pending: boolean; guide?: GuideData }): Step[] {
  const primary = d.locales[0] ?? 'fr'
  const has = (f: 'about' | 'why' | 'vitrailTitle' | 'question') => !!(d.texts[primary]?.[f] ?? '').trim()
  return [
    { key: 'presentation', state: has('about') ? 'fait' : 'aFaire', action: 'about' },
    { key: 'why', state: has('why') ? 'fait' : 'propose', action: 'why' },
    { key: 'logo', state: d.logoUrl || d.iconUrl ? 'fait' : 'aFaire', action: 'logo' },
    { key: 'titreQuestion', state: has('vitrailTitle') || has('question') ? 'fait' : 'propose', action: 'tout' },
    { key: 'don', state: (d.guide?.practiceDonations ?? 0) > 0 ? 'fait' : 'aFaire', action: 'don' },
    { key: 'publier', state: d.pending ? 'aFaire' : d.guide?.published ? 'fait' : 'propose', action: 'publier' },
  ]
}

/** « Fait » ou « proposé » : le vitrail peut partir ainsi. Seul « à faire » reste à compter. */
export const guideDone = (steps: Step[]) => steps.filter(s => s.state === 'fait').length

const TAG: Record<State, { bg: string; fg: string }> = {
  aFaire: { bg: 'rgba(240,178,74,0.18)', fg: '#F0B24A' },
  propose: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(244,239,230,0.78)' },
  fait: { bg: 'rgba(61,181,166,0.18)', fg: '#3DB5A6' },
}

export default function Guide({ steps, guide, pending, consoleUrl, onAction }: { steps: Step[]; guide?: GuideData; pending: boolean; consoleUrl?: string | null; onAction: (a: GuideAction) => void }) {
  const t = useTranslations('atelier.guide')
  const done = guideDone(steps)
  // La première étape qui reste à faire est mise en avant
  const next = steps.find(s => s.state === 'aFaire')?.key
  const blockers = guide?.blockers ?? []
  const anchor: Record<LaunchBlocker, string> = { stripe: '#plus/paiements', juridique: '#plus/juridique', conditions: '' }
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-snug" style={{ color: 'rgba(244,239,230,0.82)' }}>
        {t('intro')}
      </p>
      <div aria-hidden style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
        <div style={{ width: `${(done / steps.length) * 100}%`, height: '100%', borderRadius: 3, background: '#F0B24A', transition: 'width 0.4s' }} />
      </div>
      <p className="text-[11px] uppercase tracking-wide" style={{ color: 'rgba(244,239,230,0.6)' }}>
        {t('sectionAtelier')}
      </p>
      <ol className="space-y-1.5">
        {steps.map((s, i) => {
          const tag = TAG[s.state]
          const nothingToPublish = s.key === 'publier' && !pending
          return (
            <li key={s.key}>
              <button
                type="button"
                disabled={nothingToPublish}
                onClick={() => onAction(s.action)}
                className="flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left"
                style={{
                  border: `1px solid ${s.key === next ? '#F0B24A' : 'rgba(255,255,255,0.08)'}`,
                  background: s.key === next ? 'rgba(240,178,74,0.08)' : 'rgba(255,255,255,0.03)',
                  cursor: nothingToPublish ? 'default' : 'pointer',
                }}
              >
                <span
                  aria-hidden
                  className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={s.state === 'fait' ? { background: '#3DB5A6', color: '#0B0A12' } : { border: `1.5px solid ${s.state === 'aFaire' ? '#F0B24A' : 'rgba(255,255,255,0.4)'}`, color: s.state === 'aFaire' ? '#F0B24A' : 'inherit' }}
                >
                  {s.state === 'fait' ? '✓' : i + 1}
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold">{t(`etapes.${s.key}.titre`)}</span>
                  <span className="block text-[12px] leading-snug" style={{ color: 'rgba(244,239,230,0.72)' }}>
                    {nothingToPublish ? t('rienAPublier') : t(`etapes.${s.key}.aide`)}
                  </span>
                </span>
                {/* Rien à publier, jamais publié : pas d'état (« proposé » n'aurait pas de sens) */}
                {!(nothingToPublish && s.state !== 'fait') && (
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px]" style={{ background: tag.bg, color: tag.fg }}>
                    {t(`etats.${s.state}`)}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
      <p className="pt-1 text-[11px] uppercase tracking-wide" style={{ color: 'rgba(244,239,230,0.6)' }}>
        {guide?.live ? t('sectionEnLigne') : t('sectionConsole')}
      </p>
      {guide?.live ? (
        <p className="text-[12px]" style={{ color: 'rgba(244,239,230,0.82)' }}>
          {t('enLigne')}
        </p>
      ) : (
        <ul className="space-y-1">
          {(['stripe', 'juridique', 'conditions'] as const).map(b => {
            const missing = blockers.includes(b)
            return (
              <li key={b} className="flex items-center gap-2 text-[12px]">
                <span aria-hidden style={{ color: missing ? '#F0B24A' : '#3DB5A6', width: 14, textAlign: 'center' }}>
                  {missing ? '○' : '✓'}
                </span>
                <span className="flex-1">{t(`console.${b}`)}</span>
                {missing && consoleUrl && (
                  <a href={`${consoleUrl}${anchor[b]}`} className="underline" style={{ color: '#F0B24A' }}>
                    {t('ouvrir')}
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

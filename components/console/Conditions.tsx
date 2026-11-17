'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { CONFIG } from '@/lib/config'
import { PRICING } from '@/lib/platform-fee'
import { INTL_TAG, type Locale } from '@/i18n/config'
import { useMoney } from '@/lib/useI18n'
import type { Act, ConsoleData } from './types'

// Acceptation d'une nouvelle version des conditions de la plateforme (D8, piste B validée par Mika le 16 nov. 2026) :
// plein écran à la première ouverture de la console (avec « Plus tard »), puis un élément « À faire » en tête de l'Accueil
// qui rouvre ce résumé. Seul le propriétaire accepte. Générique : revient de lui-même à chaque nouvelle TERMS_VERSION.
// Le résumé dit ce qui change ; le texte qui fait foi est la page des conditions (lien).

/** « Plus tard » est retenu dans l'onglet, pour cette version : le plein écran revient à la prochaine ouverture de la console. */
export const laterKey = (version: string) => `donivers.conditions.plusTard.${version}`

export function readLater(version: string): boolean {
  try {
    return sessionStorage.getItem(laterKey(version)) === '1'
  } catch {
    return false
  }
}

export function TermsSummary({ data, act, onLater }: { data: ConsoleData; act: Act; onLater?: () => void }) {
  const t = useTranslations('console.conditions')
  const ti = useTranslations('inscription.conditions')
  const locale = useLocale() as Locale
  const money = useMoney()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const terms = data.terms
  if (!terms) return null
  const org = data.org.name
  const brand = CONFIG.brand.name
  const pct = new Intl.NumberFormat(INTL_TAG[locale], { style: 'percent', maximumFractionDigits: 1 }).format(PRICING.rate)
  const date = new Date(`${terms.effectiveDate}T12:00:00Z`).toLocaleDateString(INTL_TAG[locale], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const changes = terms.exempt
    ? [t('changeContribution', { brand }), t('changePartenaire'), t('changeRemboursement')]
    : [
        t('changeContribution', { brand }),
        t('changePlafond', { brand, plafond: money(PRICING.capCents), suivant: PRICING.freeDonors + 1 }),
        t('changeTaxes', { taux: pct, plafond: money(PRICING.capCents) }),
        t('changeRemboursement'),
      ]

  return (
    <div className="space-y-4">
      <p className="muted m-0">{t('intro', { date, org })}</p>
      <ul className="m-0 list-none space-y-2.5 p-0">
        {changes.map(c => (
          <li key={c} className="flex gap-2.5 text-[15px]">
            <span aria-hidden="true" className="mt-[9px] h-[7px] w-[7px] flex-none rounded-full" style={{ background: 'var(--accent)' }} />
            {c}
          </li>
        ))}
      </ul>
      {!terms.exempt && (
        <p className="m-0 rounded-xl px-3 py-2.5 text-sm" style={{ background: 'rgba(31,169,120,0.12)', border: '1px solid rgba(31,169,120,0.35)' }}>
          {t('rassure')}
        </p>
      )}
      <a href="/plateforme/conditions" target="_blank" rel="noopener" className="inline-block text-sm">
        {t('lire')} ↗
      </a>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 flex-none" checked={checked} onChange={e => setChecked(e.target.checked)} />
        <span>{ti('accepte', { org })}</span>
      </label>
      <button
        className="btn"
        disabled={!checked || busy}
        onClick={async () => {
          setBusy(true)
          await act({ action: 'acceptTerms', version: terms.version }, t('merci'))
          setBusy(false)
        }}
      >
        {busy ? t('acceptation') : t('accepter')}
      </button>
      {onLater && (
        <button className="btn btn-ghost" onClick={onLater}>
          {t('plusTard')}
        </button>
      )}
      <p className="muted m-0 text-center text-[13px]">{data.org.status === 'draft' ? t('noteBrouillon') : t('noteEnLigne')}</p>
    </div>
  )
}

/** Plein écran (première ouverture) : rien d'autre de la console tant que le propriétaire n'a pas accepté ou remis à plus tard. */
export function TermsScreen({ data, act, onLater }: { data: ConsoleData; act: Act; onLater: () => void }) {
  const t = useTranslations('console.conditions')
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="conditions-titre" className="fixed inset-0 z-[60] overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="mx-auto w-full max-w-lg px-5 pb-10 pt-8">
        <p className="muted m-0 text-xs tracking-wide">{data.org.name}</p>
        <h2 id="conditions-titre" className="mb-4 mt-1 text-[26px] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
          {t('titre')}
        </h2>
        <TermsSummary data={data} act={act} onLater={onLater} />
      </div>
    </div>
  )
}

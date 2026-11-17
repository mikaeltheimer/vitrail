'use client'

import { useLocale, useTranslations } from 'next-intl'
import { CONFIG } from '@/lib/config'
import { PRICING, billingStage, type BillingSummary } from '@/lib/platform-fee'
import { INTL_TAG, type Locale } from '@/i18n/config'
import { useMoney } from '@/lib/useI18n'

// Carte « Votre forfait » (Accueil) et son explication (Réglages › Paiements), maquette C validée par Mika le 16 nov. 2026.
// Quatre états : gratuit, en paiement (jauge à deux tons : jade pour les donateurs, ambre pour l'organisme), acquitté,
// partenaire fondateur. La dernière ligne (frais Stripe payés par les contributions) n'apparaît que si elle est positive :
// elle dit seulement ce qui est vrai pour tous, le surplus versé à Donivers est dans la jauge.

const JADE = '#1FA978'
const AMBRE = '#F0B24A'
const CIEL = '#5CC0F5'

const usePct = () => {
  const locale = useLocale() as Locale
  return (r: number) => new Intl.NumberFormat(INTL_TAG[locale], { style: 'percent', maximumFractionDigits: 1 }).format(r)
}

export function ForfaitCard({ billing, onHow }: { billing: BillingSummary; onHow: () => void }) {
  const t = useTranslations('console.forfait')
  const money = useMoney()
  const pct = usePct()
  const stage = billingStage(billing)
  const cap = money(billing.capCents)
  const badge = { partenaire: [t('badgePartenaire'), JADE], acquitte: [t('badgeAcquitte'), CIEL], paiement: [t('badgePaiement'), AMBRE], gratuit: [t('badgeGratuit'), JADE] }[stage]
  const orgPaid = Math.max(0, billing.paidCents - billing.donorsPaidCents)
  const share = (c: number) => (billing.capCents > 0 ? `${Math.min(100, (c / billing.capCents) * 100)}%` : '0%')

  return (
    <section className="card space-y-2" aria-labelledby="forfait-titre">
      <div className="flex items-center justify-between text-sm">
        <span id="forfait-titre" className="muted">
          {t('titre')}
        </span>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: `${badge[1]}22`, color: badge[1] }}>
          {badge[0]}
        </span>
      </div>

      {stage === 'gratuit' && (
        <>
          <p className="m-0 text-[24px] leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {t('gratuit', { n: billing.donorsCounted, max: billing.freeDonors })}
          </p>
          <div role="img" aria-label={t('gratuit', { n: billing.donorsCounted, max: billing.freeDonors })} className="h-2.5 overflow-hidden rounded-full" style={{ background: 'rgba(244,239,230,0.08)' }}>
            <div className="h-full" style={{ width: `${Math.min(100, (billing.donorsCounted / Math.max(1, billing.freeDonors)) * 100)}%`, background: JADE }} />
          </div>
          {billing.donorsPaidCents > 0 && <p className="muted m-0 text-sm">{t('gratuitDonateurs', { montant: money(billing.donorsPaidCents), plafond: cap })}</p>}
          <p className="muted m-0 text-sm">{t('gratuitEnsuite', { taux: pct(PRICING.rate), plafond: cap })}</p>
        </>
      )}

      {stage === 'paiement' && (
        <>
          <p className="m-0 text-[24px] leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {t('paiement', { montant: money(billing.paidCents), plafond: cap })}
          </p>
          {billing.donorsPaidCents > 0 && <p className="muted m-0 text-sm">{t('paiementDont', { montant: money(billing.donorsPaidCents) })}</p>}
          <div
            role="img"
            aria-label={t('jauge', { montant: money(billing.paidCents), plafond: cap, donateurs: money(billing.donorsPaidCents) })}
            className="flex h-2.5 overflow-hidden rounded-full"
            style={{ background: 'rgba(244,239,230,0.08)' }}
          >
            <div className="h-full" style={{ width: share(billing.donorsPaidCents), background: JADE }} />
            <div className="h-full" style={{ width: share(orgPaid), background: AMBRE }} />
          </div>
          {billing.donorsPaidCents > 0 && (
            <p className="muted m-0 flex gap-4 text-xs" aria-hidden="true">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: JADE }} />
                {t('legendeDonateurs')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: AMBRE }} />
                {t('legendeVous')}
              </span>
            </p>
          )}
          <p className="muted m-0 text-sm">{t('reste', { montant: money(Math.max(0, billing.capCents - billing.paidCents)) })}</p>
        </>
      )}

      {stage === 'acquitte' && (
        <>
          <p className="m-0 text-[22px] leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {t('acquitte')}
          </p>
          {billing.donorsPaidCents > 0 && <p className="muted m-0 text-sm">{t('acquitteDonateurs', { montant: money(billing.donorsPaidCents) })}</p>}
        </>
      )}

      {stage === 'partenaire' && (
        <>
          <p className="m-0 text-[24px] leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {t('badgePartenaire')}
          </p>
          <p className="muted m-0 text-sm">{t('partenaire')}</p>
        </>
      )}

      {billing.stripeCoveredCents > 0 && (
        <p className="m-0 border-t pt-2.5 text-sm" style={{ borderColor: 'var(--line)', color: '#d9f2e7' }}>
          {t('stripeCouverts', { montant: money(billing.stripeCoveredCents) })}
        </p>
      )}
      <button className="text-sm" style={{ color: 'var(--accent)', background: 'transparent' }} onClick={onHow}>
        {t('comment')} ›
      </button>
    </section>
  )
}

/** Réglages › Paiements : le modèle en quatre lignes ; « taxes incluses » est dit ici, une fois. */
export function ForfaitInfo({ billing }: { billing: BillingSummary }) {
  const t = useTranslations('console.forfait')
  const money = useMoney()
  const pct = usePct()
  const brand = CONFIG.brand.name
  return (
    <div className="card space-y-2.5 text-sm">
      <h3 className="font-bold">{t('reglagesTitre')}</h3>
      {billing.model === 'exempt' ? (
        <p className="m-0">{t('reglagesPartenaire', { brand })}</p>
      ) : (
        <ul className="m-0 list-disc space-y-1.5 pl-5">
          <li>{t('reglages1', { gratuit: billing.freeDonors })}</li>
          <li>{t('reglages2', { taux: pct(PRICING.rate), plafond: money(billing.capCents) })}</li>
          <li>{t('reglages3', { brand })}</li>
        </ul>
      )}
      <p className="m-0">{t('reglages4')}</p>
      <p className="muted m-0">{t('reglagesStripe', { pct: pct(CONFIG.feePercent), fixe: money(CONFIG.feeFixedCents) })}</p>
      <a href="/plateforme/conditions" target="_blank" rel="noopener" className="inline-block">
        {t('lireConditions')} ↗
      </a>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useMoney } from '@/lib/useI18n'
import { INTL_TAG, type Locale } from '@/i18n/config'
import { ORG_TIMEZONE, PAYMENTS, PERIODS, filterToParams, isFiltered, localToUtc, parseFilter, periodRange, utcToLocal, type JournalFilter, type JournalResponse, type Payment, type Period } from '@/lib/journal'
import type { ConsoleData } from './types'
import { Icon, RED } from './ui'

// Journal des dons : chaque don d'une période (heure de l'organisme), filtré par mode de paiement, provenance et
// donateur, avec un résumé fait pour les comptes d'une soirée (net, par mode de paiement, comptant à rapprocher de la
// caisse). Les filtres vivent dans l'adresse (#dons?periode=hier, #dons?du=…&au=…) : un rechargement garde la vue.
// Les contributions des donateurs ne sont jamais affichées (décision de Mika, 17 nov.) ; le propriétaire voit la part
// qui le concerne : frais Stripe payés par lui et par ses donateurs, commission payée par lui et par les contributions.

const PAGE = 50

interface State {
  period: Period
  /** Bornes personnalisées (heure de l'organisme) : date et heure séparées, comme les champs. */
  duDate: string
  duTime: string
  auDate: string
  auTime: string
  paiement: Payment | null
  provenance: string | null
  q: string
}

function readHash(): State {
  const query = window.location.hash.split('?')[1] ?? ''
  const p = new URLSearchParams(query)
  const f = parseFilter(p)
  const named = p.get('periode') as Period | null
  const period: Period = named && (PERIODS as readonly string[]).includes(named) && named !== 'perso' ? named : f.du || f.au ? 'perso' : 'tout'
  const split = (v: string | null, fallback: string) => (v ? [v.slice(0, 10), v.slice(11)] : [fallback, '00:00'])
  const today = utcToLocal(new Date()).slice(0, 10)
  const [duDate, duTime] = split(f.du, today)
  const [auDate, auTime] = f.au ? split(f.au, today) : ['', '00:00']
  return { period, duDate, duTime, auDate, auTime, paiement: f.paiement, provenance: f.provenance, q: f.q }
}

/** Filtre effectif : une période toute faite est recalculée au moment même (« aujourd'hui » change à minuit). */
function filterOf(s: State, q: string): JournalFilter {
  const range =
    s.period === 'perso'
      ? { du: s.duDate ? `${s.duDate}T${s.duTime || '00:00'}` : null, au: s.auDate ? `${s.auDate}T${s.auTime || '00:00'}` : null }
      : periodRange(s.period)
  return { ...range, paiement: s.paiement, provenance: s.provenance, q }
}

export default function Journal({ data, onOpenDonor }: { data: ConsoleData; onOpenDonor: (id: string) => void }) {
  const t = useTranslations('console.journal')
  const tc = useTranslations('console')
  const tdons = useTranslations('console.dons')
  const tcanal = useTranslations('console.diffuser')
  const money = useMoney()
  const locale = useLocale() as Locale
  const owner = data.me.role === 'owner'

  const [s, setS] = useState<State | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [res, setRes] = useState<JournalResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [shown, setShown] = useState(PAGE)

  // L'adresse n'existe pas côté serveur : lue après le premier rendu
  useEffect(() => {
    const id = setTimeout(() => {
      const x = readHash()
      setS(x)
      setQ(x.q)
    }, 0)
    return () => clearTimeout(id)
  }, [])
  // Recherche : attendre que la saisie s'arrête
  useEffect(() => {
    const id = setTimeout(() => setS(x => (x && x.q !== q.trim() ? { ...x, q: q.trim() } : x)), 300)
    return () => clearTimeout(id)
  }, [q])

  const filter = s ? filterOf(s, s.q) : null
  const from = filter?.du ? localToUtc(filter.du) : null
  const to = filter?.au ? localToUtc(filter.au) : null
  const badRange = !!(from && to && from >= to)
  const params = filter ? filterToParams(filter).toString() : ''
  // Un nouveau don (la console se recharge toutes les 5 s) rafraîchit le journal
  const pulse = `${data.summary.donations}:${data.summary.totalCents}`

  useEffect(() => {
    if (!s || badRange) return
    // Adresse : la période toute faite par son nom, sinon les bornes
    const h = new URLSearchParams(params)
    if (s.period !== 'perso') {
      h.delete('du')
      h.delete('au')
      if (s.period !== 'tout') h.set('periode', s.period)
    }
    const next = `#dons${h.toString() ? `?${h}` : ''}`
    if (window.location.hash !== next) window.history.replaceState(null, '', next)
    let live = true
    const id = setTimeout(() => {
      setLoading(true)
      fetch(`/api/admin/dons?${params}`, { cache: 'no-store' })
        .then(async r => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => ({}))).error)))
        .then((x: JournalResponse) => live && (setRes(x), setError(null)))
        .catch(e => live && setError(typeof e === 'string' ? e : tc('erreur')))
        .finally(() => live && setLoading(false))
    }, 0)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [params, badRange, pulse, s, tc])

  const fmt = useMemo(() => new Intl.DateTimeFormat(INTL_TAG[locale], { timeZone: ORG_TIMEZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), [locale])
  const at = (local: string) => {
    const d = localToUtc(local)
    return d ? fmt.format(d) : local
  }
  // Emplacement d'un QR : un identifiant (« table-accueil ») rendu lisible (« Table accueil »)
  const channelName = (c: string) => {
    if (tcanal.has(`canal.${c}` as 'canal.direct')) return tcanal(`canal.${c}` as 'canal.direct')
    const words = c.replace(/-/g, ' ')
    return words.charAt(0).toUpperCase() + words.slice(1)
  }

  if (!s || !filter) return <p className="muted">{tc('chargement')}</p>
  const update = (patch: Partial<State>) => {
    setShown(PAGE)
    setS({ ...s, ...patch })
  }
  const pick = (p: Period) => {
    if (p === 'perso' && s.period !== 'perso') {
      // Partir des bornes de la période affichée, sinon d'aujourd'hui
      const r = s.period === 'tout' ? periodRange('aujourdhui') : periodRange(s.period)
      update({ period: p, duDate: r.du!.slice(0, 10), duTime: r.du!.slice(11), auDate: r.au!.slice(0, 10), auTime: r.au!.slice(11) })
    } else update({ period: p })
  }
  const reset = () => {
    setQ('')
    update({ period: 'tout', paiement: null, provenance: null, q: '' })
  }

  const sum = res?.summary
  const rows = res?.rows ?? []
  const filtered = isFiltered(filter)
  const range =
    s.period === 'perso'
      ? filter.du && filter.au
        ? t('periodeDuAu', { du: at(filter.du), au: at(filter.au) })
        : filter.du
          ? t('periodeDepuis', { du: at(filter.du) })
          : filter.au
            ? t('periodeJusqua', { au: at(filter.au) })
            : ''
      : s.period === 'tout'
        ? ''
        : t(`periodes.${s.period}`)
  const channels = data.channels.map(c => c.channel)
  if (s.provenance && !channels.includes(s.provenance)) channels.push(s.provenance)
  const summaryLine = [s.period === 'tout' ? t('periodes.tout') : range, s.paiement ? t(`paiements.${s.paiement}`) : t('tousPaiements'), s.provenance ? channelName(s.provenance) : t('toutesProvenances')]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-5">
      <section aria-label={t('filtres')} className="card space-y-4">
        <div className="flex items-center gap-3 md:hidden">
          <Icon name="calendrier" size={20} color="var(--accent)" />
          <p className="min-w-0 flex-1 text-sm">
            <b className="block">{t('filtres')}</b>
            <span className="muted">{summaryLine}</span>
          </p>
          <button className="chip !px-3 text-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? t('masquer') : t('modifier')}
          </button>
        </div>

        <div className={`${open ? 'block' : 'hidden'} space-y-4 md:block`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 hidden items-center gap-2 text-sm font-bold md:inline-flex">
              <Icon name="calendrier" size={18} />
              {t('periode')}
            </span>
            {PERIODS.map(p => (
              <button key={p} className="chip !px-3 !py-2 text-sm" aria-pressed={s.period === p} onClick={() => pick(p)}>
                {t(`periodes.${p}`)}
              </button>
            ))}
          </div>

          {s.period === 'perso' && (
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <fieldset className="flex items-end gap-2">
                <legend className="muted mb-1 text-xs">{t('du')}</legend>
                <input className="field !w-auto !py-2" type="date" value={s.duDate} onChange={e => update({ duDate: e.target.value })} aria-label={t('du')} />
                <input className="field !w-auto !py-2" type="time" value={s.duTime} onChange={e => update({ duTime: e.target.value })} aria-label={t('heureDebut')} />
              </fieldset>
              <fieldset className="flex items-end gap-2">
                <legend className="muted mb-1 text-xs">{t('au')}</legend>
                <input className="field !w-auto !py-2" type="date" value={s.auDate} onChange={e => update({ auDate: e.target.value })} aria-label={t('au')} />
                <input className="field !w-auto !py-2" type="time" value={s.auTime} onChange={e => update({ auTime: e.target.value })} aria-label={t('heureFin')} />
              </fieldset>
              <span className="muted pb-2.5 text-xs">{t('fuseau')}</span>
            </div>
          )}
          {badRange && <p style={{ color: RED }} className="text-sm">{t('dateInvalide')}</p>}

          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[200px] flex-1 md:flex-none">
              <span className="muted mb-1 block text-xs">{t('paiement')}</span>
              <select className="field !py-2" value={s.paiement ?? ''} onChange={e => update({ paiement: (e.target.value || null) as Payment | null })}>
                <option value="">{t('tousPaiements')}</option>
                {PAYMENTS.filter(p => p !== 'demo' || (sum?.byPayment.demo.count ?? 0) > 0 || s.paiement === 'demo').map(p => (
                  <option key={p} value={p}>
                    {t(`paiements.${p}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-[200px] flex-1 md:flex-none">
              <span className="muted mb-1 block text-xs">{t('provenance')}</span>
              <select className="field !py-2" value={s.provenance ?? ''} onChange={e => update({ provenance: e.target.value || null })}>
                <option value="">{t('toutesProvenances')}</option>
                {channels.map(c => (
                  <option key={c} value={c}>
                    {channelName(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-[200px] flex-1">
              <span className="muted mb-1 block text-xs">{t('donateur')}</span>
              <input className="field !py-2" type="search" placeholder={t('chercher')} value={q} onChange={e => setQ(e.target.value)} />
            </label>
            {filtered && (
              <button className="pb-2.5 text-sm underline" style={{ color: 'var(--accent)', background: 'transparent' }} onClick={reset}>
                {t('reinitialiser')}
              </button>
            )}
          </div>
        </div>
      </section>

      {error && <p style={{ color: RED }}>{error}</p>}

      {sum && (
        <section aria-label={t('resume')} className="card space-y-5" aria-busy={loading}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-5">
            <div className="col-span-2 md:col-span-1">
              <p className="muted text-xs">{s.period === 'tout' ? t('netTout') : t('net')}</p>
              <p className="tabular-nums text-[34px] font-semibold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {money(sum.netCents)}
              </p>
              {range && <p className="muted text-xs">{range}</p>}
            </div>
            <Stat label={t('brut')} value={money(sum.grossCents)} />
            <Stat label={t('rembourse')} value={sum.refundedCents ? `−${money(sum.refundedCents)}` : money(0)} color={sum.refundedCents ? RED : undefined} />
            <Stat label={t('statDons')} value={String(sum.donations)} />
            <Stat label={t('statDonateurs')} value={String(sum.donors)} />
          </div>
          <div className="flex flex-wrap gap-3 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
            {PAYMENTS.filter(p => p === 'stripe' || p === 'cash' || sum.byPayment[p].count > 0).map(p => (
              <div key={p} className="flex min-w-[200px] flex-1 items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <Icon name={p === 'stripe' ? 'carte' : p === 'cash' ? 'billet' : 'dons'} size={20} color="var(--muted)" />
                <span className="min-w-0">
                  <span className="muted block text-xs">
                    {t('parPaiement', { paiement: t(`paiements.${p}`), count: sum.byPayment[p].count })}
                    {p === 'cash' && sum.byPayment.cash.count > 0 && <span style={{ color: 'var(--text)' }}> {t('caisse')}</span>}
                  </span>
                  <b className="tabular-nums text-lg">{money(sum.byPayment[p].cents)}</b>
                </span>
              </div>
            ))}
            {owner && sum.stripeFeesCents !== null && (
              <div className="flex min-w-[200px] flex-1 items-center gap-3 rounded-xl border border-dashed px-4 py-3" style={{ borderColor: 'var(--line)' }}>
                <Icon name="carte" size={20} color="var(--muted)" />
                <span className="min-w-0">
                  <span className="muted block text-xs">
                    {t('fraisStripe')}
                    {sum.stripeFeesEstimated && ` · ${t('fraisStripeEstimes')}`}
                  </span>
                  <b className="tabular-nums text-lg">{money(sum.stripeFeesCents)}</b>
                  {sum.fees && sum.fees.stripeDonorCents > 0 && <span className="muted block text-xs">{t('fraisStripeDonateurs', { montant: money(sum.fees.stripeDonorCents) })}</span>}
                </span>
              </div>
            )}
            {owner && sum.fees && sum.fees.commissionOrgCents + sum.fees.commissionDonorCents > 0 && (
              <div className="flex min-w-[200px] flex-1 items-center gap-3 rounded-xl border border-dashed px-4 py-3" style={{ borderColor: 'var(--line)' }}>
                <Icon name="document" size={20} color="var(--muted)" />
                <span className="min-w-0">
                  <span className="muted block text-xs">{t('commission')}</span>
                  <b className="tabular-nums text-lg">{money(sum.fees.commissionOrgCents)}</b>
                  {sum.fees.commissionDonorCents > 0 && <span className="muted block text-xs">{t('commissionDonateurs', { montant: money(sum.fees.commissionDonorCents) })}</span>}
                </span>
              </div>
            )}
          </div>
          <p className="muted text-xs">{t('remboursementsNote')}</p>
        </section>
      )}

      {res && (
        <section aria-label={t('listeTitre')} className="card !p-0" aria-busy={loading}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-4 md:px-5">
            <h2 className="text-lg font-bold">{rows.length === 0 ? (s.period === 'tout' ? t('listeToutVide') : t('listeVide')) : s.period === 'tout' ? t('listeTout', { count: rows.length }) : t('liste', { count: rows.length })}</h2>
            {owner && rows.length > 0 && (
              <a className="chip inline-flex items-center gap-2 !px-3 text-sm !text-[var(--text)]" href={`/api/admin/export?type=dons${params ? `&${params}` : ''}`}>
                <Icon name="telecharger" size={16} />
                {filtered ? t('exporter') : tdons('exporterDons')}
              </a>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="muted px-4 pb-5 text-sm md:px-5">{t('aucun')}</p>
          ) : (
            <>
              {/* Téléphone : une liste ; ordinateur : un tableau */}
              <ul className="md:hidden">
                {rows.slice(0, shown).map(r => (
                  <li key={r.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                    <button className="console-row flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => onOpenDonor(r.donorId)}>
                      <Piece color={r.donor?.color} hidden={r.donor?.hidden} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px]">
                          {donorName(r)}
                        </span>
                        <span className="muted truncate text-xs">
                          {fmt.format(new Date(r.createdAt))} · {t(`paiements.${r.source}`)}
                          {r.channel && ` · ${channelName(r.channel)}`}
                        </span>
                        {state(r)}
                      </span>
                      {amount(r)}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-[15px]">
                  <thead>
                    <tr className="muted border-t text-left text-xs uppercase tracking-wide" style={{ borderColor: 'var(--line)' }}>
                      <th className="px-5 py-3 font-semibold">{t('colDate')}</th>
                      <th className="px-3 py-3 font-semibold">{t('colDonateur')}</th>
                      <th className="px-3 py-3 font-semibold">{t('colPaiement')}</th>
                      <th className="px-3 py-3 font-semibold">{t('colProvenance')}</th>
                      <th className="px-3 py-3 font-semibold">{t('colEtat')}</th>
                      <th className="px-5 py-3 text-right font-semibold">{t('colMontant')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, shown).map(r => (
                      <tr key={r.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                        <td className="muted whitespace-nowrap px-5 py-3 tabular-nums">{fmt.format(new Date(r.createdAt))}</td>
                        <td className="min-w-[180px] px-3 py-3">
                          <button className="inline-flex items-center gap-2.5 text-left hover:underline" style={{ background: 'transparent' }} onClick={() => onOpenDonor(r.donorId)}>
                            <Piece color={r.donor?.color} hidden={r.donor?.hidden} />
                            {donorName(r)}
                          </button>
                        </td>
                        <td className="px-3 py-3">{t(`paiements.${r.source}`)}</td>
                        <td className="muted whitespace-nowrap px-3 py-3">{r.channel ? channelName(r.channel) : '—'}</td>
                        <td className="px-3 py-3">
                          {state(r)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {amount(r)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > shown && (
                <div className="flex justify-center border-t p-4" style={{ borderColor: 'var(--line)' }}>
                  <button className="chip !px-4 text-sm" onClick={() => setShown(shown + PAGE)}>
                    {t('suivants', { count: Math.min(PAGE, rows.length - shown) })}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )

  function donorName(r: JournalResponse['rows'][number]) {
    if (r.donor?.erased) return <span className="muted">{t('supprime')}</span>
    if (!r.donor?.name) return <span className="muted">{t('anonyme')}</span>
    return <span>{r.donor.name}</span>
  }
  function state(r: JournalResponse['rows'][number]) {
    if (r.disputeStatus) return <span className="text-xs font-semibold" style={{ color: r.disputeStatus === 'won' ? 'var(--muted)' : RED }}>{t(`litige.${r.disputeStatus}`)}</span>
    if (r.refundedCents > 0) return <span className="text-xs font-semibold" style={{ color: RED }}>{r.refundedCents >= r.amountCents ? t('rembourseEtat') : t('remboursePartiel')}</span>
    return <span className="muted hidden md:inline">—</span>
  }
  function amount(r: JournalResponse['rows'][number]) {
    const full = r.refundedCents >= r.amountCents && r.amountCents > 0
    return <b className={`tabular-nums ${full ? 'muted line-through' : ''}`}>{money(r.amountCents)}</b>
  }
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="muted text-xs">{label}</p>
      <p className="tabular-nums text-2xl font-semibold" style={{ color }}>
        {value}
      </p>
    </div>
  )
}

function Piece({ color, hidden }: { color?: string; hidden?: boolean }) {
  return <span className="h-5 w-3 flex-none rounded-[3px]" style={{ background: color ?? 'var(--accent)', opacity: hidden ? 0.35 : 1 }} />
}


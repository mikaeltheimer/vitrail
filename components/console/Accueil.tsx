'use client'

import { useEffect, useState } from 'react'
import MiniGlass from '@/components/MiniGlass'
import type { Piece } from '@/lib/types'
import { useTranslations } from 'next-intl'
import { useMoney } from '@/lib/useI18n'
import type { ConsoleData } from './types'
import { one } from './types'
import type { Tab } from './Console'
import { Icon, RED, GREEN, Section, useAgo, useDay } from './ui'

interface Todo {
  key: string
  icon: 'alerte' | 'image' | 'drapeau' | 'courriel' | 'carte'
  title: string
  detail: string
  action: string
  urgent?: boolean
  onClick: () => void
}

// Accueil : où en est la collecte, ce qui demande l'attention de l'équipe (« À faire »), les gestes du soir, les derniers dons.
export default function Accueil({
  data,
  setTab,
  openDonor,
  openCash,
  open,
}: {
  data: ConsoleData
  setTab: (t: Tab) => void
  openDonor: (id: string) => void
  openCash: () => void
  open: (action: string, sameTab?: boolean) => Promise<void>
}) {
  const t = useTranslations('console.accueil')
  const tc = useTranslations('console')
  const money = useMoney()
  const ago = useAgo()
  const day = useDay()
  const owner = data.me.role === 'owner'
  const s = data.summary

  const photos = data.donors.filter(d => d.photo_url && d.photo_status === 'pending').length
  const messages = data.donors.filter(d => d.message && d.message_status === 'pending').length
  const reported = new Set(data.reports.map(r => r.donor_id)).size

  const todos: Todo[] = []
  if (owner)
    for (const x of data.disputes)
      todos.push({
        key: `litige-${x.id}`,
        icon: 'alerte',
        urgent: true,
        title: t('litigeTitre', { montant: money(x.amount_cents + (x.fee_cents ?? 0)) }),
        detail: x.dispute_due_by ? t('litigeDetail', { date: day(x.dispute_due_by) }) : t('litigeDetailSansDate'),
        action: t('repondre'),
        onClick: () => void open('stripeDashboard'),
      })
  if (photos + messages > 0)
    todos.push({
      key: 'moderation',
      icon: 'image',
      title: t('aModerer', { photos, messages }),
      detail: data.photoModeration === 'moderation' ? t('aModererDetail') : t('aModererDetailLive'),
      action: t('moderer'),
      onClick: () => setTab('moderation'),
    })
  if (reported > 0)
    todos.push({ key: 'signalements', icon: 'drapeau', title: t('signales', { count: reported }), detail: t('signalesDetail'), action: t('voir'), onClick: () => setTab('moderation') })
  if (owner && data.bounces.length > 0)
    todos.push({
      key: 'rebonds',
      icon: 'courriel',
      title: t('rebonds', { count: data.bounces.length }),
      detail: t('rebondsDetail'),
      action: t('voir'),
      onClick: () => openDonor(data.bounces[0].donorId),
    })
  if (owner && !data.stripe.ready && !data.org.practice && data.org.status !== 'draft')
    todos.push({
      key: 'stripe',
      icon: 'carte',
      title: data.stripe.accountId ? t('stripeATerminer') : t('stripeAConnecter'),
      detail: t('stripeDetail'),
      action: data.stripe.accountId ? t('terminer') : t('connecter'),
      onClick: () => void open('connectStripe', true),
    })

  const colorOf = new Map(data.donors.map(d => [d.id, d.color]))
  const recent = data.donations.filter(n => n.amount_cents > n.refunded_cents).slice(0, 6)
  const stateLabel = data.org.practice
    ? t('etatEntrainement')
    : data.org.status === 'draft'
      ? t('etatBrouillon')
      : data.mode === 'demo'
        ? t('etatDemo')
        : data.mode === 'off'
          ? t('etatFerme')
          : t('etatEnLigne')
  const stateColor = data.mode === 'stripe' ? GREEN : data.mode === 'demo' ? 'var(--accent)' : RED

  return (
    <div className="space-y-6">
      {data.org.status === 'draft' && !data.org.practice && <Demarrage data={data} open={open} setTab={setTab} />}
      <section aria-label={t('collecte')} className="card space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="muted">{t('vitrailPrincipal')}</span>
          <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: stateColor }}>
            <span className="h-2 w-2 rounded-full" style={{ background: stateColor }} />
            {stateLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[40px] font-semibold leading-none" style={{ fontFamily: 'var(--font-display)' }}>
            {money(s.totalCents)}
          </span>
          {s.goalCents && <span className="muted">{t('surObjectif', { objectif: money(s.goalCents) })}</span>}
        </div>
        {s.goalCents && (
          <div role="img" aria-label={t('progression', { pct: Math.round((s.totalCents / s.goalCents) * 100) })} className="h-2.5 overflow-hidden rounded-full" style={{ background: 'rgba(244,239,230,0.08)' }}>
            <div className="h-full" style={{ width: `${Math.min(100, (s.totalCents / s.goalCents) * 100)}%`, background: 'var(--accent)' }} />
          </div>
        )}
        <p className="muted flex flex-wrap gap-x-4 text-sm">
          <span>{t('dons', { count: s.donations })}</span>
          <span>{t('donateurs', { count: s.donors })}</span>
        </p>
        {data.mode === 'demo' && owner && !data.org.practice && <p className="text-xs" style={{ color: 'var(--accent)' }}>{t('demoExplication')}</p>}
        <Apercu url={data.vitrailUrl} version={s.donations} label={data.org.practice ? t('voirEntrainement') : t('voirVitrail')} />
      </section>

      <Section
        title={t('aFaire')}
        aside={todos.length > 0 ? <span className="rounded-full px-2 text-xs font-bold" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>{todos.length}</span> : undefined}
      >
        {todos.length === 0 && <p className="card muted text-sm">{t('rienAFaire')}</p>}
        {todos.map(x => (
          <button
            key={x.key}
            onClick={x.onClick}
            className="card flex w-full items-start gap-3 !p-3.5 text-left"
            style={x.urgent ? { borderColor: 'rgba(240,120,140,0.55)' } : undefined}
          >
            <Icon name={x.icon} color={x.urgent ? RED : 'var(--accent)'} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-bold">{x.title}</span>
              <span className="muted text-[13px]">{x.detail}</span>
            </span>
            <span className="self-center whitespace-nowrap text-[13px]" style={{ color: 'var(--accent)' }}>
              {x.action}
            </span>
          </button>
        ))}
      </Section>

      <section aria-label={t('raccourcis')} className="grid grid-cols-3 gap-2">
        <a href="/ecran" target="_blank" rel="noopener" className="card flex min-h-[84px] flex-col items-center justify-center gap-2 !p-2 text-center text-[13px] leading-tight !text-[var(--text)]">
          <Icon name="ecran" color="var(--accent)" />
          {t('ouvrirEcran')}
        </a>
        <button onClick={() => setTab('diffuser')} className="card flex min-h-[84px] flex-col items-center justify-center gap-2 !p-2 text-center text-[13px] leading-tight !text-[var(--text)]">
          <Icon name="partager" color="var(--accent)" />
          {t('partager')}
        </button>
        <button onClick={openCash} className="card flex min-h-[84px] flex-col items-center justify-center gap-2 !p-2 text-center text-[13px] leading-tight !text-[var(--text)]">
          <Icon name="billet" color="var(--accent)" />
          {t('donComptant')}
        </button>
      </section>

      <Section
        title={t('derniersDons')}
        aside={
          <button className="text-[13px]" style={{ color: 'var(--accent)' }} onClick={() => setTab('dons')}>
            {t('toutVoir')}
          </button>
        }
      >
        {recent.length === 0 ? (
          <p className="card muted text-sm">{t('aucunDon')}</p>
        ) : (
          <ul className="card !p-0">
            {recent.map((n, i) => {
              const d = one(n.donors)
              return (
                <li key={n.id} className={i ? 'border-t' : ''} style={{ borderColor: 'var(--line)' }}>
                  <button className="console-row flex w-full items-center gap-3 px-3.5 py-3 text-left" onClick={() => openDonor(n.donor_id)}>
                    <span className="h-[22px] w-3.5 flex-none rounded-[3px]" style={{ background: colorOf.get(n.donor_id) ?? 'var(--accent)' }} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px]">{d?.display_name || t('anonyme')}</span>
                      <span className="muted text-xs">
                        {ago(n.created_at)} · {tc(`source.${n.source}` as 'source.stripe')}
                      </span>
                    </span>
                    <b className="text-[15px]">{money(n.amount_cents - n.refunded_cents)}</b>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}

/** Organisme en brouillon : les étapes avant la mise en ligne (le propriétaire seul peut connecter Stripe et mettre en ligne). */
function Demarrage({ data, open, setTab }: { data: ConsoleData; open: (action: string, sameTab?: boolean) => Promise<void>; setTab: (t: Tab) => void }) {
  const t = useTranslations('console.demarrage')
  const owner = data.me.role === 'owner'
  const ready = data.stripe.ready
  const missing = data.identityMissing.length
  const [busy, setBusy] = useState(false)
  const step = (done: boolean, n: number) => (
    <span
      className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-[13px] font-bold"
      style={done ? { background: GREEN, color: 'var(--bg)' } : { border: '2px solid var(--accent)', color: 'var(--accent)' }}
      aria-hidden="true"
    >
      {done ? '✓' : n}
    </span>
  )
  return (
    <section className="card space-y-4" style={{ borderColor: 'rgba(240,178,74,0.45)' }} aria-labelledby="demarrage">
      <div className="flex items-center justify-between">
        <h2 id="demarrage" className="text-[17px] font-bold">
          {t('titre')}
        </h2>
        <span className="text-xs" style={{ color: 'var(--accent)' }}>
          {t('brouillon')}
        </span>
      </div>
      <ol className="space-y-3 text-sm">
        <li className="flex gap-3">
          {step(data.published, 1)}
          <span className="flex-1 space-y-2">
            <span className="block">
              <b>{t('sExercer')}</b>
              <span className="muted block text-[13px]">{t('sExercerAide')}</span>
            </span>
            {data.atelierUrl && (
              <a className="btn" href={data.atelierUrl}>
                {t('ouvrirEntrainement')}
              </a>
            )}
          </span>
        </li>
        <li className="flex gap-3">
          {step(missing === 0, 2)}
          <span className="flex-1 space-y-2">
            <span className="block">
              <b>{t('monVitrail')}</b>
              <span className="muted block text-[13px]">{missing === 0 ? t('monVitrailOk') : t('monVitrailAide', { count: missing })}</span>
            </span>
            {owner && (
              <button className="btn btn-ghost" onClick={() => setTab('plus')}>
                {t('ouvrirMonVitrail')}
              </button>
            )}
          </span>
        </li>
        <li className="flex gap-3">
          {step(ready, 3)}
          <span className="flex-1 space-y-2">
            <span className="block">
              <b>{t('stripe')}</b>
              <span className="muted block text-[13px]">{ready ? t('stripePret') : t('stripeAide')}</span>
            </span>
            {!ready && owner && (
              <button className="btn" onClick={() => void open('connectStripe', true)}>
                {data.stripe.accountId ? t('stripeTerminer') : t('stripeConnecter')}
              </button>
            )}
          </span>
        </li>
        <li className="flex gap-3">
          {step(false, 4)}
          <span className="flex-1 space-y-2">
            <span className="block">
              <b>{t('enLigne')}</b>
              <span className="muted block text-[13px]">{ready && missing === 0 ? t('enLigneAide') : t('enLigneAttente')}</span>
            </span>
            {owner && (
              <button
                className="btn"
                disabled={!ready || missing > 0 || busy}
                onClick={async () => {
                  if (!confirm(t('enLigneConfirmer'))) return
                  setBusy(true)
                  const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'goLive' }) })
                  if (res.ok) window.location.reload()
                  else {
                    setBusy(false)
                    alert(((await res.json().catch(() => ({}))) as { error?: string }).error || t('erreur'))
                  }
                }}
              >
                {t('mettreEnLigne')}
              </button>
            )}
          </span>
        </li>
      </ol>
    </section>
  )
}

// Aperçu du vitrail public (le même instantané que les visiteurs) et lien pour l'ouvrir dans un nouvel onglet.
function Apercu({ url, version, label }: { url: string; version: number; label: string }) {
  const [pieces, setPieces] = useState<Piece[] | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/vitrail', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((s: { pieces?: Piece[] } | null) => live && s?.pieces && setPieces(s.pieces))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [version])
  return (
    <a href={url} target="_blank" rel="noopener" className="console-row -mx-2 flex items-center gap-4 rounded-xl p-2 !text-[var(--text)]">
      <span className="shrink-0 overflow-hidden rounded-full" style={{ width: 96, height: 96, background: '#0B0A12' }} aria-hidden>
        {pieces && <MiniGlass pieces={pieces} size={96} />}
      </span>
      <span className="flex-1 text-sm">
        <span className="block font-semibold" style={{ color: 'var(--accent)' }}>
          {label} ↗
        </span>
        <span className="muted block break-all text-xs">{url.replace(/^https?:\/\//, '').replace(/\?org=.*$/, '')}</span>
      </span>
    </a>
  )
}

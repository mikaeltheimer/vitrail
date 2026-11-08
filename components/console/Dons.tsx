'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { GLASS_COLORS } from '@/lib/config'
import { useGlassName, useMoney } from '@/lib/useI18n'
import type { Act, ConsoleData, DonorRow } from './types'
import { RED, GREEN, Section, Sheet, useTime } from './ui'

const toCents = (s: string) => Math.round((parseFloat(s.replace(',', '.')) || 0) * 100)
const noEmail = (e: string) => e.endsWith('.invalid')

// Dons : les donateurs (un morceau chacun), la fiche d'un donateur, le don comptant, les exports.
export default function Dons({
  data,
  act,
  donorId,
  setDonorId,
  cashOpen,
  setCashOpen,
}: {
  data: ConsoleData
  act: Act
  donorId: string | null
  setDonorId: (id: string | null) => void
  cashOpen: boolean
  setCashOpen: (v: boolean) => void
}) {
  const t = useTranslations('console.dons')
  const money = useMoney()
  const time = useTime()
  const owner = data.me.role === 'owner'
  const [search, setSearch] = useState('')

  const donors = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.donors
      .filter(d => d.totalCents > 0 || q)
      .filter(d => !q || d.display_name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q))
      .sort((a, b) => String(b.lastDonationAt ?? '').localeCompare(String(a.lastDonationAt ?? '')))
  }, [data.donors, search])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => setCashOpen(true)}>
          {t('ajouterComptant')}
        </button>
        {owner && (
          <a className="btn btn-ghost" href="/api/admin/export?type=dons">
            {t('exporterDons')}
          </a>
        )}
      </div>

      {owner && (
        <div className="card flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            <b>{t('listeEnvoi', { count: data.mailingCount })}</b>
            <span className="muted block text-xs">{t('listeEnvoiAide')}</span>
          </span>
          {data.mailingCount > 0 && (
            <a className="btn btn-ghost" href="/api/admin/export?type=liste">
              {t('exporterListe')}
            </a>
          )}
        </div>
      )}

      <Section title={t('donateurs', { count: donors.length })}>
        <input className="field" type="search" placeholder={t('chercher')} value={search} onChange={e => setSearch(e.target.value)} aria-label={t('chercher')} />
        {donors.length === 0 ? (
          <p className="card muted text-sm">{search ? t('aucunResultat') : t('aucunDonateur')}</p>
        ) : (
          <ul className="card !p-0">
            {donors.slice(0, 200).map((d, i) => (
              <li key={d.id} className={i ? 'border-t' : ''} style={{ borderColor: 'var(--line)' }}>
                <button className="console-row flex w-full items-center gap-3 px-3.5 py-3 text-left" onClick={() => setDonorId(d.id)}>
                  <span className="h-[22px] w-3.5 flex-none rounded-[3px]" style={{ background: d.color, opacity: d.hidden ? 0.35 : 1 }} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px]">
                      {d.display_name || t('anonyme')} {d.hidden && <span style={{ color: RED }}>· {t('masque')}</span>}
                    </span>
                    <span className="muted truncate text-xs">
                      {d.erased_at ? t('supprime') : noEmail(d.email) ? t('sansCourriel') : d.email}
                      {d.lastDonationAt ? ` · ${time(d.lastDonationAt)}` : ''}
                    </span>
                  </span>
                  <b className="text-[15px]">{money(d.totalCents)}</b>
                </button>
              </li>
            ))}
          </ul>
        )}
        {donors.length > 200 && <p className="muted text-xs">{t('limite')}</p>}
      </Section>

      {donorId && <DonorSheet id={donorId} data={data} act={act} onClose={() => setDonorId(null)} onOpen={setDonorId} />}
      {cashOpen && <CashSheet act={act} onClose={() => setCashOpen(false)} />}
    </div>
  )
}

interface Detail {
  donor: {
    id: string
    email: string
    display_name: string
    show_name: boolean
    message: string | null
    message_status: string
    photo_url: string | null
    photo_status: string
    color: string
    hidden: boolean
    locale: string
    created_at: string
    mailing_consent_at: string | null
    erased_at: string | null
  }
  donations: {
    id: string
    amount_cents: number
    fee_cents: number | null
    refunded_cents: number
    dispute_status: 'open' | 'won' | 'lost' | null
    source: string
    channel: string | null
    created_at: string
  }[]
  emails: { id: string; created_at: string; kind: string; status: string; to_email: string; error: string | null }[]
}

/** Fiche d'un donateur : son morceau, ses dons (remboursement), ses courriels, et les gestes qui le concernent. */
function DonorSheet({ id, data, act, onClose, onOpen }: { id: string; data: ConsoleData; act: Act; onClose: () => void; onOpen: (id: string) => void }) {
  const t = useTranslations('console.fiche')
  const tc = useTranslations('console')
  const money = useMoney()
  const time = useTime()
  const owner = data.me.role === 'owner'
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refunding, setRefunding] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState<string | null>(null)
  const [merge, setMerge] = useState(false)
  const [mergeSearch, setMergeSearch] = useState('')
  const [erasing, setErasing] = useState(false)
  const [rev, setRev] = useState(0)

  useEffect(() => {
    let live = true
    fetch(`/api/admin/donateur?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async r => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => ({}))).error)))
      .then(x => live && (setD(x), setError(null)))
      .catch(e => live && setError(typeof e === 'string' ? e : tc('erreur')))
    return () => {
      live = false
    }
  }, [id, rev, tc])

  const run = async (payload: Record<string, unknown>, ok: string) => {
    const done = await act(payload, ok)
    if (done) setRev(r => r + 1)
    return done
  }
  const candidates: DonorRow[] = useMemo(() => {
    const q = mergeSearch.trim().toLowerCase()
    if (!q) return []
    return data.donors.filter(x => x.id !== id && (x.display_name.toLowerCase().includes(q) || x.email.toLowerCase().includes(q))).slice(0, 8)
  }, [data.donors, id, mergeSearch])

  const donor = d?.donor
  const erased = !!donor?.erased_at
  const total = d ? d.donations.reduce((s, n) => s + n.amount_cents - n.refunded_cents, 0) : 0
  return (
    <Sheet title={donor?.display_name || t('titre')} onClose={onClose} closeLabel={tc('fermer')}>
      {error && <p style={{ color: RED }}>{error}</p>}
      {!d && !error && <p className="muted">{tc('chargement')}</p>}
      {d && donor && (
        <div className="space-y-6 text-sm">
          <div className="card flex items-center gap-3">
            <span className="h-10 w-7 flex-none rounded" style={{ background: donor.color, opacity: donor.hidden ? 0.35 : 1 }} />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">{money(total)}</p>
              <p className="muted truncate">{erased ? t('supprime', { date: time(donor.erased_at!) }) : noEmail(donor.email) ? t('sansCourriel') : donor.email}</p>
              {!erased && (
                <p className="muted text-xs">
                  {donor.show_name ? t('nomAffiche') : t('nomCache')} · {donor.mailing_consent_at ? t('inscritListe') : t('pasInscritListe')}
                </p>
              )}
            </div>
          </div>

          {donor.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={donor.photo_url} alt="" className="h-32 w-32 rounded-xl object-cover" />
          )}
          {donor.message && <blockquote className="card italic">« {donor.message} »</blockquote>}

          <div className="flex flex-wrap gap-2">
            {!noEmail(donor.email) && (
              <button className="chip !px-3" onClick={() => void run({ action: 'resendLink', donorId: id }, t('lienRenvoye'))}>
                {t('renvoyerLien')}
              </button>
            )}
            {owner && !noEmail(donor.email) && (
              <button className="chip !px-3" onClick={() => setEditEmail(editEmail === null ? donor.email : null)}>
                {t('corrigerCourriel')}
              </button>
            )}
            <button className="chip !px-3" onClick={() => void run({ action: 'hideDonor', donorId: id, hidden: !donor.hidden }, donor.hidden ? t('reaffiche') : t('masqueOk'))}>
              {donor.hidden ? t('reafficher') : t('masquer')}
            </button>
            {!erased && (
              <button
                className="chip !px-3"
                onClick={() => {
                  if (confirm(t('effacerConfirmer'))) void run({ action: 'scrubDonor', donorId: id }, t('efface'))
                }}
              >
                {t('effacer')}
              </button>
            )}
            {owner && !erased && (
              <button className="chip !px-3" aria-expanded={merge} onClick={() => setMerge(!merge)}>
                {t('fusionner')}
              </button>
            )}
          </div>
          <p className="muted text-xs">{t('masquerAide')}</p>

          {editEmail !== null && (
            <form
              className="card space-y-2"
              onSubmit={async e => {
                e.preventDefault()
                if (await run({ action: 'changeDonorEmail', donorId: id, email: editEmail }, t('courrielCorrige'))) setEditEmail(null)
              }}
            >
              <label className="block">
                <span className="muted text-xs">{t('nouveauCourriel')}</span>
                <input className="field mt-1" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} required />
              </label>
              <p className="muted text-xs">{t('corrigerAide')}</p>
              <button className="btn">{tc('enregistrer')}</button>
            </form>
          )}

          {merge && (
            <div className="card space-y-2">
              <p>{t('fusionnerAide')}</p>
              <input className="field" type="search" placeholder={t('chercherAutre')} value={mergeSearch} onChange={e => setMergeSearch(e.target.value)} aria-label={t('chercherAutre')} />
              {candidates.map(x => (
                <button
                  key={x.id}
                  className="chip flex w-full justify-between !px-3 text-left"
                  onClick={async () => {
                    if (!confirm(t('fusionnerConfirmer', { nom: x.display_name || x.email }))) return
                    if (await act({ action: 'mergeDonors', fromId: id, intoId: x.id }, t('fusionne'))) onOpen(x.id)
                  }}
                >
                  <span className="truncate">{x.display_name || x.email}</span>
                  <span className="muted">{money(x.totalCents)}</span>
                </button>
              ))}
            </div>
          )}

          <Section title={t('sesDons')}>
            <ul className="card !p-0">
              {d.donations.map((n, i) => {
                const refundable = owner && n.source === 'stripe' && n.refunded_cents < n.amount_cents && n.dispute_status !== 'open' && n.dispute_status !== 'lost'
                return (
                  <li key={n.id} className={`px-3.5 py-3 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--line)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <b>{money(n.amount_cents)}</b> · {tc(`source.${n.source}` as 'source.stripe')}
                        {n.dispute_status && <span style={{ color: n.dispute_status === 'won' ? GREEN : RED }}> · {t(`litige.${n.dispute_status}` as 'litige.open')}</span>}
                        {n.refunded_cents > 0 && n.dispute_status !== 'lost' && (
                          <span style={{ color: RED }}> · {n.refunded_cents >= n.amount_cents ? t('rembourse') : t('remboursePartiel', { montant: money(n.refunded_cents) })}</span>
                        )}
                        <span className="muted block text-xs">{time(n.created_at)}</span>
                      </span>
                      {refundable && (
                        <button className="chip !px-3" aria-expanded={refunding === n.id} onClick={() => setRefunding(refunding === n.id ? null : n.id)}>
                          {t('rembourser')}
                        </button>
                      )}
                    </div>
                    {refunding === n.id && (
                      <RefundPanel
                        donation={n}
                        onCancel={() => setRefunding(null)}
                        onSubmit={async cents => {
                          if (await run({ action: 'refundDonation', donationId: n.id, amountCents: cents }, t('rembourseOk'))) setRefunding(null)
                        }}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </Section>

          <Section title={t('sesCourriels')}>
            {d.emails.length === 0 ? (
              <p className="muted">{t('aucunCourriel')}</p>
            ) : (
              <ul className="card !p-0">
                {d.emails.map((e, i) => {
                  const bad = ['bounced', 'complained', 'failed'].includes(e.status)
                  return (
                    <li key={e.id} className={`px-3.5 py-2.5 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--line)' }}>
                      <div className="flex justify-between gap-2">
                        <span>{tc(`courriels.type.${e.kind}` as 'courriels.type.receipt')}</span>
                        <b style={{ color: bad ? RED : undefined }}>{tc(`courriels.statut.${e.status}` as 'courriels.statut.sent')}</b>
                      </div>
                      <div className="muted text-xs">
                        {time(e.created_at)} · {e.to_email}
                      </div>
                      {bad && <div className="mt-1 text-xs">{tc('courriels.aide')}</div>}
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          {owner && !erased && (
            <div className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
              {!erasing ? (
                <button className="chip !px-3" style={{ color: RED }} onClick={() => setErasing(true)}>
                  {t('supprimer')}
                </button>
              ) : (
                <div className="card space-y-3" style={{ borderColor: RED }}>
                  <p className="font-semibold">{t('supprimerTitre')}</p>
                  <p>{t('supprimerAide')}</p>
                  <p className="muted text-xs">{t('supprimerStripe')}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn"
                      style={{ background: RED, color: '#140d14' }}
                      onClick={async () => {
                        if (await run({ action: 'eraseDonor', donorId: id }, t('supprimerOk'))) setErasing(false)
                      }}
                    >
                      {t('supprimerConfirmer')}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setErasing(false)}>
                      {tc('annuler')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

/** Remboursement : montant du PAIEMENT (don + frais couverts), tout ce qui reste par défaut. Confirmé, et définitif. */
function RefundPanel({ donation, onCancel, onSubmit }: { donation: Detail['donations'][number]; onCancel: () => void; onSubmit: (cents: number | null) => Promise<void> }) {
  const t = useTranslations('console.remboursement')
  const tc = useTranslations('console')
  const money = useMoney()
  const paid = donation.amount_cents + (donation.fee_cents ?? 0)
  const back = donation.amount_cents > 0 ? Math.round((donation.refunded_cents * paid) / donation.amount_cents) : 0
  const remaining = Math.max(0, paid - back)
  const [all, setAll] = useState(true)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const partial = toCents(amount)
  const valid = all || (partial > 0 && partial <= remaining)
  return (
    <div className="mt-3 space-y-3 rounded-xl border p-3" style={{ borderColor: 'rgba(240,120,140,0.45)' }}>
      <p>
        {t('paiement', { montant: money(paid) })}
        {(donation.fee_cents ?? 0) > 0 && <span className="muted"> {t('detail', { don: money(donation.amount_cents), frais: money(donation.fee_cents ?? 0) })}</span>}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <input type="radio" checked={all} onChange={() => setAll(true)} /> {t('tout', { montant: money(remaining) })}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={!all} onChange={() => setAll(false)} /> {t('partie')}
          <input
            className="field !w-28 !py-1"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onFocus={() => setAll(false)}
            onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
            aria-label={t('montant')}
          />
        </label>
      </div>
      <p className="muted text-xs">{t('avertissement')}</p>
      {!all && amount && !valid && <p style={{ color: RED }}>{t('horsLimite', { max: money(remaining) })}</p>}
      <div className="flex gap-2">
        <button
          className="btn"
          disabled={!valid || busy}
          onClick={async () => {
            const cents = all ? null : partial
            if (!confirm(t('confirmer', { montant: money(cents ?? remaining) }))) return
            setBusy(true)
            try {
              await onSubmit(cents)
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? t('enCours') : t('rembourser')}
        </button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          {tc('annuler')}
        </button>
      </div>
    </div>
  )
}

/** Don en argent comptant (le soir de l'événement), ou don d'amorçage (avant l'ouverture). */
function CashSheet({ act, onClose }: { act: Act; onClose: () => void }) {
  const t = useTranslations('console.comptant')
  const tc = useTranslations('console')
  const glassName = useGlassName()
  const [amount, setAmount] = useState('')
  const [email, setEmail] = useState('')
  const [showName, setShowName] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [color, setColor] = useState<string>(GLASS_COLORS[4].value)
  const [source, setSource] = useState<'cash' | 'seed'>('cash')
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title={t('titre')} onClose={onClose} closeLabel={tc('fermer')}>
      <form
        className="space-y-4 text-sm"
        onSubmit={async e => {
          e.preventDefault()
          setBusy(true)
          const ok = await act({ action: 'addCash', amountCents: toCents(amount), email, showName, name, message, color, source }, t('ajoute'))
          setBusy(false)
          if (ok) onClose()
        }}
      >
        <div className="flex gap-2">
          <button type="button" className="chip !px-3" aria-pressed={source === 'cash'} onClick={() => setSource('cash')}>
            {t('comptant')}
          </button>
          <button type="button" className="chip !px-3" aria-pressed={source === 'seed'} onClick={() => setSource('seed')}>
            {t('amorcage')}
          </button>
        </div>
        <p className="muted text-xs">{source === 'cash' ? t('comptantAide') : t('amorcageAide')}</p>
        <label className="block">
          <span>{t('montant')}</span>
          <input className="field mt-1" inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="25" />
        </label>
        <label className="block">
          <span>{t('courriel')}</span>
          <input className="field mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <span className="muted mt-1 block text-xs">{t('courrielAide')}</span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={showName} onChange={e => setShowName(e.target.checked)} />
          <span>{t('afficherNom')}</span>
        </label>
        {showName && <input className="field" placeholder={t('nom')} value={name} onChange={e => setName(e.target.value)} aria-label={t('nom')} />}
        <textarea className="field" rows={3} placeholder={t('message')} value={message} onChange={e => setMessage(e.target.value)} aria-label={t('message')} />
        <fieldset>
          <legend className="mb-2">{t('couleur')}</legend>
          <div className="flex flex-wrap gap-2">
            {GLASS_COLORS.map(g => (
              <button
                key={g.value}
                type="button"
                aria-label={glassName(g)}
                aria-pressed={color === g.value}
                onClick={() => setColor(g.value)}
                className="h-11 w-11 rounded-full"
                style={{ background: g.value, boxShadow: color === g.value ? '0 0 0 3px var(--bg), 0 0 0 5px var(--text)' : 'none' }}
              />
            ))}
          </div>
        </fieldset>
        <button className="btn w-full" disabled={busy || toCents(amount) <= 0 || (showName && name.trim().length < 2)}>
          {t('ajouter')}
        </button>
      </form>
    </Sheet>
  )
}

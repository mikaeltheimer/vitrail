'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CONFIG, GLASS_COLORS } from '@/lib/config'
import { formatMoney } from '@/lib/format'

interface Donor {
  id: string
  email: string
  display_name: string
  show_name: boolean
  message: string | null
  photo_url: string | null
  photo_status: 'approved' | 'pending'
  message_status?: 'approved' | 'pending'
  quote_consent?: boolean
  color: string
  hidden: boolean
  totalCents: number
  lastDonationAt: string | null
}
interface EventRow {
  id: string
  name: string
  starts_on: string | null
  goal_cents: number
  is_current: boolean
  totalCents: number
  donationsCount: number
}
interface DonationDonor {
  display_name: string
  email: string
  hidden: boolean
  photo_url: string | null
  photo_status: 'approved' | 'pending'
}
interface DonationRow {
  id: string
  donor_id: string
  amount_cents: number
  source: string
  created_at: string
  donors: DonationDonor | DonationDonor[] | null
}
interface ChannelRow {
  channel: string
  visits: number
  donations: number
  totalCents: number
}
interface ReportRow {
  id: number
  donor_id: string
  reason: string | null
  created_at: string
}
interface Data {
  mode: 'stripe' | 'demo' | 'off'
  stripe: { accountId: string | null; ready: boolean }
  reports: ReportRow[]
  photoModeration: 'live' | 'moderation'
  channels: ChannelRow[]
  donors: Donor[]
  events: EventRow[]
  donations: DonationRow[]
}

type Tab = 'direct' | 'donateurs' | 'provenance' | 'comptant' | 'evenements' | 'outils'
const TABS: [Tab, string][] = [
  ['direct', 'En direct'],
  ['donateurs', 'Donateurs'],
  ['provenance', 'Provenance'],
  ['comptant', 'Don comptant'],
  ['evenements', 'Événements'],
  ['outils', 'Outils'],
]
const SOURCE_LABEL: Record<string, string> = { stripe: 'Carte', cash: 'Comptant', seed: 'Amorçage', demo: 'Démo' }

const toCents = (s: string) => Math.round((parseFloat(s.replace(',', '.')) || 0) * 100)
const time = (iso: string) => new Date(iso).toLocaleString('fr-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

export default function AdminConsole() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('direct')
  const [data, setData] = useState<Data | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [mergeFrom, setMergeFrom] = useState<string | null>(null)
  // Décisions de modération : le donateur reçoit un courriel, sauf si la case est décochée (pourriel, abus).
  const [notifyDonor, setNotifyDonor] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(
    () =>
      fetch('/api/admin', { cache: 'no-store' })
        .then(res => {
          if (res.status === 403) router.refresh()
          else if (res.ok) return res.json().then(setData)
        })
        .catch(() => {}),
    [router],
  )

  useEffect(() => {
    void load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [load])

  async function act(payload: Record<string, unknown>, okText = 'Fait.') {
    const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, notify: notifyDonor }) })
    const body = await res.json().catch(() => ({}))
    setMsg(res.ok ? { ok: true, text: okText } : { ok: false, text: body.error || 'Erreur.' })
    if (res.ok) await load()
    return res.ok
  }

  async function logout() {
    await fetch('/api/admin/login', { method: 'DELETE' })
    router.refresh()
  }

  const current = data?.events.find(e => e.is_current) ?? null
  // Signalements regroupés par morceau
  const reported = useMemo(() => {
    const byDonor = new Map<string, { donor: Donor | undefined; reasons: string[]; count: number }>()
    for (const r of data?.reports ?? []) {
      const e = byDonor.get(r.donor_id) ?? { donor: data?.donors.find(d => d.id === r.donor_id), reasons: [], count: 0 }
      e.count++
      if (r.reason) e.reasons.push(r.reason)
      byDonor.set(r.donor_id, e)
    }
    return [...byDonor.entries()]
  }, [data])
  const pending = useMemo(() => (data?.donors ?? []).filter(d => d.photo_url && d.photo_status === 'pending'), [data])
  const pendingMessages = useMemo(() => (data?.donors ?? []).filter(d => d.message && d.message_status === 'pending'), [data])
  const donorsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.donors ?? [])
      .filter(d => !q || d.email.toLowerCase().includes(q) || d.display_name.toLowerCase().includes(q))
      .sort((a, b) => b.totalCents - a.totalCents)
  }, [data, search])

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Console — {CONFIG.brand.name}</h1>
          <p className="muted text-sm">
            {current ? `Événement en cours : ${current.name}` : 'Aucun événement en cours'}
            {data?.mode === 'demo' && <b style={{ color: 'var(--gold)' }}> · MODE DÉMO</b>}
          </p>
        </div>
        <button className="muted text-sm underline" onClick={logout}>
          Quitter
        </button>
      </header>

      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map(([id, label]) => (
          <button key={id} className="chip whitespace-nowrap px-4" aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {msg && (
        <p role="status" className="mt-3 text-sm" style={{ color: msg.ok ? '#3DB5A6' : '#f87171' }}>
          {msg.text}
        </p>
      )}

      <label className="muted mt-3 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={notifyDonor} onChange={e => setNotifyDonor(e.target.checked)} />
        Prévenir le donateur par courriel quand je publie ou retire son témoignage ou sa photo
      </label>

      {!data && <p className="muted mt-6">Chargement…</p>}

      {/* ── En direct ── */}
      {data && tab === 'direct' && (
        <section className="mt-4 space-y-2">
          {reported.length > 0 && (
            <div className="card !p-3" style={{ borderColor: 'rgba(248,113,113,0.6)' }}>
              <p className="text-sm font-semibold" style={{ color: '#f87171' }}>
                {reported.length} morceau{reported.length > 1 ? 'x' : ''} signalé{reported.length > 1 ? 's' : ''}
              </p>
              {reported.map(([donorId, r]) => (
                <div key={donorId} className="mt-3 flex items-center gap-3">
                  {r.donor?.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.donor.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="h-10 w-10 shrink-0 rounded-full" style={{ background: r.donor?.color ?? '#444' }} />
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate">
                      <b>{r.donor?.display_name ?? '—'}</b> · {r.count} signalement{r.count > 1 ? 's' : ''} {r.donor?.hidden && <span style={{ color: '#f87171' }}>(masqué)</span>}
                    </div>
                    {r.donor?.message && <div className="muted truncate text-xs">« {r.donor.message} »</div>}
                    {r.reasons.slice(0, 2).map((reason, i) => (
                      <div key={i} className="truncate text-xs" style={{ color: '#fca5a5' }}>
                        Motif : {reason}
                      </div>
                    ))}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button className="chip !px-3 text-xs" onClick={() => act({ action: 'hideDonor', donorId, hidden: true }).then(ok => ok && act({ action: 'resolveReports', donorId }, 'Morceau masqué.'))}>
                      Masquer
                    </button>
                    <button className="chip !px-3 text-xs" onClick={() => act({ action: 'scrubDonor', donorId }).then(ok => ok && act({ action: 'resolveReports', donorId }, 'Nom, message et photo effacés.'))}>
                      Effacer le contenu
                    </button>
                    <button className="chip !px-3 text-xs" onClick={() => act({ action: 'resolveReports', donorId }, 'Signalement classé sans suite.')}>
                      Sans suite
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Publication des photos : en direct, ou après approbation */}
          <div className="card !p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <b>Photos et témoignages</b>{' '}
                <span className="muted">
                  {data.photoModeration === 'live' ? '— publiés automatiquement (filtre de mots grossiers)' : '— chacun attend votre approbation'}
                </span>
              </div>
              <div className="flex gap-2">
                <button className="chip !px-3 text-sm" aria-pressed={data.photoModeration === 'live'} onClick={() => act({ action: 'setPhotoModeration', mode: 'live' }, 'Mode live : photos et témoignages sont publiés tout de suite.')}>
                  Live
                </button>
                <button className="chip !px-3 text-sm" aria-pressed={data.photoModeration === 'moderation'} onClick={() => act({ action: 'setPhotoModeration', mode: 'moderation' }, 'Mode modération : les nouvelles photos et les nouveaux témoignages attendent votre approbation.')}>
                  Modération
                </button>
              </div>
            </div>
            {pending.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-semibold" style={{ color: 'var(--gold)' }}>
                  {pending.length} photo{pending.length > 1 ? 's' : ''} en attente
                </p>
                {pending.map(d => (
                  <div key={d.id} className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.photo_url ?? ''} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="truncate">
                        <b>{d.display_name}</b> · {formatMoney(d.totalCents)}
                      </div>
                      {d.message && <div className="muted truncate text-xs">« {d.message} »</div>}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <button className="chip !px-3 text-sm" onClick={() => act({ action: 'approvePhoto', donorId: d.id }, 'Photo publiée.')}>
                        Approuver
                      </button>
                      <button className="chip !px-3 text-sm" onClick={() => act({ action: 'removePhoto', donorId: d.id }, 'Photo refusée et supprimée.')}>
                        Refuser
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {pendingMessages.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold" style={{ color: 'var(--gold)' }}>
                  {pendingMessages.length} témoignage{pendingMessages.length > 1 ? 's' : ''} en attente
                </p>
                {pendingMessages.map(d => (
                  <div key={d.id} className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="truncate">
                        <b>{d.show_name ? d.display_name : 'Anonyme'}</b> · {formatMoney(d.totalCents)}
                        {d.quote_consent && <span className="muted text-xs"> · accepte d&apos;être cité</span>}
                      </div>
                      <div className="mt-1 text-sm leading-relaxed">« {d.message} »</div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <button className="chip !px-3 text-sm" onClick={() => act({ action: 'approveMessage', donorId: d.id }, 'Témoignage publié.')}>
                        Approuver
                      </button>
                      <button className="chip !px-3 text-sm" onClick={() => act({ action: 'removeMessage', donorId: d.id }, 'Témoignage refusé et effacé.')}>
                        Refuser
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="muted text-xs">Masquer retire le morceau de l&apos;écran à la prochaine mise à jour (3 s). L&apos;argent reçu reste compté dans les totaux.</p>
          {data.donations.map(n => {
            const d = one(n.donors)
            return (
              <div key={n.id} className="card flex items-center justify-between gap-3 !p-3">
                {d?.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.photo_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate">
                    <b>{formatMoney(n.amount_cents)}</b> · {d?.display_name ?? '—'} {d?.hidden && <span style={{ color: '#f87171' }}>(masqué)</span>}
                  </div>
                  <div className="muted truncate text-xs">
                    {time(n.created_at)} · {SOURCE_LABEL[n.source] ?? n.source} · {d?.email}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {d?.photo_url && (
                    <button className="chip !px-3 text-sm" onClick={() => act({ action: 'removePhoto', donorId: n.donor_id }, 'Photo retirée.')}>
                      Retirer la photo
                    </button>
                  )}
                  <button className="chip !px-3 text-sm" onClick={() => act({ action: 'scrubDonor', donorId: n.donor_id }, 'Nom, message et photo effacés.')}>
                    Effacer le nom
                  </button>
                  <button className="chip !px-3 text-sm" onClick={() => act({ action: 'hideDonor', donorId: n.donor_id, hidden: !d?.hidden })}>
                    {d?.hidden ? 'Réafficher' : 'Masquer'}
                  </button>
                </div>
              </div>
            )
          })}
          {data.donations.length === 0 && <p className="muted">Aucun don pour l&apos;instant.</p>}
        </section>
      )}

      {/* ── Donateurs ── */}
      {data && tab === 'donateurs' && (
        <section className="mt-4 space-y-2">
          <input className="field" placeholder="Chercher par nom ou courriel" value={search} onChange={e => setSearch(e.target.value)} />
          {mergeFrom && (
            <p className="card text-sm">
              Choisissez le morceau qui doit <b>recevoir</b> les dons de « {data.donors.find(d => d.id === mergeFrom)?.email} ».{' '}
              <button className="underline" onClick={() => setMergeFrom(null)}>
                Annuler
              </button>
            </p>
          )}
          {donorsFiltered.map(d => (
            <div key={d.id} className="card flex items-center justify-between gap-3 !p-3">
              <div className="flex min-w-0 items-center gap-3">
                {d.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.photo_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" style={{ opacity: d.hidden ? 0.3 : 1 }} />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-full" style={{ background: d.color, opacity: d.hidden ? 0.3 : 1 }} />
                )}
                <div className="min-w-0 text-sm">
                  <div className="truncate">
                    <b>{d.display_name}</b> · {formatMoney(d.totalCents)} {d.hidden && <span style={{ color: '#f87171' }}>(masqué)</span>}
                  </div>
                  <div className="muted truncate text-xs">{d.email}</div>
                  {d.message && <div className="truncate text-xs">« {d.message} »</div>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {mergeFrom && mergeFrom !== d.id ? (
                  <button
                    className="chip !px-3 text-sm"
                    onClick={async () => {
                      if (await act({ action: 'mergeDonors', fromId: mergeFrom, intoId: d.id }, 'Morceaux réunis.')) setMergeFrom(null)
                    }}
                  >
                    Fusionner ici
                  </button>
                ) : (
                  <>
                    {d.photo_url && (
                      <button className="chip !px-3 text-sm" onClick={() => act({ action: 'removePhoto', donorId: d.id }, 'Photo retirée.')}>
                        Retirer la photo
                      </button>
                    )}
                    <button className="chip !px-3 text-sm" onClick={() => act({ action: 'hideDonor', donorId: d.id, hidden: !d.hidden })}>
                      {d.hidden ? 'Réafficher' : 'Masquer'}
                    </button>
                    <button className="chip !px-3 text-sm" onClick={() => setMergeFrom(d.id)}>
                      Fusionner…
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Don comptant / amorçage ── */}
      {data && tab === 'comptant' && <CashForm events={data.events} onSubmit={p => act(p, 'Don ajouté.')} />}

      {/* ── Événements ── */}
      {data && tab === 'evenements' && (
        <section className="mt-4 space-y-3">
          {data.events.map(e => (
            <EventCard key={e.id} e={e} onAct={act} />
          ))}
          <NewEvent onSubmit={act} />
        </section>
      )}

      {/* ── Outils ── */}
      {data && tab === 'provenance' && (
        <section className="mt-4 space-y-2">
          <p className="muted text-xs">
            D&apos;où viennent les visiteurs et les dons (dons en ligne seulement). « ecran » = le code QR de l&apos;écran ; les autres = vos affiches (page
            <a className="underline" href="/affiche" target="_blank" rel="noreferrer"> /affiche</a>) ; « direct » = lien partagé sans provenance.
          </p>
          <div className="card !p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="muted text-left text-xs">
                  <th className="p-3">Provenance</th>
                  <th className="p-3 text-right">Visites</th>
                  <th className="p-3 text-right">Dons</th>
                  <th className="p-3 text-right">Conversion</th>
                  <th className="p-3 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {data.channels.map(c => (
                  <tr key={c.channel} className="border-t" style={{ borderColor: 'var(--line)' }}>
                    <td className="p-3">{c.channel}</td>
                    <td className="p-3 text-right">{c.visits}</td>
                    <td className="p-3 text-right">{c.donations}</td>
                    <td className="p-3 text-right">{c.visits ? `${Math.round((c.donations / c.visits) * 100)} %` : '—'}</td>
                    <td className="p-3 text-right">{formatMoney(c.totalCents)}</td>
                  </tr>
                ))}
                {data.channels.length === 0 && (
                  <tr>
                    <td className="muted p-3" colSpan={5}>
                      Aucune visite pour l&apos;instant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && tab === 'outils' && (
        <section className="mt-4 space-y-3">
          <EmailJournal />
          <div className="card text-sm">
            <b>Pages</b>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <a href="/ecran" target="_blank">Écran d&apos;affichage</a> — ouvrir en plein écran sur l&apos;ordinateur de l&apos;installation
              </li>
              <li>
                <a href="/don" target="_blank">Page de don</a> — là où mène le QR code
              </li>
            </ul>
          </div>
          <div className="card text-sm">
            <b>Mode de paiement : {data.mode === 'stripe' ? 'Stripe (réel)' : data.mode === 'demo' ? 'Démo (aucun paiement)' : 'Désactivé'}</b>
            <p className="muted mt-1">Le réglage général se fait avec les variables d&apos;environnement (PAYMENT_MODE) ; chaque organisme paie par Stripe seulement quand son compte est prêt.</p>
            <p className="mt-2">
              Compte Stripe de l&apos;organisme : <b>{data.stripe.ready ? 'prêt à encaisser' : data.stripe.accountId ? 'inscription à terminer' : 'non connecté'}</b>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!data.stripe.ready && (
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'connectStripe' }) })
                    const body = await res.json().catch(() => ({}))
                    if (res.ok && body.url) window.location.href = body.url
                    else setMsg({ ok: false, text: body.error || 'Erreur.' })
                  }}
                >
                  {data.stripe.accountId ? "Terminer l'inscription Stripe" : 'Connecter le compte Stripe'}
                </button>
              )}
              {data.stripe.ready && (
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stripeDashboard' }) })
                    const body = await res.json().catch(() => ({}))
                    if (res.ok && body.url) window.open(body.url, '_blank', 'noopener')
                    else setMsg({ ok: false, text: body.error || 'Erreur.' })
                  }}
                >
                  Ouvrir le tableau de bord Stripe
                </button>
              )}
              {data.stripe.accountId && (
                <button className="btn btn-ghost" onClick={() => void act({ action: 'refreshStripe' }, 'État du compte Stripe mis à jour.')}>
                  Vérifier l&apos;état du compte
                </button>
              )}
            </div>
          </div>
          <div className="card text-sm">
            <b>Retirer les dons de démonstration</b>
            <p className="muted mt-1">À faire avant l&apos;événement : supprime tous les dons créés en mode démo, et les morceaux qui n&apos;ont plus aucun don.</p>
            <button
              className="btn btn-ghost mt-3"
              onClick={() => {
                if (confirm('Supprimer tous les dons de démonstration ? Cette action est définitive.')) void act({ action: 'purgeDemo' }, 'Dons de démonstration supprimés.')
              }}
            >
              Supprimer les dons de démo
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

function CashForm({ events, onSubmit }: { events: EventRow[]; onSubmit: (p: Record<string, unknown>) => Promise<boolean> }) {
  const [amount, setAmount] = useState('')
  const [email, setEmail] = useState('')
  const [showName, setShowName] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [color, setColor] = useState<string>(GLASS_COLORS[4].value)
  const [source, setSource] = useState<'cash' | 'seed'>('cash')
  const [eventId, setEventId] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await onSubmit({ action: 'addCash', amountCents: toCents(amount), email, showName, name, message, color, source, eventId })
    if (ok) {
      setAmount('')
      setEmail('')
      setName('')
      setMessage('')
    }
  }

  return (
    <form onSubmit={submit} className="card mt-4 space-y-3">
      <p className="muted text-sm">
        Un don en argent comptant, ou un don d&apos;amorçage avant l&apos;ouverture. Avec le courriel d&apos;un donateur connu, le don agrandit son morceau existant.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="chip" aria-pressed={source === 'cash'} onClick={() => setSource('cash')}>
          Argent comptant
        </button>
        <button type="button" className="chip" aria-pressed={source === 'seed'} onClick={() => setSource('seed')}>
          Amorçage (CA, équipe)
        </button>
      </div>
      <input className="field" inputMode="decimal" placeholder="Montant en $" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))} />
      <input className="field" type="email" placeholder="Courriel (facultatif)" value={email} onChange={e => setEmail(e.target.value)} />
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={showName} onChange={e => setShowName(e.target.checked)} />
        Le donateur accepte que son nom soit affiché
      </label>
      {showName && (
        <>
          <input className="field" placeholder="Nom affiché" value={name} onChange={e => setName(e.target.value)} maxLength={CONFIG.nameMax} />
          <input className="field" placeholder="Témoignage (facultatif)" value={message} onChange={e => setMessage(e.target.value)} maxLength={CONFIG.messageMax} />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {GLASS_COLORS.map(c => (
          <button
            key={c.value}
            type="button"
            aria-label={c.name}
            onClick={() => setColor(c.value)}
            className="h-9 w-9 rounded-full"
            style={{ background: c.value, boxShadow: color === c.value ? '0 0 0 3px #050408, 0 0 0 5px #F4EFE6' : '0 0 0 2px #050408' }}
          />
        ))}
      </div>
      <select className="field" value={eventId} onChange={e => setEventId(e.target.value)}>
        <option value="">Événement en cours</option>
        {events.map(ev => (
          <option key={ev.id} value={ev.id}>
            {ev.name}
          </option>
        ))}
      </select>
      <button className="btn" disabled={toCents(amount) < CONFIG.minAmountCents}>
        Ajouter le don
      </button>
    </form>
  )
}

function EventCard({ e, onAct }: { e: EventRow; onAct: (p: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const [goal, setGoal] = useState(String(e.goal_cents / 100))
  return (
    <div className="card space-y-2 text-sm" style={e.is_current ? { borderColor: 'var(--gold)' } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <b>{e.name}</b> {e.is_current && <span style={{ color: 'var(--gold)' }}>· en cours</span>}
          <div className="muted text-xs">
            {e.starts_on ?? 'sans date'} · {formatMoney(e.totalCents)} · {e.donationsCount} don{e.donationsCount > 1 ? 's' : ''}
          </div>
        </div>
        <button className="chip !px-3 text-sm" onClick={() => onAct({ action: 'setCurrent', eventId: e.is_current ? null : e.id }, e.is_current ? 'Aucun événement en cours.' : 'Événement en cours défini.')}>
          {e.is_current ? 'Arrêter' : 'Mettre en cours'}
        </button>
      </div>
      <div className="flex gap-2">
        <input className="field !py-2" inputMode="decimal" value={goal} onChange={ev => setGoal(ev.target.value.replace(/[^0-9.,]/g, ''))} aria-label="Objectif en dollars" />
        <button className="chip !px-4" onClick={() => onAct({ action: 'updateEvent', eventId: e.id, goalCents: toCents(goal) }, 'Objectif mis à jour.')}>
          Objectif
        </button>
      </div>
    </div>
  )
}

function NewEvent({ onSubmit }: { onSubmit: (p: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const [name, setName] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [goal, setGoal] = useState('')
  const [makeCurrent, setMakeCurrent] = useState(true)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (await onSubmit({ action: 'createEvent', name, startsOn, goalCents: toCents(goal), makeCurrent }, 'Événement créé.')) {
      setName('')
      setGoal('')
      setStartsOn('')
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <b className="text-sm">Nouvel événement</b>
      <input className="field" placeholder="Nom (ex. Portes ouvertes, fin de semaine 1)" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
      <div className="grid grid-cols-2 gap-2">
        <input className="field" type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} aria-label="Date" />
        <input className="field" inputMode="decimal" placeholder="Objectif en $" value={goal} onChange={e => setGoal(e.target.value.replace(/[^0-9.,]/g, ''))} />
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={makeCurrent} onChange={e => setMakeCurrent(e.target.checked)} />
        En faire l&apos;événement en cours
      </label>
      <button className="btn" disabled={name.trim().length < 2}>
        Créer
      </button>
    </form>
  )
}

// ── Journal des courriels (lecture seule) ─────────────────────────────────────
interface JournalRow {
  id: string
  created_at: string
  to_email: string
  kind: string
  status: string
  error: string | null
  subject: string
}
interface Journal {
  available: boolean
  counts: Record<string, number>
  rows: JournalRow[]
}
const KIND_LABEL: Record<string, string> = { receipt: 'Reçu de don', magic_link: 'Lien personnel', reminder: 'Rappel', moderation: 'Modération' }
// Un statut en langage courant ; `bad` = demande l'attention de l'équipe.
const STATUS_INFO: Record<string, { label: string; bad?: boolean; help?: string }> = {
  queued: { label: 'En attente' },
  sent: { label: 'Envoyé' },
  delivered: { label: 'Livré' },
  delayed: { label: 'Retardé', help: 'Le courriel tarde à arriver ; il sera retenté.' },
  bounced: { label: 'Adresse invalide', bad: true, help: "L'adresse n'existe pas ou refuse le courriel : le donateur ne le reçoit pas. Corrigez-la ou joignez-le autrement." },
  complained: { label: 'Signalé comme pourriel', bad: true, help: 'Le donateur a signalé le courriel : on ne lui en écrira plus.' },
  failed: { label: 'Échec', bad: true, help: "Le courriel n'a pas pu partir (service d'envoi indisponible ou mal configuré)." },
  skipped: { label: 'Non envoyé', help: "Le service d'envoi n'est pas configuré (développement)." },
}

function EmailJournal() {
  const [j, setJ] = useState<Journal | null>(null)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(false)
  const load = useCallback(() => {
    fetch('/api/admin/journal', { cache: 'no-store' })
      .then(r => (r.ok ? r.json().then(d => (setJ(d), setError(false))) : setError(true)))
      .catch(() => setError(true))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const problems = (j?.counts.bounced ?? 0) + (j?.counts.complained ?? 0) + (j?.counts.failed ?? 0)
  return (
    <div className="card text-sm">
      <div className="flex items-center justify-between gap-2">
        <b>Courriels envoyés</b>
        <button className="muted text-xs underline" onClick={load}>
          Actualiser
        </button>
      </div>
      {error && <p className="mt-2" style={{ color: '#f87171' }}>Impossible de lire le journal.</p>}
      {j && !j.available && <p className="muted mt-2">Le journal n&apos;est pas encore activé sur ce site (migration « journal-courriels » à appliquer).</p>}
      {j?.available && (
        <>
          <p className="muted mt-1">
            {Object.entries(j.counts)
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => `${n} ${(STATUS_INFO[k]?.label ?? k).toLowerCase()}`)
              .join(' · ') || 'Aucun courriel envoyé pour le moment.'}
          </p>
          {problems > 0 && (
            <p className="mt-2 font-semibold" style={{ color: '#f87171' }}>
              {problems} courriel{problems > 1 ? 's' : ''} à vérifier (en rouge ci-dessous).
            </p>
          )}
          {j.rows.length > 0 && (
            <>
              <button className="chip mt-3 !px-3 text-sm" aria-pressed={open} onClick={() => setOpen(!open)}>
                {open ? 'Masquer la liste' : `Voir les ${j.rows.length} derniers`}
              </button>
              {open && (
                <ul className="mt-3 space-y-2">
                  {j.rows.map(r => {
                    const st = STATUS_INFO[r.status] ?? { label: r.status }
                    return (
                      <li key={r.id} className="border-t pt-2" style={{ borderColor: 'var(--line)' }}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate">{r.to_email}</span>
                          <b className="shrink-0 text-xs" style={{ color: st.bad ? '#f87171' : undefined }}>
                            {st.label}
                          </b>
                        </div>
                        <div className="muted text-xs">
                          {KIND_LABEL[r.kind] ?? r.kind} · {time(r.created_at)}
                        </div>
                        {st.bad && st.help && <div className="mt-1 text-xs">{st.help}</div>}
                        {st.bad && r.error && <div className="muted mt-1 break-words text-xs">{r.error}</div>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

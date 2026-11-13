'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Mark } from '@/components/plateforme/Brand'
import { squareJpeg } from '@/lib/photoClient'
import type { Funnel, PlatformTotals, Stage, StudioOrg, TodoItem } from '@/lib/studio-stats'

// Section Studio (en français : usage interne de Studio Existence). Voir app/api/studio/route.ts.
// Piste C « Parcours » (validée par Mika le 12 nov. 2026) : « À traiter » d'abord, puis les organismes rangés par étape,
// une fiche par organisme ; les chiffres de la plateforme dans leur onglet. Des TOTAUX, jamais des personnes.
// Plus tard : passer à la piste A (tableau, une ligne par organisme) au-delà d'environ 8 organismes en ligne.

type Org = StudioOrg & { links: { vitrail: string; ecran: string; affiche: string } | null }
interface Data {
  me: { email: string; name: string }
  requests: { id: string; org_name: string; name: string; email: string; message: string | null; locale: 'fr' | 'en'; source: string | null; created_at: string }[]
  invitations: { id: string; email: string; orgName: string | null; createdAt: string; expiresAt: string; state: 'pending' | 'accepted' | 'expired' | 'revoked' }[]
  organizations: Org[]
  todo: TodoItem[]
  totals: PlatformTotals
  funnel: Funnel
  accounts: { total: number; active: number }
  windowDays: number
}

type Tab = 'parcours' | 'chiffres' | 'entretien'
const TABS: [Tab, string][] = [['parcours', 'Parcours'], ['chiffres', 'Chiffres'], ['entretien', 'Entretien']]

const AMBRE = '#F0B24A'
const JADE = '#1FA978'
const ROSE = '#F59AC5'
const VIOLET = '#A56BD9'

const day = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
const money = (c: number) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100)
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('fr-CA')} ${n > 1 ? many : one}`
const MISSING: Record<string, string> = { stripe: 'Stripe', juridique: 'les coordonnées juridiques' }
/** « Stripe et les coordonnées juridiques » (phrase) ; « Stripe, coordonnées juridiques » (court, pour les cartes). */
const missing = (b: string[], short = false) => (short ? b.map(k => (k === 'stripe' ? 'Stripe' : 'coordonnées juridiques')).join(', ') : b.map(k => MISSING[k] ?? k).join(' et '))

/** « il y a 3 jours », « hier », « aujourd’hui », « dans 2 jours ». */
function since(iso: string | null): string {
  if (!iso) return 'jamais'
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return 'aujourd’hui'
  if (d === 1) return 'hier'
  if (d === -1) return 'demain'
  return d > 0 ? `il y a ${d} jours` : `dans ${-d} jours`
}

const COLUMNS: { key: 'invite' | Stage; title: string; hint: string }[] = [
  { key: 'invite', title: 'Invité', hint: 'Lien envoyé, pas encore inscrit' },
  { key: 'pas-pret', title: 'Inscrit, pas prêt', hint: 'Il manque Stripe ou les coordonnées juridiques' },
  { key: 'pret', title: 'Prêt à lancer', hint: 'Peut « Mettre en ligne » depuis sa console' },
  { key: 'en-ligne', title: 'En ligne', hint: 'Reçoit de vrais dons' },
]

export default function StudioPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [form, setForm] = useState<{ email: string; orgName: string; message: string; locale: 'fr' | 'en'; requestId: string } | null>(null)
  const [tab, setTab] = useState<Tab>('parcours')
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/studio', { cache: 'no-store' })
    if (res.ok) setData(await res.json())
    else setMsg({ ok: false, text: ((await res.json().catch(() => ({}))) as { error?: string }).error || 'Erreur.' })
  }, [])
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace('#', '')
      setTab(TABS.some(([k]) => k === h) ? (h as Tab) : 'parcours')
    }
    read()
    window.addEventListener('hashchange', read)
    const id = setTimeout(() => void load(), 0)
    return () => {
      clearTimeout(id)
      window.removeEventListener('hashchange', read)
    }
  }, [load])

  const act = async (body: Record<string, unknown>, ok: string) => {
    const res = await fetch('/api/studio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const b = (await res.json().catch(() => ({}))) as { error?: string }
    setMsg(res.ok ? { ok: true, text: ok } : { ok: false, text: b.error || 'Erreur.' })
    if (res.ok) await load()
    return res.ok
  }

  const go = (t: Tab) => {
    window.history.replaceState(null, '', `#${t}`)
    setTab(t)
  }
  const blankForm = { email: '', orgName: '', message: '', locale: 'fr' as const, requestId: '' }
  const selected = data?.organizations.find(o => o.id === open) ?? null
  useEffect(() => {
    if (open) document.getElementById('fiche')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [open, tab])

  return (
    <main className="mx-auto max-w-[1180px] space-y-6 px-6 py-7 text-[15px]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Mark />
          <span className="rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider" style={{ color: VIOLET, borderColor: 'rgba(165,107,217,0.55)' }}>
            Studio
          </span>
        </div>
        <nav aria-label="Sections de Studio" className="flex items-center gap-1 rounded-full border p-1" style={{ borderColor: 'var(--line)' }}>
          {TABS.map(([k, label]) => (
            <button
              key={k}
              aria-current={tab === k ? 'page' : undefined}
              className="rounded-full px-4 py-1.5 text-sm font-semibold"
              style={tab === k ? { background: 'var(--text)', color: 'var(--bg)' } : { color: 'var(--muted)' }}
              onClick={() => go(k)}
            >
              {label}
              {k === 'parcours' && !!data?.todo.length && (
                <span className="ml-1.5 inline-block size-2 rounded-full align-middle" style={{ background: AMBRE }} aria-label={`${data.todo.length} à traiter`} />
              )}
            </button>
          ))}
        </nav>
        <div className="muted flex items-center gap-4">
          <span className="hidden md:inline">{data?.me.email}</span>
          <button
            className="btn btn-ghost !w-auto !rounded-full !px-4 !py-2 !text-sm"
            onClick={async () => {
              await fetch('/api/admin/login', { method: 'DELETE' })
              window.location.href = '/'
            }}
          >
            Se déconnecter
          </button>
        </div>
      </header>

      {msg && (
        <p role="status" className="card !p-3 text-sm" style={{ borderColor: msg.ok ? JADE : ROSE }}>
          {msg.text}
        </p>
      )}

      {tab === 'parcours' && (
        <>
          {form && <InviteForm form={form} setForm={setForm} act={act} />}

          <section className="card space-y-1 !py-4" style={{ borderColor: data?.todo.length ? 'rgba(240,178,74,0.45)' : undefined }}>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
              <h2 className="text-lg font-bold">
                À traiter {!!data?.todo.length && <span className="muted font-normal">· {data.todo.length}</span>}
              </h2>
              {!form && (
                <button className="btn btn-ghost !w-auto !rounded-full !px-4 !py-2 !text-sm" onClick={() => setForm(blankForm)}>
                  Inviter un organisme
                </button>
              )}
            </div>
            {!data && <p className="muted text-sm">Chargement…</p>}
            {data && !data.todo.length && <p className="muted text-sm">Rien à traiter : aucune demande en attente, aucun organisme bloqué.</p>}
            {data?.todo.map(t => (
              <TodoRow
                key={`${t.kind}-${'id' in t ? t.id : t.orgId}`}
                t={t}
                request={t.kind === 'demande' ? data.requests.find(r => r.id === t.id) : undefined}
                orgs={data.organizations}
                onInvite={r => setForm({ email: r.email, orgName: r.org_name, message: '', locale: r.locale, requestId: r.id })}
                onArchive={id => void act({ action: 'archive', requestId: id }, 'Demande classée.')}
                onResend={(id, email) => void act({ action: 'resend', invitationId: id }, `Nouveau lien envoyé à ${email}.`)}
                onOpen={setOpen}
              />
            ))}
          </section>

          {data && (
            <section aria-label="Organismes par étape" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {COLUMNS.map(c => {
                const invites = c.key === 'invite' ? data.invitations.filter(i => i.state === 'pending') : []
                const orgs = c.key === 'invite' ? [] : data.organizations.filter(o => o.stage === c.key)
                const count = invites.length + orgs.length
                return (
                  <div key={c.key} className="min-w-0 space-y-2.5">
                    <div>
                      <h3 className="flex items-baseline gap-2 font-bold">
                        {c.title} <span className="muted text-sm font-normal">{count}</span>
                      </h3>
                      <p className="muted text-[13px]">{c.hint}</p>
                    </div>
                    {!count && <div className="rounded-2xl border border-dashed px-4 py-5 text-center text-sm" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>Personne</div>}
                    {invites.map(i => (
                      <div key={i.id} className="card space-y-1.5 !p-4 text-sm">
                        <b className="block truncate">{i.orgName || i.email}</b>
                        {i.orgName && <span className="muted block truncate">{i.email}</span>}
                        <span className="block" style={{ color: new Date(i.expiresAt).getTime() - Date.now() < 3 * 86_400_000 ? AMBRE : 'var(--muted)' }}>
                          Expire {since(i.expiresAt)} · envoyée le {day(i.createdAt)}
                        </span>
                        <span className="flex gap-3 pt-0.5">
                          <button className="underline" onClick={() => void act({ action: 'resend', invitationId: i.id }, `Nouveau lien envoyé à ${i.email}.`)}>Renvoyer</button>
                          <button className="muted underline" onClick={() => confirm(`Annuler l’invitation de ${i.email} ?`) && void act({ action: 'revoke', invitationId: i.id }, 'Invitation annulée.')}>Annuler</button>
                        </span>
                      </div>
                    ))}
                    {orgs.map(o => (
                      <OrgCard key={o.id} o={o} active={open === o.id} onOpen={() => setOpen(open === o.id ? null : o.id)} />
                    ))}
                  </div>
                )
              })}
            </section>
          )}

          {selected && <OrgSheet o={selected} windowDays={data!.windowDays} onClose={() => setOpen(null)} />}

          {data && (
            <div className="muted flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-4 text-sm" style={{ borderColor: 'var(--line)' }}>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>Plateforme</span>
              <span>{plural(data.totals.donors, 'donateur', 'donateurs')}</span>
              <span>{money(data.totals.netCents)} nets</span>
              <span>{money(data.totals.feeCents)} de commission</span>
              <span>{plural(data.totals.disputesOpen, 'litige ouvert', 'litiges ouverts')}</span>
              <button className="ml-auto underline" onClick={() => go('chiffres')}>Tous les chiffres</button>
            </div>
          )}

          {data && <PastInvitations invitations={data.invitations} />}
        </>
      )}

      {tab === 'chiffres' && data && <Figures data={data} onOpen={id => { setOpen(id); go('parcours') }} />}

      {tab === 'entretien' && (
        <div className="max-w-[760px] space-y-7">
          <DemoCard />
          <PhotoMaintenance />
        </div>
      )}

      <p className="muted text-[13px]">
        Studio voit des totaux par organisme, jamais de donateur ni de don pris un par un. L’accès à la console d’un organisme se fait seulement sur son invitation d’équipe, retirée ensuite.
      </p>
    </main>
  )
}

function InviteForm({
  form,
  setForm,
  act,
}: {
  form: { email: string; orgName: string; message: string; locale: 'fr' | 'en'; requestId: string }
  setForm: (f: { email: string; orgName: string; message: string; locale: 'fr' | 'en'; requestId: string } | null) => void
  act: (body: Record<string, unknown>, ok: string) => Promise<boolean>
}) {
  return (
    <form
      className="card grid gap-4 md:grid-cols-2"
      onSubmit={async e => {
        e.preventDefault()
        if (await act({ action: 'invite', ...form }, `Invitation envoyée à ${form.email}.`)) setForm(null)
      }}
    >
      <div className="flex items-center justify-between md:col-span-2">
        <h2 className="text-lg font-bold">Inviter un organisme</h2>
        <button type="button" className="muted underline" onClick={() => setForm(null)}>Fermer</button>
      </div>
      <label className="flex flex-col gap-1.5">
        Courriel de la personne
        <input className="field" type="email" required autoFocus value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1.5">
        Organisme (facultatif)
        <input className="field" maxLength={120} value={form.orgName} onChange={e => setForm({ ...form, orgName: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1.5 md:col-span-2">
        Mot personnel (facultatif)
        <textarea className="field" rows={2} maxLength={1000} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
      </label>
      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="sr-only">Langue du courriel</legend>
        <span>Langue du courriel</span>
        {(['fr', 'en'] as const).map(l => (
          <label key={l} className="flex items-center gap-1.5">
            <input type="radio" name="langue" checked={form.locale === l} onChange={() => setForm({ ...form, locale: l })} />
            {l === 'fr' ? 'Français' : 'Anglais'}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {form.requestId && <span className="muted text-xs">Réponse à une demande : elle sera classée.</span>}
        <button className="btn !w-auto">Envoyer l’invitation</button>
      </div>
      <p className="muted text-[13px] md:col-span-2">Le lien vaut 14 jours. La personne pourra s’inscrire avec une autre adresse si elle le souhaite.</p>
    </form>
  )
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="mt-[7px] inline-block size-2 shrink-0 rounded-full" style={{ background: color }} />
}

function TodoRow({
  t,
  request,
  orgs,
  onInvite,
  onArchive,
  onResend,
  onOpen,
}: {
  t: TodoItem
  request?: Data['requests'][number]
  orgs: Org[]
  onInvite: (r: Data['requests'][number]) => void
  onArchive: (id: string) => void
  onResend: (id: string, label: string) => void
  onOpen: (id: string) => void
}) {
  const sourceName = (slug: string | null) => (slug ? orgs.find(o => o.slug === slug)?.name ?? slug : null)
  let color = AMBRE
  let body: ReactNode = null
  let actions: ReactNode = null
  switch (t.kind) {
    case 'demande': {
      const from = sourceName(t.source)
      body = (
        <>
          <b>Demande d’invitation</b> · {t.orgName}
          {request && <span className="muted"> · {request.name}, {request.email}</span>}
          <span className="muted"> · {from ? `via la signature de ${from}` : 'arrivée directe'}, le {day(t.createdAt)}</span>
          {request?.message && <span className="block italic" style={{ color: 'var(--lead)' }}>« {request.message} »</span>}
        </>
      )
      actions = request && (
        <>
          <button className="btn !w-auto !rounded-full !px-4 !py-1.5 !text-sm" onClick={() => onInvite(request)}>Inviter</button>
          <button className="muted underline" onClick={() => onArchive(t.id)}>Classer</button>
        </>
      )
      break
    }
    case 'litige':
      color = ROSE
      body = <><b>{t.name}</b> · {plural(t.count, 'litige ouvert', 'litiges ouverts')} : l’organisme répond depuis Stripe</>
      actions = <button className="underline" onClick={() => onOpen(t.orgId)}>Fiche</button>
      break
    case 'invitation':
      body = <><b>{t.label}</b> · l’invitation expire {since(t.expiresAt)}, sans inscription</>
      actions = <button className="underline" onClick={() => onResend(t.id, t.label)}>Renvoyer</button>
      break
    case 'pas-pret':
      body = <><b>{t.name}</b> · inscrit il y a {t.days} jours, toujours pas prêt : il manque {missing(t.blockers)}</>
      actions = <button className="underline" onClick={() => onOpen(t.orgId)}>Fiche</button>
      break
    case 'courriels':
      color = ROSE
      body = (
        <>
          <b>{t.name}</b> · {[t.bounces ? plural(t.bounces, 'courriel rebondi', 'courriels rebondis') : '', t.complaints ? plural(t.complaints, 'plainte', 'plaintes') : ''].filter(Boolean).join(' et ')} en 30 jours
        </>
      )
      actions = <button className="underline" onClick={() => onOpen(t.orgId)}>Fiche</button>
      break
  }
  return (
    <div className="flex flex-wrap items-start gap-3 border-t py-2.5 text-sm first-of-type:border-t-0" style={{ borderColor: 'var(--line)' }}>
      <Dot color={color} />
      <span className="min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-0">{body}</span>
      <span className="flex items-center gap-3 pl-5 sm:pl-0">{actions}</span>
    </div>
  )
}

function Meter({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(244,239,230,0.1)' }}>
      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
    </span>
  )
}

const STAGE_COLOR: Record<Stage, string> = { 'pas-pret': AMBRE, pret: JADE, 'en-ligne': JADE, suspendu: ROSE }

function OrgCard({ o, active, onOpen }: { o: Org; active: boolean; onOpen: () => void }) {
  return (
    <button
      className="card block w-full space-y-2 !p-4 text-left text-sm"
      aria-expanded={active}
      style={active ? { borderColor: STAGE_COLOR[o.stage] } : undefined}
      onClick={onOpen}
    >
      <b className="block truncate text-[15px]">{o.name}</b>
      {o.stage === 'pas-pret' && <span className="block" style={{ color: AMBRE }}>Manque : {missing(o.blockers, true)}</span>}
      {o.stage === 'pret' && <span className="block" style={{ color: JADE }}>Tout est prêt</span>}
      {o.stage === 'suspendu' && <span className="block" style={{ color: ROSE }}>Suspendu</span>}
      {o.stats.donors > 0 || o.stage === 'en-ligne' ? (
        <>
          <span className="flex justify-between gap-2">
            <span>{o.stats.donors} sur 100</span>
            <span className="muted">{money(o.stats.netCents)}</span>
          </span>
          <Meter value={o.stats.donors} max={100} color={STAGE_COLOR[o.stage]} />
        </>
      ) : (
        <span className="muted block">Inscrit le {day(o.createdAt)}</span>
      )}
    </button>
  )
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="muted text-[13px]">{label}</div>
      <div className="text-xl" style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
      {sub && <div className="muted text-[13px]">{sub}</div>}
    </div>
  )
}

/** Fiche d'un organisme : des totaux seulement (jamais un donateur ni un don pris un par un). */
function OrgSheet({ o, windowDays, onClose }: { o: Org; windowDays: number; onClose: () => void }) {
  const s = o.stats
  const status = o.stage === 'en-ligne' ? `En ligne depuis le ${day(o.wentLiveAt ?? o.createdAt)}` : o.stage === 'pret' ? 'Brouillon, prêt à lancer' : o.stage === 'suspendu' ? 'Suspendu' : `Brouillon : il manque ${missing(o.blockers)}`
  return (
    <section id="fiche" className="card scroll-mt-6" aria-label={`Fiche de ${o.name}`} style={{ borderColor: STAGE_COLOR[o.stage] }}>
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{o.name}</h2>
            <p className="muted text-sm">
              {o.slug} · <span style={{ color: STAGE_COLOR[o.stage] }}>{status}</span> · inscrit le {day(o.createdAt)}
            </p>
            {o.links && (
              <p className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
                <a className="underline" href={o.links.vitrail} target="_blank" rel="noreferrer">Vitrail</a>
                <a className="underline" href={o.links.ecran} target="_blank" rel="noreferrer">Écran</a>
                <a className="underline" href={o.links.affiche} target="_blank" rel="noreferrer">Affiche</a>
              </p>
            )}
          </div>
          <button className="muted underline" onClick={onClose}>Fermer</button>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span>{plural(s.donors, 'donateur', 'donateurs')} sur 100 gratuits</span>
            <span className="muted">+{s.donorsSince} en {windowDays} jours</span>
          </div>
          <Meter value={s.donors} max={100} color={STAGE_COLOR[o.stage]} />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Stat label="Dons nets" value={money(s.netCents)} sub={s.offlineNetCents ? `dont ${money(s.offlineNetCents)} hors Stripe` : 'après remboursements'} />
          <Stat label="Dons" value={s.donations.toLocaleString('fr-CA')} sub={s.donations ? `moyenne ${money(Math.round(s.netCents / s.donations))}` : '—'} />
          <Stat label="Commission nette" value={money(s.feeCents)} sub={`${money(s.feeSinceCents)} en ${windowDays} jours`} />
          <Stat label="Litiges ouverts" value={<span style={{ color: s.disputesOpen ? ROSE : undefined }}>{s.disputesOpen}</span>} />
          <Stat label="Équipe" value={s.owners + s.volunteers} sub={`${plural(s.owners, 'propriétaire', 'propriétaires')}, ${plural(s.volunteers, 'bénévole', 'bénévoles')}`} />
          <Stat label="Dernier don" value={<span className="text-base">{since(s.lastDonationAt)}</span>} />
          <Stat label="Dernière connexion" value={<span className="text-base">{since(s.lastLoginAt)}</span>} sub="d’un membre de l’équipe" />
          <Stat
            label="Courriels"
            value={<span style={{ color: s.bouncesSince || s.complaintsSince ? ROSE : undefined }}>{s.bounces + s.complaints}</span>}
            sub={`${plural(s.bounces, 'rebond', 'rebonds')}, ${plural(s.complaints, 'plainte', 'plaintes')}`}
          />
        </div>
      </div>
    </section>
  )
}

function PastInvitations({ invitations }: { invitations: Data['invitations'] }) {
  const past = invitations.filter(i => i.state !== 'pending')
  if (!past.length) return null
  const label = { accepted: ['Inscrit', JADE], expired: ['Expirée', 'var(--muted)'], revoked: ['Annulée', 'var(--muted)'], pending: ['', ''] } as const
  return (
    <details className="text-sm">
      <summary className="muted cursor-pointer">Invitations passées ({past.length})</summary>
      <ul className="card mt-2 !p-0">
        {past.map((i, n) => (
          <li key={i.id} className={`flex flex-wrap justify-between gap-3 px-5 py-2.5 ${n ? 'border-t' : ''}`} style={{ borderColor: 'var(--line)' }}>
            <span>
              {i.email} {i.orgName && <span className="muted">· {i.orgName}</span>}
            </span>
            <span className="muted">
              {day(i.createdAt)} · <span style={{ color: label[i.state][1] }}>{label[i.state][0]}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Onglet Chiffres : la plateforme (total et fenêtre), le parcours avec provenance, puis une ligne par organisme. */
function Figures({ data, onOpen }: { data: Data; onOpen: (id: string) => void }) {
  const t = data.totals
  const w = data.windowDays
  const rows: [string, ReactNode, ReactNode][] = [
    ['Donateurs', t.donors.toLocaleString('fr-CA'), `+${t.donorsSince}`],
    ['Dons', t.donations.toLocaleString('fr-CA'), t.donationsSince.toLocaleString('fr-CA')],
    ['Montant net', money(t.netCents), money(t.netSinceCents)],
    ['dont hors Stripe (comptant, amorçage)', money(t.offlineNetCents), '—'],
    ['Commission nette', money(t.feeCents), money(t.feeSinceCents)],
    ['Litiges ouverts', t.disputesOpen, '—'],
    ['Courriels rebondis', t.bounces, t.bouncesSince],
    ['Plaintes', t.complaints, t.complaintsSince],
  ]
  const f = data.funnel
  const steps: [string, { total: number; since: number }][] = [
    ['Demandes', f.requests],
    ['Invitations', f.invitations],
    ['Inscriptions', f.signups],
    ['Prêts à lancer', f.ready],
    ['En ligne', f.live],
  ]
  const sorted = useMemo(() => [...data.organizations].sort((a, b) => b.stats.netCents - a.stats.netCents || a.name.localeCompare(b.name)), [data.organizations])
  const sourceName = (slug: string) => (slug === 'direct' ? 'Arrivée directe' : `Signature de ${data.organizations.find(o => o.slug === slug)?.name ?? slug}`)
  return (
    <div className="space-y-7">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card !p-4">
          <Stat
            label="Organismes"
            value={data.organizations.length}
            sub={[`${t.orgsByStatus['en-ligne']} en ligne`, plural(t.orgsByStatus.pret, 'prêt', 'prêts'), plural(t.orgsByStatus['pas-pret'], 'pas prêt', 'pas prêts'), t.orgsByStatus.suspendu ? plural(t.orgsByStatus.suspendu, 'suspendu', 'suspendus') : ''].filter(Boolean).join(' · ')}
          />
        </div>
        <div className="card !p-4">
          <Stat label="Comptes" value={data.accounts.total} sub={`${data.accounts.active} actifs en ${w} jours`} />
        </div>
        <div className="card !p-4">
          <Stat label="Membres des équipes" value={t.owners + t.volunteers} sub={`${plural(t.owners, 'propriétaire', 'propriétaires')}, ${plural(t.volunteers, 'bénévole', 'bénévoles')}`} />
        </div>
        <div className="card !p-4">
          <Stat label="Commission nette" value={money(t.feeCents)} sub={`${money(t.feeSinceCents)} en ${w} jours`} />
        </div>
      </section>

      <div className="grid items-start gap-7 lg:grid-cols-2">
        <section className="space-y-2.5">
          <h2 className="text-lg font-bold">Dons et courriels</h2>
          <div className="card overflow-hidden !p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="muted text-[13px]">
                <th className="px-5 py-3 font-medium" />
                <th className="px-5 py-3 text-right font-medium">Total</th>
                <th className="whitespace-nowrap px-5 py-3 text-right font-medium">{w} derniers jours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, a, b]) => (
                <tr key={label} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className={`px-5 py-2.5 ${label.startsWith('dont') ? 'muted pl-8' : ''}`}>{label}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{a}</td>
                  <td className="muted px-5 py-2.5 text-right tabular-nums">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="muted text-[13px]">Démo et ateliers exclus ; dons de démonstration exclus. Un même courriel chez deux organismes compte deux fois.</p>
        </section>

        <section className="space-y-2.5">
          <h2 className="text-lg font-bold">Parcours</h2>
          <ol className="card space-y-2 text-sm">
            {steps.map(([label, s], n) => (
              <li key={label} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4">
                <span className="space-y-1">
                  <span className="block">{label}</span>
                  <Meter value={s.total} max={Math.max(1, steps[0][1].total, ...steps.map(x => x[1].total))} color={n === steps.length - 1 ? JADE : AMBRE} />
                </span>
                <span className="w-10 text-right tabular-nums">{s.total}</span>
                <span className="muted w-20 text-right tabular-nums">+{s.since} en {w} j</span>
              </li>
            ))}
          </ol>
          {!!f.sources.length && (
            <ul className="card !p-0 text-sm">
              {f.sources.map((s, n) => (
                <li key={s.source} className={`flex justify-between gap-3 px-5 py-2.5 ${n ? 'border-t' : ''}`} style={{ borderColor: 'var(--line)' }}>
                  <span>{sourceName(s.source)}</span>
                  <span className="muted tabular-nums">
                    {plural(s.total, 'demande', 'demandes')} · +{s.since} en {w} j
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {!!sorted.length && (
        <section className="space-y-2.5">
          <h2 className="text-lg font-bold">Par organisme</h2>
          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="muted text-[13px]">
                  {['Organisme', 'Étape', 'Donateurs', 'Dons nets', 'Commission', 'Litiges', 'Dernier don'].map(h => (
                    <th key={h} className="whitespace-nowrap px-5 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(o => (
                  <tr key={o.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                    <td className="px-5 py-2.5">
                      <button className="text-left underline" onClick={() => onOpen(o.id)}>{o.name}</button>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5" style={{ color: STAGE_COLOR[o.stage] }}>{COLUMNS.find(c => c.key === o.stage)?.title ?? 'Suspendu'}</td>
                    <td className="px-5 py-2.5 tabular-nums">{o.stats.donors} / 100</td>
                    <td className="px-5 py-2.5 tabular-nums">{money(o.stats.netCents)}</td>
                    <td className="px-5 py-2.5 tabular-nums">{money(o.stats.feeCents)}</td>
                    <td className="px-5 py-2.5 tabular-nums" style={{ color: o.stats.disputesOpen ? ROSE : undefined }}>{o.stats.disputesOpen}</td>
                    <td className="muted whitespace-nowrap px-5 py-2.5">{since(o.stats.lastDonationAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

interface PhotoReport { apply: boolean; legacyDonors: number; moved: number; missing: number; orphans: number; orphansOld: number; removed: number; errors: string[] }

/** Entretien : ranger les anciennes photos u/ dans le dossier de leur organisme (étape A). Seulement des nombres. */
function PhotoMaintenance() {
  const [r, setR] = useState<PhotoReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const call = useCallback(async (init?: RequestInit) => {
    setBusy(true)
    const res = await fetch('/api/studio/photos', { cache: 'no-store', ...init })
    const b = (await res.json().catch(() => ({}))) as PhotoReport & { error?: string }
    if (res.ok) { setR(b); setError(null) } else setError(b.error || 'Erreur.')
    setBusy(false)
  }, [])
  useEffect(() => {
    const id = setTimeout(() => void call(), 0)
    return () => clearTimeout(id)
  }, [call])
  if (!r && !error) return null
  const todo = !!r && (r.legacyDonors > 0 || r.orphansOld > 0)
  return (
    <section className="space-y-2.5">
      <h2 className="text-lg font-bold">Photos des donateurs</h2>
      <div className="card space-y-3 text-sm">
        {error && <p style={{ color: '#F58FA3' }}>{error}</p>}
        {r && (
          <>
            <p>
              {r.apply ? 'Passage terminé : ' : ''}
              {r.apply ? `${r.moved} fiche(s) rangée(s), ${r.removed} ancien(s) fichier(s) effacé(s).` : todo ? `${r.legacyDonors} fiche(s) à ranger dans le dossier de leur organisme ; ${r.orphans} ancien(s) fichier(s) cité(s) par aucune fiche, dont ${r.orphansOld} de plus de 24 h.` : 'Tout est rangé par organisme.'}
            </p>
            {r.missing > 0 && <p style={{ color: '#F58FA3' }}>{r.missing} fiche(s) citent un fichier absent : laissées telles quelles.</p>}
            {r.errors.length > 0 && (
              <ul className="muted list-disc pl-5 text-xs">
                {r.errors.slice(0, 20).map(e => <li key={e}>{e}</li>)}
              </ul>
            )}
            {todo && !r.apply && (
              <div className="flex flex-wrap gap-2">
                <button className="btn !w-auto" disabled={busy} onClick={() => confirm('Ranger les photos ? Les fichiers sont copiés dans le dossier de leur organisme, puis les anciens effacés.') && void call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purgeOrphans: false }) })}>
                  Ranger les photos
                </button>
                {r.orphansOld > 0 && (
                  <button className="btn btn-ghost !w-auto" disabled={busy} onClick={() => confirm(`Ranger les photos ET effacer ${r.orphansOld} photo(s) envoyée(s) sans don ? C’est définitif.`) && void call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purgeOrphans: true }) })}>
                    Ranger et effacer les photos sans don
                  </button>
                )}
              </div>
            )}
            {r.apply && <button className="btn btn-ghost !w-auto" disabled={busy} onClick={() => void call()}>Vérifier de nouveau</button>}
          </>
        )}
      </div>
    </section>
  )
}

interface DemoData {
  exists: boolean
  donors: number
  totalCents: number
  photos: number
  namedWithoutPhoto: number
  links: { vitrail: string; ecran: string; screen: string } | null
}

/** Vitrail de démonstration : (re)générer les donateurs fictifs, ajouter des photos (attribuées au hasard), les retirer. */
function DemoCard() {
  const [d, setD] = useState<DemoData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const call = useCallback(async (init?: RequestInit) => {
    const res = await fetch('/api/studio/demo', { cache: 'no-store', ...init })
    const b = (await res.json().catch(() => ({}))) as DemoData & { error?: string }
    if (res.ok) { setD(b); setError(null) } else setError(b.error || 'Erreur.')
  }, [])
  useEffect(() => {
    const id = setTimeout(() => void call(), 0)
    return () => clearTimeout(id)
  }, [call])
  const post = async (action: string, label: string) => {
    setBusy(label)
    await call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    setBusy(null)
  }
  const upload = async (files: FileList) => {
    let done = 0
    let failed = 0
    for (const f of Array.from(files)) {
      setBusy(`Photos : ${done + failed + 1} sur ${files.length}…`)
      try {
        const blob = await squareJpeg(f)
        const res = await fetch('/api/studio/demo/photo', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
        if (res.ok) done++
        else {
          failed++
          const b = (await res.json().catch(() => ({}))) as { error?: string }
          if (res.status === 409) { setError(b.error || 'Plus de morceau libre.'); break }
        }
      } catch {
        failed++
      }
    }
    setBusy(null)
    await call()
    if (failed) setError(`${done} photo(s) ajoutée(s), ${failed} refusée(s).`)
  }
  const money = (c: number) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(c / 100)
  return (
    <section className="space-y-2.5">
      <h2 className="text-lg font-bold">Vitrail de démonstration</h2>
      <div className="card space-y-3 text-sm">
        <p className="muted">Centre communautaire du Village : organisme fictif, en lecture seule (aucun don, aucun signalement). Les textes et les noms sont dans lib/demo-data.ts.</p>
        {error && <p style={{ color: '#F58FA3' }}>{error}</p>}
        {d && !d.exists && <p>La démo n’existe pas encore sur cette base.</p>}
        {d?.exists && (
          <>
            <p>
              <b>{d.donors}</b> donateurs fictifs · <b>{money(d.totalCents)}</b> · <b>{d.photos}</b> photo(s), {d.namedWithoutPhoto} morceau(x) nommé(s) sans photo
            </p>
            {d.links && (
              <p className="flex flex-wrap gap-x-4 gap-y-1">
                <a className="underline" href={d.links.vitrail} target="_blank" rel="noreferrer">Vitrail</a>
                <a className="underline" href={d.links.ecran} target="_blank" rel="noreferrer">Écran (FR)</a>
                <a className="underline" href={d.links.screen} target="_blank" rel="noreferrer">Écran (EN)</a>
              </p>
            )}
          </>
        )}
        {busy && <p role="status">{busy}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            className="btn !w-auto"
            disabled={!!busy || !d}
            onClick={() => (!d?.exists || confirm('Régénérer les donateurs ? Les dates sont replacées à aujourd’hui ; les photos sont gardées et redistribuées.')) && void post('generate', 'Génération…')}
          >
            {d?.exists ? 'Régénérer les donateurs' : 'Créer la démo'}
          </button>
          {d?.exists && (
            <label className="btn btn-ghost !w-auto cursor-pointer">
              Ajouter des photos…
              <input type="file" accept="image/*" multiple className="sr-only" disabled={!!busy} onChange={e => { if (e.target.files?.length) void upload(e.target.files); e.target.value = '' }} />
            </label>
          )}
          {!!d?.photos && (
            <button className="btn btn-ghost !w-auto" disabled={!!busy} onClick={() => confirm(`Retirer les ${d.photos} photo(s) de la démo ? Les fichiers sont effacés.`) && void post('removePhotos', 'Retrait…')}>
              Retirer les photos
            </button>
          )}
        </div>
        <p className="muted text-xs">Des photos que Studio a le droit de montrer (vos propres photos, avec consentement) ; jamais de banque d’images de visages.</p>
      </div>
    </section>
  )
}

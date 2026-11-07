'use client'

import { useCallback, useEffect, useState } from 'react'
import { Mark } from '@/components/plateforme/Brand'

// Section Studio (en français : usage interne de Studio Existence). Voir app/api/studio/route.ts.

interface Data {
  me: { email: string; name: string }
  requests: { id: string; org_name: string; name: string; email: string; message: string | null; locale: 'fr' | 'en'; created_at: string }[]
  invitations: { id: string; email: string; orgName: string | null; createdAt: string; expiresAt: string; state: 'pending' | 'accepted' | 'expired' | 'revoked' }[]
  organizations: { id: string; name: string; slug: string; status: 'draft' | 'live' | 'suspended'; stripeReady: boolean; createdAt: string }[]
}

const day = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
const STATE: Record<Data['invitations'][number]['state'], [string, string]> = {
  pending: ['En attente', 'var(--gold)'],
  accepted: ['Inscrit', '#3DB5A6'],
  expired: ['Expirée', 'var(--muted)'],
  revoked: ['Annulée', 'var(--muted)'],
}

export default function StudioPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [form, setForm] = useState({ email: '', orgName: '', message: '', locale: 'fr' as 'fr' | 'en', requestId: '' })

  const load = useCallback(async () => {
    const res = await fetch('/api/studio', { cache: 'no-store' })
    if (res.ok) setData(await res.json())
    else setMsg({ ok: false, text: ((await res.json().catch(() => ({}))) as { error?: string }).error || 'Erreur.' })
  }, [])
  useEffect(() => {
    const id = setTimeout(() => void load(), 0)
    return () => clearTimeout(id)
  }, [load])

  const act = async (body: Record<string, unknown>, ok: string) => {
    const res = await fetch('/api/studio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const b = (await res.json().catch(() => ({}))) as { error?: string }
    setMsg(res.ok ? { ok: true, text: ok } : { ok: false, text: b.error || 'Erreur.' })
    if (res.ok) await load()
    return res.ok
  }

  return (
    <main className="mx-auto max-w-[1180px] space-y-7 px-6 py-7 text-[15px]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Mark />
          <span className="rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider" style={{ color: '#A56BD9', borderColor: 'rgba(165,107,217,0.55)' }}>
            Studio
          </span>
        </div>
        <div className="muted flex items-center gap-4">
          <span>{data?.me.email}</span>
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
        <p role="status" className="card !p-3 text-sm" style={{ borderColor: msg.ok ? '#3DB5A6' : '#F58FA3' }}>
          {msg.text}
        </p>
      )}

      <div className="grid items-start gap-7 lg:grid-cols-[380px_minmax(0,1fr)]">
        <form
          className="card space-y-3.5"
          onSubmit={async e => {
            e.preventDefault()
            const ok = await act({ action: 'invite', ...form }, `Invitation envoyée à ${form.email}.`)
            if (ok) setForm({ email: '', orgName: '', message: '', locale: 'fr', requestId: '' })
          }}
        >
          <h2 className="text-lg font-bold">Inviter un organisme</h2>
          <label className="flex flex-col gap-1.5">
            Courriel de la personne
            <input className="field" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            Organisme (facultatif)
            <input className="field" maxLength={120} value={form.orgName} onChange={e => setForm({ ...form, orgName: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5">
            Mot personnel (facultatif)
            <textarea className="field" rows={3} maxLength={1000} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
          </label>
          <fieldset className="flex gap-4">
            <legend className="mb-1.5">Langue du courriel</legend>
            {(['fr', 'en'] as const).map(l => (
              <label key={l} className="flex items-center gap-1.5">
                <input type="radio" name="langue" checked={form.locale === l} onChange={() => setForm({ ...form, locale: l })} />
                {l === 'fr' ? 'Français' : 'Anglais'}
              </label>
            ))}
          </fieldset>
          {form.requestId && <p className="muted text-xs">Réponse à une demande reçue : elle sera classée.</p>}
          <button className="btn">Envoyer l’invitation</button>
          <p className="muted text-[13px]">Le lien vaut 14 jours. La personne pourra s’inscrire avec une autre adresse si elle le souhaite.</p>
        </form>

        <div className="min-w-0 space-y-7">
          <section className="space-y-2.5">
            <h2 className="flex items-center gap-2.5 text-lg font-bold">
              Demandes reçues
              {!!data?.requests.length && (
                <span className="rounded-full px-2 text-xs font-bold" style={{ background: 'var(--gold)', color: 'var(--on-accent)' }}>
                  {data.requests.length}
                </span>
              )}
            </h2>
            {data && data.requests.length === 0 && <p className="card muted text-sm">Aucune demande en attente.</p>}
            {!!data?.requests.length && (
              <ul className="card !p-0">
                {data.requests.map((r, i) => (
                  <li key={r.id} className={`flex flex-wrap items-center gap-4 px-5 py-4 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--line)' }}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <b>{r.org_name}</b>
                      <span className="muted">
                        {r.name} · {r.email} · {day(r.created_at)} · {r.locale.toUpperCase()}
                      </span>
                      {r.message && <span className="italic" style={{ color: '#D9D3E3' }}>« {r.message} »</span>}
                    </span>
                    <button className="btn !w-auto !rounded-full !px-4 !py-2 !text-sm" onClick={() => setForm({ email: r.email, orgName: r.org_name, message: '', locale: r.locale, requestId: r.id })}>
                      Inviter
                    </button>
                    <button className="btn btn-ghost !w-auto !rounded-full !px-4 !py-2 !text-sm" onClick={() => void act({ action: 'archive', requestId: r.id }, 'Demande classée.')}>
                      Classer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2.5">
            <h2 className="text-lg font-bold">Invitations envoyées</h2>
            {data && data.invitations.length === 0 && <p className="card muted text-sm">Aucune invitation pour l’instant.</p>}
            {!!data?.invitations.length && (
              <div className="card overflow-x-auto !p-0">
                <table className="w-full text-left">
                  <thead>
                    <tr className="muted text-[13px]">
                      <th className="px-5 py-3 font-medium">Courriel</th>
                      <th className="px-5 py-3 font-medium">Organisme</th>
                      <th className="px-5 py-3 font-medium">Envoyée</th>
                      <th className="px-5 py-3 font-medium">État</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.invitations.map(i => (
                      <tr key={i.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                        <td className="px-5 py-3.5">{i.email}</td>
                        <td className="muted px-5 py-3.5">{i.orgName ?? '—'}</td>
                        <td className="muted px-5 py-3.5">{day(i.createdAt)}</td>
                        <td className="px-5 py-3.5" style={{ color: STATE[i.state][1] }}>
                          {STATE[i.state][0]}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right">
                          {i.state !== 'accepted' && (
                            <button className="underline" onClick={() => void act({ action: 'resend', invitationId: i.id }, `Nouveau lien envoyé à ${i.email}.`)}>
                              Renvoyer
                            </button>
                          )}
                          {i.state === 'pending' && (
                            <>
                              {' · '}
                              <button className="underline" onClick={() => void act({ action: 'revoke', invitationId: i.id }, 'Invitation annulée.')}>
                                Annuler
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2.5">
            <h2 className="text-lg font-bold">Organismes</h2>
            {!!data?.organizations.length && (
              <ul className="card !p-0">
                {data.organizations.map((o, i) => (
                  <li key={o.id} className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 ${i ? 'border-t' : ''}`} style={{ borderColor: 'var(--line)' }}>
                    <span>
                      <b>{o.name}</b> <span className="muted">· {o.slug}</span>
                    </span>
                    <span className="muted text-sm">
                      {o.status === 'live' ? 'En ligne' : o.status === 'draft' ? 'Pas encore en ligne' : 'Suspendu'} · Stripe {o.stripeReady ? 'prêt' : 'à connecter'} · depuis le {day(o.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="muted text-[13px]">Cette section ne montre jamais de donateurs ni de dons : l’accès à la console d’un organisme se fait seulement sur son invitation.</p>
        </div>
      </div>
    </main>
  )
}

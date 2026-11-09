'use client'

import { useCallback, useEffect, useState } from 'react'
import { Mark } from '@/components/plateforme/Brand'
import { squareJpeg } from '@/lib/photoClient'

// Section Studio (en français : usage interne de Studio Existence). Voir app/api/studio/route.ts.

interface Data {
  me: { email: string; name: string }
  requests: { id: string; org_name: string; name: string; email: string; message: string | null; locale: 'fr' | 'en'; created_at: string }[]
  invitations: { id: string; email: string; orgName: string | null; createdAt: string; expiresAt: string; state: 'pending' | 'accepted' | 'expired' | 'revoked' }[]
  organizations: { id: string; name: string; slug: string; status: 'draft' | 'live' | 'suspended'; showcase: boolean; stripeReady: boolean; createdAt: string }[]
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
                      {o.showcase ? 'Démonstration (fictive, sans dons)' : <>{o.status === 'live' ? 'En ligne' : o.status === 'draft' ? 'Pas encore en ligne' : 'Suspendu'} · Stripe {o.stripeReady ? 'prêt' : 'à connecter'}</>} · depuis le {day(o.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <DemoCard />

          <PhotoMaintenance />

          <p className="muted text-[13px]">Cette section ne montre jamais de donateurs ni de dons : l’accès à la console d’un organisme se fait seulement sur son invitation.</p>
        </div>
      </div>
    </main>
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
        <p className="muted">Fondation Pleine Lumière : organisme fictif, en lecture seule (aucun don, aucun signalement). Les textes et les noms sont dans lib/demo-data.ts.</p>
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

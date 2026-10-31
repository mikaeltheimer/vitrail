'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CONFIG, GLASS_COLORS } from '@/lib/config'
import DonationPreview from '@/components/DonationPreview'
import PhotoField, { type PhotoValue } from '@/components/PhotoField'
import { defaultColorFor } from '@/lib/colors'
import { formatMoney } from '@/lib/format'
import type { Snapshot } from '@/lib/types'

// Parcours de don sur téléphone : montant, courriel, (facultatif) nom affiché → paiement.
// Avec un lien magique (?t=…), le donateur est reconnu : il n'a qu'à choisir un montant pour agrandir son morceau.

interface KnownDonor {
  donorId: string
  name: string
  showName: boolean
  color: string
  totalCents: number
}

export default function DonPage() {
  return (
    <Suspense fallback={null}>
      <DonForm />
    </Suspense>
  )
}

function DonForm() {
  const params = useSearchParams()
  const tokenParam = params.get('t')
  const cancelled = !!params.get('annule')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [amount, setAmount] = useState<number | null>(CONFIG.suggestedCents[1])
  const [custom, setCustom] = useState('')
  const [email, setEmail] = useState('')
  const [showName, setShowName] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  // Sans choix du donateur, le serveur attribue une couleur à partir du courriel
  const [color, setColor] = useState<string | null>(null)
  const [photo, setPhoto] = useState<PhotoValue>({ src: null, path: null })
  const [photoBusy, setPhotoBusy] = useState(false)
  const [known, setKnown] = useState<KnownDonor | null>(null)
  const [linkExpired, setLinkExpired] = useState(false)
  const token = linkExpired ? null : tokenParam
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicOpen, setMagicOpen] = useState(false)
  const [magicEmail, setMagicEmail] = useState('')
  const [magicSent, setMagicSent] = useState(false)

  useEffect(() => {
    if (!tokenParam) return
    fetch('/api/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tokenParam }) })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setKnown({ donorId: d.donorId, name: d.name, showName: d.showName, color: d.color, totalCents: d.totalCents }))
      .catch(() => setLinkExpired(true))
  }, [tokenParam])

  useEffect(() => {
    let stop = false
    const load = () =>
      fetch('/api/vitrail', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(s => !stop && s && setSnap(s))
        .catch(() => {})
    void load()
    const id = setInterval(load, 10_000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [])

  const amountCents = useMemo(() => {
    if (custom.trim()) {
      const n = parseFloat(custom.replace(',', '.'))
      return Number.isFinite(n) ? Math.round(n * 100) : 0
    }
    return amount ?? 0
  }, [amount, custom])

  const tooLow = amountCents > 0 && amountCents < CONFIG.minAmountCents
  const mode = snap?.mode
  const event = snap?.event ?? null
  const goalPct = event && event.goalCents > 0 ? Math.min(100, Math.round((event.totalCents / event.goalCents) * 100)) : 0
  const canSubmit = !busy && !photoBusy && mode !== 'off' && amountCents >= CONFIG.minAmountCents && (token || email.includes('@')) && (!showName || name.trim().length >= 2)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token ? { token, amountCents } : { email, amountCents, showName, name, message, color: color ?? undefined, photoPath: showName ? photo.path ?? undefined : undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur inattendue.')
      window.location.href = data.url
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  async function sendMagic(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/magic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: magicEmail }) }).catch(() => {})
    setMagicSent(true)
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
      {mode === 'demo' && (
        <div className="mb-4 rounded-xl px-3 py-2 text-center text-sm font-bold" style={{ background: 'var(--gold)', color: '#1b1405' }}>
          MODE DÉMO — aucun paiement réel
        </div>
      )}

      <header className="mb-5 text-center">
        <div
          aria-hidden
          className="mx-auto mb-3 h-14 w-14 rounded-full"
          style={{
            background: 'conic-gradient(#f472b6, #d946ef, #7c3aed, #60a5fa, #22d3ee, #16a34a, #a3e635, #facc15, #fb923c, #f87171, #f472b6)',
            boxShadow: '0 0 0 3px #050408, 0 0 30px rgba(244,114,182,.35)',
          }}
        />
        <p className="muted text-xs uppercase tracking-[0.2em]">{CONFIG.orgName}</p>
        <h1 className="mt-1 text-3xl font-bold">{CONFIG.appName}</h1>
        <p className="muted mt-2 text-[0.95rem]">Donnez, et votre morceau de verre s&apos;ajoute au vitrail de l&apos;école.</p>
      </header>

      {event && event.goalCents > 0 && (
        <section className="card mb-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="muted">{event.name}</span>
            <span>
              <b>{formatMoney(event.totalCents)}</b> <span className="muted">sur {formatMoney(event.goalCents)}</span>
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <div className="h-full rounded-full" style={{ width: `${goalPct}%`, background: 'linear-gradient(90deg,#f472b6,#facc15)' }} />
          </div>
        </section>
      )}

      {cancelled && <p className="card mb-5 text-sm">Le paiement a été annulé. Rien n&apos;a été prélevé.</p>}
      {linkExpired && <p className="card mb-5 text-sm">Ce lien a expiré. Donnez normalement ci-dessous, ou demandez un nouveau lien tout en bas.</p>}
      {mode === 'off' && <p className="card mb-5 text-sm">Les dons en ligne ne sont pas encore ouverts. Revenez bientôt!</p>}

      <form onSubmit={submit} className="space-y-5">
        {known && (
          <section className="card flex items-center gap-3">
            <span className="h-10 w-10 shrink-0 rounded-full" style={{ background: known.color, boxShadow: '0 0 0 2px #050408' }} />
            <div className="text-sm">
              <b>Agrandir votre morceau{known.showName && known.name ? `, ${known.name}` : ''}</b>
              <div className="muted">Vous avez déjà donné {formatMoney(known.totalCents)}. Chaque don l&apos;agrandit.</div>
            </div>
          </section>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Montant</legend>
          <div className="grid grid-cols-5 gap-2">
            {CONFIG.suggestedCents.map(c => (
              <button
                key={c}
                type="button"
                className="chip"
                aria-pressed={!custom.trim() && amount === c}
                onClick={() => {
                  setAmount(c)
                  setCustom('')
                }}
              >
                {c / 100} $
              </button>
            ))}
          </div>
          <div className="relative mt-2">
            <input
              className="field pr-8"
              inputMode="decimal"
              placeholder="Autre montant"
              value={custom}
              onChange={e => setCustom(e.target.value.replace(/[^0-9.,]/g, ''))}
              aria-label="Autre montant en dollars"
            />
            <span className="muted absolute right-3 top-1/2 -translate-y-1/2">$</span>
          </div>
          {tooLow && <p className="mt-1 text-sm" style={{ color: '#f87171' }}>Le don minimum est de {CONFIG.minAmountCents / 100} $.</p>}
        </fieldset>

        {!token && (
          <>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold">
                Courriel
              </label>
              <input
                id="email"
                className="field"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <p className="muted mt-1 text-xs">Pour votre confirmation, et pour retrouver votre morceau la prochaine fois. Aucun compte à créer.</p>
            </div>

            <div>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={showName} onChange={e => setShowName(e.target.checked)} />
                <span>
                  <b>Afficher mon nom et ma photo sur l&apos;écran</b>
                  <span className="muted block">Sinon, votre don apparaît comme « Anonyme ».</span>
                </span>
              </label>

              {showName && (
                <div className="mt-3 space-y-3">
                  <input className="field" placeholder="Nom affiché" maxLength={CONFIG.nameMax} value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" />
                  <input className="field" placeholder="Un mot (facultatif)" maxLength={CONFIG.messageMax} value={message} onChange={e => setMessage(e.target.value)} />
                  <PhotoField value={photo} onChange={setPhoto} onBusyChange={setPhotoBusy} />
                </div>
              )}
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold">
                Couleur de votre verre <span className="muted font-normal">(facultatif)</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {GLASS_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    aria-label={c.name}
                    aria-pressed={color === c.value}
                    onClick={() => setColor(color === c.value ? null : c.value)}
                    className="h-10 w-10 rounded-full"
                    style={{ background: c.value, boxShadow: color === c.value ? '0 0 0 3px #050408, 0 0 0 5px #f4f1ea' : '0 0 0 2px #050408' }}
                  />
                ))}
              </div>
            </fieldset>
          </>
        )}

        {snap && (
          <section>
            <h2 className="mb-2 text-sm font-semibold">Votre morceau de verre</h2>
            <DonationPreview
              pieces={snap.pieces}
              draft={{
                donorId: known?.donorId ?? null,
                showName,
                name,
                message,
                photoSrc: photo.src,
                color: color ?? (token && known ? known.color : defaultColorFor(email.trim().toLowerCase())),
                amountCents,
              }}
            />
          </section>
        )}

        {error && <p role="alert" className="text-sm" style={{ color: '#f87171' }}>{error}</p>}

        <button className="btn" disabled={!canSubmit}>
          {busy ? 'Un instant…' : amountCents >= CONFIG.minAmountCents ? `Donner ${formatMoney(amountCents)}` : 'Donner'}
        </button>
        <p className="muted text-center text-xs">
          Paiement sécurisé (carte, Apple Pay ou Google Pay). Sans reçu fiscal pour le moment : l&apos;école n&apos;est pas encore un organisme de bienfaisance enregistré.
        </p>
      </form>

      <footer className="mt-10 border-t pt-5 text-center text-sm" style={{ borderColor: 'var(--line)' }}>
        {!magicOpen ? (
          <button className="muted underline" onClick={() => setMagicOpen(true)}>
            J&apos;ai déjà donné : retrouver mon morceau
          </button>
        ) : magicSent ? (
          <p className="muted">Si ce courriel a déjà donné, un lien vient de lui être envoyé.</p>
        ) : (
          <form onSubmit={sendMagic} className="space-y-2 text-left">
            <label htmlFor="magic" className="muted block text-xs">
              Entrez le courriel utilisé pour votre don : nous vous envoyons un lien.
            </label>
            <input id="magic" className="field" type="email" required value={magicEmail} onChange={e => setMagicEmail(e.target.value)} placeholder="vous@exemple.com" />
            <button className="btn btn-ghost">Envoyer le lien</button>
          </form>
        )}
        <p className="muted mt-4 text-xs">
          Votre courriel sert seulement à vous reconnaître et à vous écrire à propos de ce don. Il n&apos;est jamais affiché.
        </p>
      </footer>
    </main>
  )
}

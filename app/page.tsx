'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CONFIG, GLASS_COLORS } from '@/lib/config'
import DonationPreview from '@/components/DonationPreview'
import PhotoField, { type PhotoValue } from '@/components/PhotoField'
import { feeFor } from '@/lib/fees'
import { formatMoney } from '@/lib/format'
import Link from 'next/link'
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
  const srcParam = params.get('src')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [amount, setAmount] = useState<number | null>(CONFIG.suggestedCents[1])
  const [amountTouched, setAmountTouched] = useState(false)
  const [coverFees, setCoverFees] = useState(false)
  const [channel, setChannel] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  // Couleur de départ tirée au hasard (le donateur peut en choisir une) : le courriel n'est plus demandé ici, Stripe s'en charge
  const [autoColor, setAutoColor] = useState<string>(GLASS_COLORS[0].value)
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
    Promise.resolve().then(() => setAutoColor(GLASS_COLORS[Math.floor(Math.random() * GLASS_COLORS.length)].value))
  }, [])

  // Provenance (?src= de l'affiche ou de l'écran) : gardée pour la session, et une visite comptée une seule fois
  useEffect(() => {
    let src: string | null = null
    try {
      if (srcParam) sessionStorage.setItem('vitrail:src', srcParam)
      src = sessionStorage.getItem('vitrail:src')
    } catch {
      src = srcParam
    }
    let counted = false
    try {
      counted = sessionStorage.getItem('vitrail:visit') === '1'
      sessionStorage.setItem('vitrail:visit', '1')
    } catch {}
    Promise.resolve().then(() => setChannel(src))
    if (!counted) void fetch('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: src }) }).catch(() => {})
  }, [srcParam])

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

  // Montant « habituel » : présélectionné tant que le donateur n'a rien choisi
  const typical = snap?.typicalCents ?? null
  const selected = !amountTouched && typical ? typical : amount

  const baseCents = useMemo(() => {
    if (custom.trim()) {
      const n = parseFloat(custom.replace(',', '.'))
      return Number.isFinite(n) ? Math.round(n * 100) : 0
    }
    return selected ?? 0
  }, [selected, custom])
  const feeCents = baseCents >= CONFIG.minAmountCents ? feeFor(baseCents) : 0
  // Ce que le donateur paie ; la taille du morceau, elle, ne compte que le don (les frais couverts n'y entrent pas)
  const amountCents = coverFees ? baseCents + feeCents : baseCents
  const donorsCount = snap?.pieces.length ?? 0

  // Place du morceau dans le vitrail : « plus grand que 62 % des morceaux », et ce que donnerait le montant suivant
  const others = useMemo(() => (snap?.pieces ?? []).filter(p => p.id !== known?.donorId), [snap, known])
  const alreadyCents = known?.totalCents ?? 0
  const standing = (payCents: number) => {
    const total = alreadyCents + payCents
    const beaten = others.filter(p => p.amountCents < total).length
    return { biggest: beaten === others.length, pct: Math.floor((beaten / Math.max(1, others.length)) * 100) }
  }
  const showStanding = others.length >= 5 && baseCents >= CONFIG.minAmountCents
  const now = showStanding ? standing(baseCents) : null
  // Montant suggéré suivant (seulement si on a choisi une pastille) et ce qu'il changerait
  const nextChip = !custom.trim() && selected ? CONFIG.suggestedCents.find(c => c > selected) ?? null : null
  const next = showStanding && nextChip ? standing(nextChip) : null
  const nudge = now && next && !now.biggest && (next.biggest || next.pct - now.pct >= 5) ? next : null

  const tooLow = baseCents > 0 && baseCents < CONFIG.minAmountCents
  const mode = snap?.mode
  const event = snap?.event ?? null
  const goalPct = event && event.goalCents > 0 ? Math.min(100, Math.round((event.totalCents / event.goalCents) * 100)) : 0
  const canSubmit = !busy && !photoBusy && mode !== 'off' && baseCents >= CONFIG.minAmountCents && (!showName || name.trim().length >= 2)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(token ? { token } : { showName, name, message, color: color ?? autoColor, photoPath: photo.path ?? undefined }),
          amountCents: baseCents,
          coverFees,
          channel,
        }),
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ecole-logo.png" alt={CONFIG.orgName} className="mx-auto mb-4" style={{ width: 200, height: 'auto' }} />
        <h1 className="mt-1 text-3xl font-bold">{CONFIG.appName}</h1>
        <p className="muted mt-2 text-[0.95rem]">Votre don fait vivre l&apos;école, et devient un morceau de verre dans son vitrail.</p>
        {donorsCount > 0 && (
          <p className="mt-3 inline-block rounded-full px-3 py-1 text-sm" style={{ background: 'rgba(255,231,160,0.1)', color: '#ffe7a0' }}>
            {donorsCount === 1 ? '1 personne a déjà son morceau' : `${donorsCount} personnes ont déjà leur morceau`}
          </p>
        )}
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
                aria-pressed={!custom.trim() && selected === c}
                onClick={() => {
                  setAmount(c)
                  setAmountTouched(true)
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
              onChange={e => {
                setCustom(e.target.value.replace(/[^0-9.,]/g, ''))
                setAmountTouched(true)
              }}
              aria-label="Autre montant en dollars"
            />
            <span className="muted absolute right-3 top-1/2 -translate-y-1/2">$</span>
          </div>
          {tooLow && <p className="mt-1 text-sm" style={{ color: '#f87171' }}>Le don minimum est de {CONFIG.minAmountCents / 100} $.</p>}
          {now && (
            <p className="mt-3 text-sm" style={{ color: '#ffe7a0' }}>
              {now.biggest
                ? 'Ce serait le plus grand morceau du vitrail.'
                : now.pct > 0
                  ? `Votre morceau serait plus grand que ${now.pct} % des morceaux du vitrail.`
                  : `Votre morceau rejoindrait les ${others.length} autres.`}
              {nudge && nextChip && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setAmount(nextChip)
                      setAmountTouched(true)
                      setCustom('')
                    }}
                  >
                    {nudge.biggest ? `À ${formatMoney(nextChip)}, ce serait le plus grand.` : `À ${formatMoney(nextChip)}, il dépasserait ${nudge.pct} % d'entre eux.`}
                  </button>
                </>
              )}
            </p>
          )}
          {typical && <p className="muted mt-2 text-xs">La plupart des gens donnent {formatMoney(typical)}.</p>}
          {feeCents > 0 && (
            <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={coverFees} onChange={e => setCoverFees(e.target.checked)} />
              <span>
                J&apos;ajoute <b>{formatMoney(feeCents)}</b> pour couvrir les frais de transaction
                <span className="muted block">L&apos;école reçoit alors vos {formatMoney(baseCents)} au complet.</span>
              </span>
            </label>
          )}
        </fieldset>

        {!token && (
          <>
            <div>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={showName} onChange={e => setShowName(e.target.checked)} />
                <span>
                  <b>Afficher mon nom sur l&apos;écran</b>
                  <span className="muted block">Sinon, votre don apparaît comme « Anonyme » (avec votre photo et votre mot, si vous en ajoutez).</span>
                </span>
              </label>

              <div className="mt-3 space-y-3">
                {showName && <input className="field" placeholder="Nom affiché" maxLength={CONFIG.nameMax} value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" />}
                  <input className="field" placeholder="Un mot (facultatif)" maxLength={CONFIG.messageMax} value={message} onChange={e => setMessage(e.target.value)} />
                  <PhotoField value={photo} onChange={setPhoto} onBusyChange={setPhotoBusy} />
              </div>
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
                color: color ?? (token && known ? known.color : autoColor),
                amountCents: baseCents,
              }}
            />
          </section>
        )}

        <p className="muted text-center text-xs">
          Paiement sécurisé (carte, Apple Pay ou Google Pay). Votre courriel vous sera demandé au paiement, pour votre confirmation et pour retrouver votre
          morceau la prochaine fois. Sans reçu fiscal pour le moment : l&apos;école n&apos;est pas encore un organisme de bienfaisance enregistré.
        </p>

        {/* Bouton toujours à portée de pouce, en bas de l'écran */}
        <div
          className="sticky bottom-0 z-10 -mx-4 px-4 pt-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', background: 'linear-gradient(rgba(7,6,11,0), #07060b 35%)' }}
        >
          {error && (
            <p role="alert" className="mb-2 text-sm" style={{ color: '#f87171' }}>
              {error}
            </p>
          )}
          {!error && showName && name.trim().length < 2 && !token && <p className="muted mb-2 text-center text-xs">Indiquez le nom à afficher (2 lettres minimum).</p>}
          <button className="btn" disabled={!canSubmit} style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
            {busy ? 'Un instant…' : baseCents >= CONFIG.minAmountCents ? `Donner ${formatMoney(amountCents)}` : 'Donner'}
          </button>
        </div>
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
          Votre courriel sert seulement à vous reconnaître et à vous écrire à propos de ce don. Il n&apos;est jamais affiché.{' '}
          <Link href="/confidentialite" className="underline">
            Politique de confidentialité
          </Link>
          {' · '}
          <Link href="/vitrail" className="underline">
            Voir le vitrail
          </Link>
        </p>
      </footer>
    </main>
  )
}

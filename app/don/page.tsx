'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CONFIG } from '@/lib/config'
import ClaimPanel, { type ClaimDraft, type KnownDonor } from '@/components/vitrail/ClaimPanel'
import DonationPreview from '@/components/DonationPreview'
import { formatMoney } from '@/lib/format'
import type { Snapshot } from '@/lib/types'

// Formulaire de don sur téléphone (affiches à code QR) : le même panneau que « Ajouter mon morceau » sur le vitrail,
// en pleine page, avec l'aperçu du morceau au-dessus. Avec un lien magique (?t=…), le donateur agrandit son morceau.

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
  const [known, setKnown] = useState<KnownDonor | null>(null)
  const [linkExpired, setLinkExpired] = useState(false)
  const token = linkExpired ? null : tokenParam
  const [draft, setDraft] = useState<ClaimDraft | null>(null)
  const [magicOpen, setMagicOpen] = useState(false)
  const [magicEmail, setMagicEmail] = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const [mobile, setMobile] = useState(true)

  useEffect(() => {
    const m = () => setMobile(window.innerWidth < 640)
    m()
    window.addEventListener('resize', m)
    return () => window.removeEventListener('resize', m)
  }, [])

  useEffect(() => {
    if (!tokenParam) return
    fetch('/api/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tokenParam }) })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setKnown({ donorId: d.donorId, name: d.name, showName: d.showName, color: d.color, totalCents: d.totalCents }))
      .catch(() => setLinkExpired(true))
  }, [tokenParam])

  // Provenance (?src= de l'affiche) : gardée pour la session, et une visite comptée une seule fois
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

  const onDraftChange = useCallback((d: ClaimDraft) => setDraft(d), [])

  const mode = snap?.mode
  const event = snap?.event ?? null
  const goalPct = event && event.goalCents > 0 ? Math.min(100, Math.round((event.totalCents / event.goalCents) * 100)) : 0
  const donorsCount = snap?.pieces.length ?? 0
  const agrandir = !!(known && token)
  // Le panneau compare au reste du vitrail : sans le morceau du donateur reconnu
  const amounts = (snap?.pieces ?? []).filter(p => p.id !== known?.donorId).map(p => p.amountCents)
  // Attendre le lien magique avant d'afficher le panneau (sinon il s'ouvrirait en « nouveau morceau »)
  const ready = !!snap && (!tokenParam || known || linkExpired)

  async function sendMagic(e: React.FormEvent) {
    e.preventDefault()
    await fetch('/api/magic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: magicEmail }) }).catch(() => {})
    setMagicSent(true)
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
      <header className="mb-5 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ecole-logo.png" alt={CONFIG.orgName} className="mx-auto mb-4" style={{ width: 180, height: 'auto' }} />
        <h1 className="mt-1 text-3xl font-bold">{CONFIG.appName}</h1>
        <p className="muted mt-2 text-[0.95rem]">Chaque don devient un morceau de verre dans le vitrail de l&apos;École.</p>
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

      {/* Aperçu du morceau, comme sur le vitrail */}
      {snap && draft && (
        <section className="mb-4">
          <DonationPreview
            pieces={snap.pieces}
            size={mobile ? 300 : 340}
            draft={{
              donorId: agrandir ? known!.donorId : null,
              showName: !!draft.name,
              name: draft.name ?? '',
              message: draft.message ?? '',
              photoSrc: draft.photoSrc,
              color: agrandir ? known!.color : draft.color,
              amountCents: draft.amountCents,
            }}
          />
        </section>
      )}

      {ready && mode !== 'off' && (
        <ClaimPanel
          variant="page"
          amounts={amounts}
          typicalCents={snap?.typicalCents ?? null}
          demo={mode === 'demo'}
          isMobile={mobile}
          onDraftChange={onDraftChange}
          known={known}
          token={token}
          returnTo="don"
          defaultChannel="don"
        />
      )}

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

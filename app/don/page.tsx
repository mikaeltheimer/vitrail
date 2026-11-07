'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useOrg } from '@/lib/useOrg'
import { useMoney } from '@/lib/useI18n'
import ClaimPanel, { type ClaimDraft, type KnownDonor } from '@/components/vitrail/ClaimPanel'
import DonationPreview from '@/components/DonationPreview'
import type { Snapshot } from '@/lib/types'
import BrandFooter from '@/components/BrandFooter'
import { OrgLogo } from '@/components/OrgBrand'
import Editable from '@/components/atelier/Editable'

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
  const t = useTranslations('don')
  const tc = useTranslations('commun')
  const org = useOrg()
  const money = useMoney()
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
        <Editable field="logo" block style={{ width: 'fit-content', margin: '0 auto' }}>
          <OrgLogo className="mx-auto mb-4" style={{ width: 180 }} nameStyle={{ fontSize: 22 }} />
        </Editable>
        <h1 className="mt-1 text-3xl">
          <Editable field="vitrailTitle">{org.vitrailTitle}</Editable>
        </h1>
        <p className="muted mt-2 text-[0.95rem]">{t('intro')}</p>
        {donorsCount > 0 && (
          <p className="mt-3 inline-block rounded-full px-3 py-1 text-sm" style={{ background: 'rgba(255,226,168,0.1)', color: '#FFE2A8' }}>
            {t('dejaDonne', { count: donorsCount })}
          </p>
        )}
      </header>

      {event && event.goalCents > 0 && (
        <section className="card mb-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="muted">{event.name}</span>
            <span>
              <b>{money(event.totalCents)}</b> <span className="muted">{t('sur', { montant: money(event.goalCents) })}</span>
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <div className="h-full rounded-full" style={{ width: `${goalPct}%`, background: '#F0B24A' }} />
          </div>
        </section>
      )}

      {cancelled && <p className="card mb-5 text-sm">{t('annule')}</p>}
      {linkExpired && <p className="card mb-5 text-sm">{t('lienExpire')}</p>}
      {mode === 'off' && <p className="card mb-5 text-sm">{t('ferme')}</p>}

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
            {t('jaiDejaDonne')}
          </button>
        ) : magicSent ? (
          <p className="muted">{t('magicEnvoye')}</p>
        ) : (
          <form onSubmit={sendMagic} className="space-y-2 text-left">
            <label htmlFor="magic" className="muted block text-xs">
              {t('magicLabel')}
            </label>
            <input id="magic" className="field" type="email" required value={magicEmail} onChange={e => setMagicEmail(e.target.value)} placeholder={t('magicPlaceholder')} />
            <button className="btn btn-ghost">{t('magicEnvoyer')}</button>
          </form>
        )}
        <p className="muted mt-4 text-xs">
          {t('courrielUsage')}{' '}
          <Link href="/confidentialite" className="underline">
            {t('politique')}
          </Link>
          {' · '}
          <Link href="/conditions" className="underline">
            {tc('conditionsCourt')}
          </Link>
          {' · '}
          <Link href="/vitrail" className="underline">
            {t('voirVitrail')}
          </Link>
        </p>
      </footer>
      <BrandFooter className="mt-10 text-center" />
    </main>
  )
}

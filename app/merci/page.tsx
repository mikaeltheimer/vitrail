'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import MiniGlass from '@/components/MiniGlass'
import { useTranslations } from 'next-intl'
import { useOrg } from '@/lib/useOrg'
import { useMoney } from '@/lib/useI18n'
import type { Piece, Snapshot } from '@/lib/types'
import BrandFooter from '@/components/BrandFooter'

interface Thanks {
  donorId: string
  donationCents: number
  totalCents: number
  name: string | null
  color: string
  token: string
  photoPending?: boolean
  hasMessage?: boolean
}

export default function MerciPage() {
  return (
    <Suspense fallback={null}>
      <Merci />
    </Suspense>
  )
}

function Merci() {
  const t = useTranslations('merci')
  const tc = useTranslations('commun')
  const org = useOrg()
  const money = useMoney()
  const ref = useSearchParams().get('ref')
  const [result, setResult] = useState<'wait' | 'ok' | 'lost'>('wait')
  const state = ref ? result : 'lost'
  const [thanks, setThanks] = useState<Thanks | null>(null)
  const [pieces, setPieces] = useState<Piece[]>([])

  useEffect(() => {
    if (!ref) return
    let stop = false
    let tries = 0
    const poll = async () => {
      if (stop) return
      try {
        const res = await fetch('/api/merci', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref }) })
        const data = await res.json()
        // Seule une vraie réponse (pas une erreur, pas « en attente ») compte : sinon on réessaie
        if (res.ok && data.pending === false && data.donorId) {
          setThanks(data as Thanks)
          try {
            localStorage.setItem('vitrail:me', data.donorId) // « Trouver mon morceau » sur le vitrail en ligne
          } catch {}
          const snap = (await fetch('/api/vitrail', { cache: 'no-store' }).then(r => r.json())) as Snapshot
          setPieces(snap.pieces)
          setResult('ok')
          return
        }
      } catch {}
      // Le paiement est confirmé par Stripe quelques secondes plus tard : on patiente jusqu'à ~40 s
      if (++tries < 27) setTimeout(poll, 1500)
      else setResult('lost')
    }
    void poll()
    return () => {
      stop = true
    }
  }, [ref])

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-8 text-center">
      {state === 'wait' && (
        <>
          <h1 className="text-2xl font-bold">{t('titre')}</h1>
          <p className="muted mt-2">{t('attente')}</p>
        </>
      )}

      {state === 'lost' && (
        <>
          <h1 className="text-2xl font-bold">{t('titre')}</h1>
          <p className="muted mt-2">{t('perdu')}</p>
          <Link href="/vitrail" className="btn btn-ghost mt-6">
            {t('retour')}
          </Link>
        </>
      )}

      {state === 'ok' && thanks && (
        <>
          <h1 className="text-3xl font-bold">{thanks.name ? t('titreNom', { nom: thanks.name }) : t('titre')}</h1>
          <p className="muted mt-2">
            {t.rich('donEnregistre', { montant: money(thanks.donationCents), b: chunks => <b style={{ color: 'var(--text)' }}>{chunks}</b> })}
            {thanks.totalCents > thanks.donationCents && <> {t('auTotal', { montant: money(thanks.totalCents) })}</>}
          </p>

          <div className="card mt-5 text-left text-sm" style={{ borderColor: 'rgba(255,226,168,0.5)' }}>
            <b style={{ color: '#FFE2A8' }}>{t('ecranTitre')}</b>
            <div className="muted mt-1">{t('ecranTexte')}</div>
            {thanks.photoPending && <div className="muted mt-1">{t('photoAttente')}</div>}
          </div>

          <div className="my-6">
            <MiniGlass pieces={pieces} highlightId={thanks.donorId} size={300} />
            <p className="muted mt-3 text-sm">{t('coeur')}</p>
            <Link href={`/vitrail?d=${thanks.donorId}`} className="mt-2 inline-block text-sm underline">
              {t('explorer')}
            </Link>
          </div>

          {!thanks.hasMessage && (
          <div className="card mb-4 text-left text-sm" style={{ borderColor: 'rgba(255,226,168,0.5)' }}>
            <b style={{ color: '#FFE2A8' }}>{org.testimonial.question}</b>
            <div className="muted mt-1">
              {org.testimonial.cta} {org.testimonial.lead}
            </div>
            <Link href={`/m/${thanks.token}`} className="btn mt-3">
              {t('ajouterTemoignage')}
            </Link>
            <div className="muted mt-2 text-xs">{t('pasMaintenant')}</div>
          </div>
          )}
          <div className="space-y-3">
            <Link href={`/don?t=${thanks.token}`} className="btn btn-ghost">
              {t('agrandir')}
            </Link>
            <Link href={`/m/${thanks.token}`} className="btn btn-ghost">
              {t('modifier')}
            </Link>
          </div>
          <p className="muted mt-6 text-xs">
            {t('piedCourriel')}{' '}
            <Link href="/confidentialite" className="underline">
              {tc('confidentialiteCourt')}
            </Link>
          </p>
        </>
      )}
      <BrandFooter className="mt-10 text-center" />
    </main>
  )
}

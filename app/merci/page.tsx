'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import MiniGlass from '@/components/MiniGlass'
import { CONFIG } from '@/lib/config'
import { formatMoney } from '@/lib/format'
import type { Piece, Snapshot } from '@/lib/types'

interface Thanks {
  donorId: string
  donationCents: number
  totalCents: number
  name: string | null
  color: string
  token: string
  photoPending?: boolean
}

export default function MerciPage() {
  return (
    <Suspense fallback={null}>
      <Merci />
    </Suspense>
  )
}

function Merci() {
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
          <h1 className="text-2xl font-bold">Merci!</h1>
          <p className="muted mt-2">Nous confirmons votre don et fabriquons votre morceau de verre…</p>
        </>
      )}

      {state === 'lost' && (
        <>
          <h1 className="text-2xl font-bold">Merci!</h1>
          <p className="muted mt-2">
            Nous n&apos;avons pas encore reçu la confirmation du paiement. Si vous avez été débité, votre morceau apparaîtra dans quelques minutes, et un courriel de confirmation
            vous sera envoyé.
          </p>
          <Link href="/vitrail" className="btn btn-ghost mt-6">
            Retour
          </Link>
        </>
      )}

      {state === 'ok' && thanks && (
        <>
          <h1 className="text-3xl font-bold">Merci{thanks.name ? `, ${thanks.name}` : ''}!</h1>
          <p className="muted mt-2">
            Votre don de <b style={{ color: 'var(--text)' }}>{formatMoney(thanks.donationCents)}</b> est enregistré.
            {thanks.totalCents > thanks.donationCents && <> Au total, vous avez donné {formatMoney(thanks.totalCents)}.</>}
          </p>

          <div className="card mt-5 text-left text-sm" style={{ borderColor: 'rgba(255,231,160,0.5)' }}>
            <b style={{ color: '#ffe7a0' }}>Regardez le grand écran!</b>
            <div className="muted mt-1">Votre morceau y sort du vitrail dans quelques secondes, avec votre nom et votre message.</div>
            {thanks.photoPending && <div className="muted mt-1">Votre photo s&apos;ajoutera dès que l&apos;équipe l&apos;aura vue.</div>}
          </div>

          <div className="my-6">
            <MiniGlass pieces={pieces} highlightId={thanks.donorId} size={300} />
            <p className="muted mt-3 text-sm">Votre morceau, cerclé d&apos;or, au cœur du vitrail de l&apos;école.</p>
            <Link href={`/vitrail?d=${thanks.donorId}`} className="mt-2 inline-block text-sm underline">
              Explorer le vitrail en grand
            </Link>
          </div>

          <div className="space-y-3">
            <Link href={`/don?t=${thanks.token}`} className="btn">
              Agrandir mon morceau
            </Link>
            <Link href={`/m/${thanks.token}`} className="btn btn-ghost">
              Modifier mon nom ou mon message
            </Link>
          </div>
          <p className="muted mt-6 text-xs">
            Un courriel de confirmation avec ces liens vous est envoyé. L&apos;{CONFIG.orgName} n&apos;émet pas encore de reçu fiscal.{' '}
            <Link href="/confidentialite" className="underline">
              Confidentialité
            </Link>
          </p>
        </>
      )}
    </main>
  )
}

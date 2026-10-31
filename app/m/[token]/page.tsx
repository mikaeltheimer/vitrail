'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import MiniGlass from '@/components/MiniGlass'
import { CONFIG, GLASS_COLORS } from '@/lib/config'
import { formatMoney } from '@/lib/format'
import type { Piece, Snapshot } from '@/lib/types'

// Lien magique : on modifie le nom, le message et la couleur de son morceau, ou on l'agrandit. Pas de compte.

export default function ManagePage() {
  const { token } = useParams<{ token: string }>()
  const [loaded, setLoaded] = useState<'wait' | 'ok' | 'expired'>('wait')
  const [donorId, setDonorId] = useState('')
  const [totalCents, setTotalCents] = useState(0)
  const [showName, setShowName] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [color, setColor] = useState<string>(GLASS_COLORS[0].value)
  const [pieces, setPieces] = useState<Piece[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => {
        setDonorId(d.donorId)
        setTotalCents(d.totalCents)
        setShowName(d.showName)
        setName(d.name)
        setMessage(d.message)
        setColor(d.color)
        setLoaded('ok')
      })
      .catch(() => setLoaded('expired'))
    fetch('/api/vitrail', { cache: 'no-store' })
      .then(r => r.json())
      .then((s: Snapshot) => setPieces(s.pieces))
      .catch(() => {})
  }, [token])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'update', showName, name, message, color }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur inattendue.')
      setSaved(true)
      const snap = (await fetch('/api/vitrail', { cache: 'no-store' }).then(r => r.json())) as Snapshot
      setPieces(snap.pieces)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loaded === 'wait') return <main className="mx-auto max-w-md px-4 py-10 text-center muted">Chargement…</main>

  if (loaded === 'expired') {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="text-2xl font-bold">Ce lien a expiré</h1>
        <p className="muted mt-2">Demandez-en un nouveau avec le courriel utilisé pour votre don.</p>
        <Link href="/" className="btn mt-6">
          Retrouver mon morceau
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-8">
      <h1 className="text-center text-2xl font-bold">Mon morceau de vitrail</h1>
      <p className="muted mt-1 text-center text-sm">
        {CONFIG.orgName} · {formatMoney(totalCents)} donnés
      </p>

      <div className="my-5">
        <MiniGlass pieces={pieces} highlightId={donorId} size={240} />
      </div>

      <form onSubmit={save} className="space-y-5">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={showName} onChange={e => setShowName(e.target.checked)} />
          <span>
            <b>Afficher mon nom sur l&apos;écran</b>
            <span className="muted block">Sinon, votre don apparaît comme « Anonyme ».</span>
          </span>
        </label>

        {showName && (
          <div className="space-y-3">
            <input className="field" placeholder="Nom affiché" maxLength={CONFIG.nameMax} value={name} onChange={e => setName(e.target.value)} />
            <input className="field" placeholder="Un mot (facultatif)" maxLength={CONFIG.messageMax} value={message} onChange={e => setMessage(e.target.value)} />
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Couleur de votre verre</legend>
          <div className="flex flex-wrap gap-2">
            {GLASS_COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                aria-label={c.name}
                aria-pressed={color === c.value}
                onClick={() => setColor(c.value)}
                className="h-10 w-10 rounded-full"
                style={{ background: c.value, boxShadow: color === c.value ? '0 0 0 3px #050408, 0 0 0 5px #f4f1ea' : '0 0 0 2px #050408' }}
              />
            ))}
          </div>
        </fieldset>

        {error && <p role="alert" className="text-sm" style={{ color: '#f87171' }}>{error}</p>}
        {saved && <p className="text-sm" style={{ color: '#a3e635' }}>Enregistré. Votre morceau est à jour sur l&apos;écran.</p>}

        <button className="btn" disabled={saving || (showName && name.trim().length < 2)}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <Link href={`/?t=${token}`} className="btn btn-ghost">
          Agrandir mon morceau
        </Link>
      </form>
    </main>
  )
}

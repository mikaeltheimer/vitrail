'use client'

import { useEffect, useState } from 'react'
import TestimonialField from '@/components/vitrail/TestimonialField'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import MiniGlass from '@/components/MiniGlass'
import PhotoField, { type PhotoValue } from '@/components/PhotoField'
import { CONFIG, GLASS_COLORS } from '@/lib/config'
import { formatMoney } from '@/lib/format'
import type { Piece, Snapshot } from '@/lib/types'

// Lien magique : on ajoute son témoignage, on modifie le nom, la photo et la couleur de son morceau, ou on l'agrandit. Pas de compte.

export default function ManagePage() {
  const { token } = useParams<{ token: string }>()
  const [loaded, setLoaded] = useState<'wait' | 'ok' | 'expired'>('wait')
  const [donorId, setDonorId] = useState('')
  const [totalCents, setTotalCents] = useState(0)
  const [showName, setShowName] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [quoteConsent, setQuoteConsent] = useState(false)
  const [messagePending, setMessagePending] = useState(false)
  const [color, setColor] = useState<string>(GLASS_COLORS[0].value)
  const [photo, setPhoto] = useState<PhotoValue>({ src: null, path: null })
  const [photoChanged, setPhotoChanged] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoPending, setPhotoPending] = useState(false)
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
        setQuoteConsent(!!d.quoteConsent)
        setMessagePending(!!d.messagePending)
        setColor(d.color)
        setPhoto({ src: d.photoUrl ?? null, path: null })
        setPhotoPending(!!d.photoPending)
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
        body: JSON.stringify({ token, action: 'update', showName, name, message, quoteConsent, color, ...(photoChanged ? { photoPath: photo.path ?? '' } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur inattendue.')
      setSaved(true)
      setPhotoChanged(false)
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
        <Link href="/vitrail" className="btn mt-6">
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
        {/* Le témoignage d'abord : c'est souvent pour lui qu'on revient avec ce lien */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{CONFIG.testimonial.title}</h2>
          <p className="muted text-sm">{CONFIG.testimonial.lead}</p>
          <TestimonialField value={message} onChange={setMessage} consent={quoteConsent} onConsent={setQuoteConsent} rows={5} />
          {messagePending && <p className="muted text-xs">Votre témoignage apparaîtra dès que l&apos;équipe l&apos;aura lu.</p>}
        </section>

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={showName} onChange={e => setShowName(e.target.checked)} />
          <span>
            <b>Afficher mon nom sur l&apos;écran</b>
            <span className="muted block">Sinon, votre don apparaît comme « Anonyme » (avec votre photo et votre mot, si vous en ajoutez).</span>
          </span>
        </label>

        <div className="space-y-3">
          {showName && <input className="field" placeholder="Nom affiché" maxLength={CONFIG.nameMax} value={name} onChange={e => setName(e.target.value)} />}
          <PhotoField
            value={photo}
            onChange={v => {
              setPhoto(v)
              setPhotoChanged(true)
            }}
            onBusyChange={setPhotoBusy}
          />
          {photoPending && !photoChanged && <p className="muted text-xs">Votre photo apparaîtra sur l&apos;écran dès que l&apos;équipe l&apos;aura approuvée.</p>}
        </div>

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

        <button className="btn" disabled={saving || photoBusy || (showName && name.trim().length < 2)}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <Link href={`/don?t=${token}`} className="btn btn-ghost">
          Agrandir mon morceau
        </Link>
      </form>
    </main>
  )
}

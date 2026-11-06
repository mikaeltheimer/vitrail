'use client'

import { useEffect, useState } from 'react'
import TestimonialField from '@/components/vitrail/TestimonialField'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import MiniGlass from '@/components/MiniGlass'
import PhotoField, { type PhotoValue } from '@/components/PhotoField'
import { useTranslations } from 'next-intl'
import { CONFIG, GLASS_COLORS } from '@/lib/config'
import { useOrg } from '@/lib/useOrg'
import { useGlassName, useMoney } from '@/lib/useI18n'
import type { Piece, Snapshot } from '@/lib/types'
import BrandFooter from '@/components/BrandFooter'

// Lien magique : on ajoute son témoignage, on modifie le nom, la photo et la couleur de son morceau, ou on l'agrandit. Pas de compte.

export default function ManagePage() {
  const t = useTranslations('gerer')
  const org = useOrg()
  const money = useMoney()
  const glassName = useGlassName()
  const { token } = useParams<{ token: string }>()
  const [loaded, setLoaded] = useState<'wait' | 'ok' | 'expired'>('wait')
  const [donorId, setDonorId] = useState('')
  const [totalCents, setTotalCents] = useState(0)
  const [showName, setShowName] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [quoteConsent, setQuoteConsent] = useState(false)
  const [mailing, setMailing] = useState(false)
  const [mailingSaved, setMailingSaved] = useState(false)
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
        setMailing(!!d.mailing)
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
      if (!res.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : t('erreurInattendue'))
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

  if (loaded === 'wait') return <main className="mx-auto max-w-md px-4 py-10 text-center muted">{t('chargement')}</main>

  if (loaded === 'expired') {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="text-2xl font-bold">{t('expireTitre')}</h1>
        <p className="muted mt-2">{t('expireTexte')}</p>
        <Link href="/vitrail" className="btn mt-6">
          {t('retrouver')}
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-8">
      <h1 className="text-center text-2xl font-bold">{t('titre')}</h1>
      <p className="muted mt-1 text-center text-sm">
        {t('sousTitre', { org: org.name, montant: money(totalCents) })}
      </p>

      <div className="my-5">
        <MiniGlass pieces={pieces} highlightId={donorId} size={240} />
      </div>

      <form onSubmit={save} className="space-y-5">
        {/* Le témoignage d'abord : c'est souvent pour lui qu'on revient avec ce lien */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{org.testimonial.question}</h2>
          <p className="text-sm" style={{ color: '#F0B24A' }}>
            {org.testimonial.cta} <span className="muted">{org.testimonial.lead}</span>
          </p>
          <TestimonialField value={message} onChange={setMessage} consent={quoteConsent} onConsent={setQuoteConsent} rows={5} />
          {messagePending && <p className="muted text-xs">{t('temoignageAttente')}</p>}
        </section>

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={showName} onChange={e => setShowName(e.target.checked)} />
          <span>
            <b>{t('afficherNom')}</b>
            <span className="muted block">{t('afficherNomAide')}</span>
          </span>
        </label>

        <div className="space-y-3">
          {showName && <input className="field" placeholder={t('nomPlaceholder')} maxLength={CONFIG.nameMax} value={name} onChange={e => setName(e.target.value)} />}
          <PhotoField
            value={photo}
            onChange={v => {
              setPhoto(v)
              setPhotoChanged(true)
            }}
            onBusyChange={setPhotoBusy}
          />
          {photoPending && !photoChanged && <p className="muted text-xs">{t('photoAttente')}</p>}
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('couleur')}</legend>
          <div className="flex flex-wrap gap-2">
            {GLASS_COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                aria-label={glassName(c)}
                aria-pressed={color === c.value}
                onClick={() => setColor(c.value)}
                className="h-10 w-10 rounded-full"
                style={{ background: c.value, boxShadow: color === c.value ? '0 0 0 3px #050408, 0 0 0 5px #F4EFE6' : '0 0 0 2px #050408' }}
              />
            ))}
          </div>
        </fieldset>

        {error && <p role="alert" className="text-sm" style={{ color: '#f87171' }}>{error}</p>}
        {saved && <p className="text-sm" style={{ color: '#3DB5A6' }}>{t('enregistre')}</p>}

        <button className="btn" disabled={saving || photoBusy || (showName && name.trim().length < 2)}>
          {saving ? t('enregistrement') : t('enregistrer')}
        </button>
        <Link href={`/don?t=${token}`} className="btn btn-ghost">
          {t('agrandir')}
        </Link>
      </form>

      {/* Liste d'envoi : s'enregistre aussitôt, indépendamment du formulaire du morceau */}
      <section className="card mt-8 space-y-2 text-sm">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0"
            checked={mailing}
            onChange={async e => {
              const subscribed = e.target.checked
              setMailing(subscribed)
              setMailingSaved(false)
              const res = await fetch('/api/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'mailing', subscribed }) })
              if (res.ok) setMailingSaved(true)
              else setMailing(!subscribed)
            }}
          />
          <span>
            <b>{t('listeEnvoi', { org: org.name })}</b>
            <span className="muted block">{t('listeEnvoiAide')}</span>
          </span>
        </label>
        {mailingSaved && <p style={{ color: '#3DB5A6' }}>{mailing ? t('listeEnvoiOui') : t('listeEnvoiNon')}</p>}
      </section>
      <BrandFooter className="mt-10 text-center" />
    </main>
  )
}

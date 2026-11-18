'use client'

import { useQuestionPicker } from '@/components/vitrail/QuestionPicker'
import { currentGlass } from '@/lib/theme'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import PhotoField, { type PhotoValue } from '@/components/PhotoField'
import { useTranslations } from 'next-intl'
import { GLASS_COLORS } from '@/lib/config'
import { useOrg } from '@/lib/useOrg'
import { useMoney } from '@/lib/useI18n'
import type { Piece, Snapshot } from '@/lib/types'
import BrandFooter from '@/components/BrandFooter'
import { OrgLogo } from '@/components/OrgBrand'
import DonationPreview from '@/components/DonationPreview'
import DonLayout, { previewSize } from '@/components/DonLayout'
import FragmentFields from '@/components/vitrail/FragmentFields'
import { askConfirm } from '@/components/ConfirmDialog'

/** En-tête de la page : le logo de l'organisme (sinon son nom), qui ramène au vitrail. */
function OrgHeader() {
  return (
    <Link href="/vitrail" className="mx-auto mb-6 flex justify-center" style={{ color: 'inherit', textDecoration: 'none' }}>
      <OrgLogo style={{ maxWidth: 220, maxHeight: 72 }} nameStyle={{ fontSize: 20, textAlign: 'center' }} />
    </Link>
  )
}

// Lien magique (« Mon fragment ») : on modifie le nom, le témoignage, le verre et la photo de son morceau, on retire
// tout, ou on l'agrandit. Pas de compte. Mêmes pièces que /don (Mika, 18 nov.) : le bloc « Votre fragment »
// (FragmentFields), l'aperçu en direct (DonationPreview) et la mise en page à deux colonnes sur ordinateur (DonLayout).
// Un nom vide = un fragment anonyme, comme sur /don.

const panelStyle: React.CSSProperties = {
  display: 'grid',
  gap: '14px',
  background: 'rgba(20,18,29,0.95)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '14px',
  padding: '18px 16px',
  color: '#F4EFE6',
}

export default function ManagePage() {
  const t = useTranslations('gerer')
  const org = useOrg()
  const money = useMoney()
  const { token } = useParams<{ token: string }>()
  const [loaded, setLoaded] = useState<'wait' | 'ok' | 'expired'>('wait')
  const [donorId, setDonorId] = useState('')
  const [totalCents, setTotalCents] = useState(0)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [quoteConsent, setQuoteConsent] = useState(false)
  // La question de son témoignage actuel (s'il en a une), sinon une au hasard
  const [savedQuestion, setSavedQuestion] = useState<string | null>(null)
  const picker = useQuestionPicker(org.testimonial.questions, savedQuestion)
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
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(300)

  useEffect(() => {
    const m = () => setPreview(previewSize(window.innerWidth))
    m()
    window.addEventListener('resize', m)
    return () => window.removeEventListener('resize', m)
  }, [])

  useEffect(() => {
    fetch('/api/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => {
        setDonorId(d.donorId)
        setTotalCents(d.totalCents)
        setName(d.showName ? d.name : '')
        setMessage(d.message)
        setQuoteConsent(!!d.quoteConsent)
        setSavedQuestion(typeof d.question === 'string' ? d.question : null)
        setMailing(!!d.mailing)
        setMessagePending(!!d.messagePending)
        setColor(currentGlass(d.color) ?? d.color)
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

  /** Enregistre le fragment ; `clear` = tout retirer (nom, témoignage, photo). */
  async function save(clear = false) {
    setSaving(true)
    setError(null)
    setSaved(null)
    const v = clear ? { name: '', message: '', quoteConsent: false } : { name, message, quoteConsent }
    try {
      const res = await fetch('/api/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'update',
          showName: v.name.trim().length > 0,
          name: v.name,
          message: v.message,
          quoteConsent: v.quoteConsent,
          question: picker.question,
          color,
          ...(clear ? { photoPath: '' } : photoChanged ? { photoPath: photo.path ?? '' } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : t('erreurInattendue'))
      if (clear) {
        setName('')
        setMessage('')
        setQuoteConsent(false)
        setPhoto({ src: null, path: null })
        setMessagePending(false)
        setPhotoPending(false)
      }
      setSaved(clear ? t('retire') : t('enregistre'))
      setPhotoChanged(false)
      const snap = (await fetch('/api/vitrail', { cache: 'no-store' }).then(r => r.json())) as Snapshot
      setPieces(snap.pieces)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function clearAll() {
    const ok = await askConfirm({ title: t('toutRetirerTitre'), text: t('toutRetirerTexte'), confirmLabel: t('toutRetirerOui'), cancelLabel: t('annuler'), danger: true })
    if (ok) await save(true)
  }

  if (loaded === 'wait')
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <OrgHeader />
        <p className="muted">{t('chargement')}</p>
      </main>
    )

  if (loaded === 'expired') {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <OrgHeader />
        <h1 className="text-2xl font-bold">{t('expireTitre')}</h1>
        <p className="muted mt-2">{t('expireTexte')}</p>
        <Link href="/vitrail" className="btn mt-6">
          {t('retrouver')}
        </Link>
      </main>
    )
  }

  const hasContent = !!(name.trim() || message.trim() || photo.src)

  const aside = (
    <>
      <OrgHeader />
      <h1 className="text-center text-3xl">{t('titre')}</h1>
      <p className="muted mt-1 text-center text-sm">{t('sousTitre', { org: org.name, montant: money(totalCents) })}</p>
      {pieces.length > 0 && (
        <section className="mb-5 mt-5 lg:mb-0">
          <DonationPreview
            edit
            size={preview}
            pieces={pieces}
            draft={{ donorId, showName: name.trim().length > 0, name, message, photoSrc: photo.src, color, amountCents: 0 }}
          />
        </section>
      )}
    </>
  )

  return (
    <DonLayout aside={aside} footer={<BrandFooter className="mt-10 text-center" />}>
      <form
        onSubmit={e => {
          e.preventDefault()
          void save()
        }}
        style={panelStyle}
      >
        <div>
          <h2 className="font-display" style={{ margin: 0, fontSize: '24px' }}>
            {t('modifier')}
          </h2>
          <p className="muted mt-1 text-[15px]">{t('modifierAide')}</p>
        </div>

        <FragmentFields
          name={name}
          onName={setName}
          message={message}
          onMessage={setMessage}
          quoteConsent={quoteConsent}
          onQuoteConsent={setQuoteConsent}
          picker={picker}
          color={color}
          onColor={setColor}
          footnote={false}
          nameNote={name.trim() ? <span style={{ fontSize: '15px', color: 'rgba(255,255,255,0.75)' }}>{t('nomAnonyme')}</span> : null}
          messageNote={messagePending ? <p className="muted m-0 text-sm">{t('temoignageAttente')}</p> : null}
          photo={
            <div className="space-y-2">
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
          }
        />

        {error && (
          <p role="alert" className="text-sm" style={{ color: '#f87171' }}>
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm" style={{ color: '#3DB5A6' }}>
            {saved}
          </p>
        )}

        <button className="btn" disabled={saving || photoBusy || name.trim().length === 1}>
          {saving ? t('enregistrement') : t('enregistrer')}
        </button>

        {/* Droit de retrait (Loi 25) : un geste pour tout retirer ; le nom seul se retire en vidant son champ */}
        {hasContent && (
          <div className="border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
            <button type="button" onClick={() => void clearAll()} disabled={saving} className="text-[15px] underline" style={{ background: 'none', border: 0, padding: 0, color: '#f87171', cursor: 'pointer' }}>
              {t('toutRetirer')}
            </button>
            <p className="muted mt-1 text-sm">{t('toutRetirerAide')}</p>
          </div>
        )}
      </form>

      {/* Agrandir : une autre intention (un paiement), dans sa propre carte */}
      <section className="card mt-5 space-y-3 text-sm">
        <div>
          <b className="text-[15px]">{t('agrandirTitre')}</b>
          <p className="muted mt-1">{t('agrandirAide')}</p>
        </div>
        <Link href={`/don?t=${token}`} className="btn btn-ghost">
          {t('agrandir')}
        </Link>
      </section>

      {/* Liste d'envoi : s'enregistre aussitôt, indépendamment du formulaire du morceau */}
      <section className="card mt-5 space-y-2 text-sm">
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
    </DonLayout>
  )
}

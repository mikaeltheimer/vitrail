'use client'

// Panneau « Ajouter mon morceau », comme le panneau d'achat de Pay to Exist : tout se fait dans le vitrail.
// Montant (curseur + saisie), part du vitrail, rang, couleur du verre, nom, photo, message : chaque réglage
// s'affiche en direct sur le morceau d'aperçu. Puis paiement (Stripe ; le courriel est demandé là-bas).

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import Link from 'next/link'
import { CONFIG, GLASS_COLORS } from '@/lib/config'
import { feeFor } from '@/lib/fees'
import { formatMoney } from '@/lib/format'
import { squareJpeg, uploadPhoto } from '@/lib/photoClient'

const GOLD = '#fbbf24'

export interface ClaimDraft {
  name: string | null
  color: string
  photoSrc: string | null
  message: string | null
  /** Le don, sans les frais couverts : c'est la taille du morceau (et ce qui compte dans le total). */
  amountCents: number
  /** Cadrage : 'place' (la place dans le vitrail, quand le montant change) ou 'detail' (gros plan quand le contenu change). */
  focus: 'place' | 'detail'
}

interface Props {
  /** Montants des morceaux actuels (part du vitrail, rang, « plus grand que »). */
  amounts: number[]
  typicalCents: number | null
  /** Mode démo (pas de clé Stripe) : aucun paiement, aucun courriel ; on le dit clairement. */
  demo?: boolean
  isMobile: boolean
  panelRef: RefObject<HTMLDivElement | null>
  /** geometryChanged = la taille change (il faut recalculer le pavage) ; sinon simple mise à jour visuelle */
  onDraftChange: (draft: ClaimDraft, geometryChanged: boolean) => void
  onClose: () => void
}

/** Brouillon gardé le temps du passage chez Stripe : si le donateur revient sans payer, il retrouve tout. */
const DRAFT_KEY = 'vitrail:claim'
interface SavedDraft {
  amount: number
  coverFees: boolean
  name: string
  color: string
  message: string
  photo: { src: string | null; path: string | null }
}
function readSaved(): SavedDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as SavedDraft) : null
  } catch {
    return null
  }
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

const MIN = CONFIG.minAmountCents / 100
const MAX = CONFIG.maxAmountCents / 100

/** Curseur 0–1000 → montant en dollars, sur une échelle logarithmique du minimum au maximum. */
function sliderToAmount(v: number): number {
  const a = Math.exp(Math.log(MIN) + (v / 1000) * (Math.log(MAX) - Math.log(MIN)))
  const step = a < 20 ? 1 : a < 200 ? 5 : a < 2000 ? 25 : 250
  return Math.min(MAX, Math.max(MIN, Math.round(a / step) * step))
}
function amountToSlider(a: number): number {
  return Math.round(((Math.log(Math.max(MIN, a)) - Math.log(MIN)) / (Math.log(MAX) - Math.log(MIN))) * 1000)
}
function formatShare(x: number): string {
  const v = x * 100
  return (v >= 1 ? v.toLocaleString('fr-CA', { maximumFractionDigits: 1 }) : v.toLocaleString('fr-CA', { maximumSignificantDigits: 2 })) + ' %'
}

export default function ClaimPanel({ amounts, typicalCents, demo, isMobile, panelRef, onDraftChange, onClose }: Props) {
  const [saved] = useState(readSaved)
  const start = saved?.amount ?? (typicalCents ? typicalCents / 100 : 25)
  const [amount, setAmountState] = useState(start)
  const [amountText, setAmountText] = useState(String(start))
  const [coverFees, setCoverFees] = useState(saved?.coverFees ?? false)
  const [name, setName] = useState(saved?.name ?? '')
  const [color, setColor] = useState<string>(saved?.color ?? GLASS_COLORS[0].value)
  const [message, setMessage] = useState(saved?.message ?? '')
  const [showDetails, setShowDetails] = useState(!!saved?.message)
  const [photo, setPhoto] = useState<{ src: string | null; path: string | null }>(saved?.photo ?? { src: null, path: null })
  const photoBlob = useRef<Blob | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Couleur tirée au hasard à l'ouverture (le serveur ne peut pas faire le même tirage), sauf brouillon retrouvé
  useEffect(() => {
    if (saved) {
      try {
        sessionStorage.removeItem(DRAFT_KEY)
      } catch {}
      return
    }
    Promise.resolve().then(() => setColor(GLASS_COLORS[Math.floor(Math.random() * GLASS_COLORS.length)].value))
  }, [saved])

  const baseCents = Math.round(amount * 100)
  const feeCents = feeFor(baseCents)
  const payCents = coverFees ? baseCents + feeCents : baseCents
  const showName = name.trim().length >= 2

  // ---------- Aperçu en direct dans le vitrail ----------
  const lastGeometry = useRef('')
  const focusRef = useRef<'place' | 'detail'>('place')
  const lastContent = useRef<string | null>(null)
  const lastAmount = useRef<number | null>(null)
  useEffect(() => {
    const contentKey = [name.trim(), color, photo.src ?? '', message.trim()].join('|')
    if (lastContent.current === null) lastContent.current = contentKey
    else if (contentKey !== lastContent.current) {
      focusRef.current = 'detail'
      lastContent.current = contentKey
    }
    if (lastAmount.current !== null && baseCents !== lastAmount.current) focusRef.current = 'place'
    lastAmount.current = baseCents
    const draft: ClaimDraft = {
      name: showName ? name.trim() : null,
      color,
      photoSrc: photo.src,
      message: message.trim() || null,
      amountCents: baseCents,
      focus: focusRef.current,
    }
    const geometryKey = String(baseCents)
    const geometryChanged = geometryKey !== lastGeometry.current
    // La taille change : on attend que le curseur se pose avant de recalculer le pavage
    const timer = setTimeout(
      () => {
        lastGeometry.current = geometryKey
        onDraftChange(draft, geometryChanged)
      },
      geometryChanged ? 280 : 0,
    )
    return () => clearTimeout(timer)
  }, [name, showName, color, photo.src, message, baseCents, onDraftChange])

  // ---------- Chiffres ----------
  const total = amounts.reduce((s, a) => s + a, 0)
  const share = total + baseCents > 0 ? baseCents / (total + baseCents) : 0
  const bigger = amounts.filter(a => a < baseCents).length
  const rank = amounts.filter(a => a > baseCents).length + 1

  const setAmount = (a: number) => {
    const clamped = Math.max(MIN, Math.min(MAX, Math.round(a)))
    setAmountState(clamped)
    setAmountText(String(clamped))
  }

  // ---------- Photo : recadrée en carré et envoyée tout de suite ----------
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setPhotoBusy(true)
    try {
      const blob = await squareJpeg(file)
      photoBlob.current = blob
      const src = URL.createObjectURL(blob)
      setPhoto({ src, path: null })
      const path = await uploadPhoto(blob)
      setPhoto({ src, path })
    } catch (err) {
      setError((err as Error).message)
      setPhoto({ src: null, path: null })
    } finally {
      setPhotoBusy(false)
    }
  }

  // ---------- Paiement ----------
  const valid = amount >= MIN && amount <= MAX && (!name.trim() || showName) && !busy && !photoBusy
  const submit = async () => {
    if (!valid) return
    setBusy(true)
    setError(null)
    let channel: string | null = 'vitrail'
    try {
      channel = sessionStorage.getItem('vitrail:src') || 'vitrail'
    } catch {}
    try {
      const res = await fetch('/api/donate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: baseCents,
          coverFees,
          returnTo: 'vitrail',
          channel,
          showName,
          name: showName ? name.trim() : '',
          message: message.trim(),
          color,
          photoPath: photo.path ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur inattendue. Réessayez.')
      // Brouillon gardé pour un éventuel retour sans paiement (la photo en data URL : l'adresse blob: ne survit pas)
      try {
        const src = photo.src?.startsWith('blob:') && photoBlob.current ? await blobToDataUrl(photoBlob.current) : photo.src
        const draft: SavedDraft = { amount, coverFees, name, color, message, photo: { src, path: photo.path } }
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      } catch {}
      window.location.href = data.url
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div
      ref={panelRef}
      style={{
        // Ordinateur : ancré à droite (comme la fiche d'un morceau), le morceau est cadré à gauche.
        // Téléphone : en bas, sur la moitié de l'écran au plus, le morceau est cadré au-dessus.
        position: 'fixed',
        zIndex: 160,
        left: isMobile ? 0 : 'auto',
        right: isMobile ? 0 : '16px',
        top: isMobile ? 'auto' : '72px',
        bottom: isMobile ? 0 : 'auto',
        width: isMobile ? 'auto' : 'min(400px, calc(100% - 32px))',
        maxHeight: isMobile ? '50vh' : 'calc(100vh - 72px - 16px)',
        alignContent: 'start',
        overflowY: 'auto',
        background: 'rgba(16, 14, 23, 0.95)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: isMobile ? '16px 16px 0 0' : '14px',
        padding: isMobile ? '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))' : '18px 20px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
        backdropFilter: 'blur(10px)',
        display: 'grid',
        gap: '14px',
        color: '#fff',
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Ajouter mon morceau</h2>
        <button onClick={onClose} aria-label="Fermer" style={closeStyle}>
          ×
        </button>
      </div>

      {/* Où va le don */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ecole-mark.png" alt="" style={{ height: 30, width: 'auto', flexShrink: 0 }} />
        <span style={{ fontSize: '13px', lineHeight: 1.45, color: 'rgba(255,255,255,0.85)' }}>
          Votre don va à l&apos;<strong style={{ color: GOLD }}>{CONFIG.orgName}</strong>. {CONFIG.orgWhy}
        </span>
      </div>

      {/* ---------- Montant ---------- */}
      <div style={{ display: 'grid', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
          <label htmlFor="claim-amount-input" style={labelStyle}>
            Montant
          </label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', color: GOLD }}>
            <input
              id="claim-amount-input"
              inputMode="numeric"
              value={amountText}
              onChange={e => {
                const v = e.target.value.replace(/[^\d]/g, '')
                setAmountText(v)
                const n = parseInt(v, 10)
                if (n >= 1) setAmountState(Math.min(n, MAX))
              }}
              onBlur={() => setAmount(amount)}
              style={{
                width: `${Math.max(2, amountText.length) + 0.6}ch`,
                background: 'transparent',
                border: 0,
                borderBottom: '1px dashed rgba(251,191,36,0.4)',
                color: GOLD,
                font: "700 26px 'Space Grotesk', sans-serif",
                textAlign: 'right',
                padding: 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            <span style={{ fontSize: '26px', fontWeight: 700 }}>$</span>
          </div>
        </div>
        <input type="range" min={0} max={1000} value={amountToSlider(amount)} onChange={e => setAmount(sliderToAmount(+e.target.value))} aria-label="Montant" style={{ width: '100%', accentColor: GOLD }} />
        {amount < MIN && <p style={{ ...hintStyle, color: '#f87171' }}>Le don minimum est de {formatMoney(CONFIG.minAmountCents)}.</p>}
        {typicalCents && <p style={hintStyle}>La plupart des gens donnent {formatMoney(typicalCents)}.</p>}
        <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', color: 'rgba(255,255,255,0.75)', cursor: 'pointer' }}>
          <input type="checkbox" checked={coverFees} onChange={e => setCoverFees(e.target.checked)} style={{ accentColor: GOLD, marginTop: '2px' }} />
          <span>
            J&apos;ajoute {formatMoney(feeCents)} pour couvrir les frais de transaction : l&apos;école reçoit {formatMoney(baseCents)} au complet.
          </span>
        </label>
      </div>

      <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '5px 12px', margin: 0, fontSize: '13px' }}>
        <dt style={dtStyle}>Votre part du vitrail</dt>
        <dd style={monoStyle}>{formatShare(share)}</dd>
        <dt style={dtStyle}>Plus grand que</dt>
        <dd style={monoStyle}>
          {bigger.toLocaleString('fr-CA')} morceau{bigger > 1 ? 'x' : ''} sur {amounts.length.toLocaleString('fr-CA')}
        </dd>
        <dt style={dtStyle}>Rang</dt>
        <dd style={monoStyle}>{rank === 1 ? '1er' : `${rank.toLocaleString('fr-CA')}e`}</dd>
      </dl>

      {/* ---------- Le morceau ---------- */}
      <div style={{ display: 'grid', gap: '6px' }}>
        <span style={labelStyle}>Votre verre</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {GLASS_COLORS.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              title={c.name}
              aria-label={c.name}
              aria-pressed={color === c.value}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: c.value,
                border: color === c.value ? '2px solid #fff' : '2px solid transparent',
                boxShadow: color === c.value ? `0 0 10px ${c.value}` : 'none',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>

      <label style={{ display: 'grid', gap: '6px' }}>
        <span style={labelStyle}>Nom affiché</span>
        <input type="text" value={name} maxLength={CONFIG.nameMax} placeholder="Laissez vide pour rester anonyme" onChange={e => setName(e.target.value)} style={inputStyle} autoComplete="nickname" />
        {name.trim().length === 1 && <span style={{ fontSize: '12px', color: '#f87171' }}>Au moins 2 lettres.</span>}
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {photo.src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.src} alt="" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' }} />
        )}
        <button type="button" disabled={photoBusy} onClick={() => fileRef.current?.click()} style={secondaryStyle}>
          {photoBusy ? 'Envoi…' : photo.src ? 'Changer la photo' : 'Ajouter une photo'}
        </button>
        {photo.src && !photoBusy && (
          <button
            type="button"
            onClick={() => {
              photoBlob.current = null
              setPhoto({ src: null, path: null })
            }}
            style={linkButtonStyle}
          >
            Retirer
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} hidden />
      </div>

      <button type="button" onClick={() => setShowDetails(v => !v)} style={{ ...linkButtonStyle, justifySelf: 'start' }}>
        {showDetails ? '− Retirer le message' : '+ Ajouter un message'}
      </button>
      {showDetails && (
        <textarea value={message} maxLength={CONFIG.messageMax} rows={3} placeholder="Un mot pour l'école" onChange={e => setMessage(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
      )}
      <p style={{ ...hintStyle, marginTop: '-6px' }}>Nom, photo et message sont facultatifs et indépendants : sans nom, votre morceau est « Anonyme », avec votre photo et votre mot.</p>

      {error && <p style={{ margin: 0, fontSize: '13px', color: '#f87171' }}>{error}</p>}
      {demo && (
        <p style={{ margin: 0, padding: '8px 10px', borderRadius: '8px', fontSize: '12px', lineHeight: 1.45, color: '#fde68a', background: 'rgba(250,204,21,0.08)', border: '1px dashed rgba(250,204,21,0.45)' }}>
          Mode démo : aucune clé Stripe n&apos;est configurée. Le morceau est ajouté tout de suite, sans paiement ni courriel.
        </p>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={submit} disabled={!valid} style={{ ...goldStyle, opacity: valid ? 1 : 0.45, cursor: valid ? 'pointer' : 'not-allowed' }}>
          {busy ? 'Un instant…' : `Donner ${formatMoney(payCents)}`}
        </button>
      </div>
      <p style={{ ...hintStyle, textAlign: 'center' }}>
        Ce que vous voyez est un aperçu. Paiement sécurisé par Stripe (carte, Apple Pay, Google Pay), qui vous demandera votre courriel ; puis retour ici, sur votre morceau. Pas de reçu fiscal pour le moment.{' '}
        <Link href="/confidentialite" target="_blank" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Confidentialité
        </Link>
      </p>
    </div>
  )
}

// ---------- Styles (ceux de Pay to Exist) ----------
const labelStyle: CSSProperties = { fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }
const dtStyle: CSSProperties = { color: 'rgba(255,255,255,0.55)' }
const monoStyle: CSSProperties = { margin: 0, fontFamily: "'Space Mono', monospace", textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const hintStyle: CSSProperties = { margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }
const inputStyle: CSSProperties = {
  font: "500 15px 'Space Grotesk', sans-serif",
  color: '#fff',
  background: '#0d0b13',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  padding: '10px 12px',
  width: '100%',
  boxSizing: 'border-box',
}
const goldStyle: CSSProperties = {
  flex: 1,
  padding: '12px 16px',
  background: GOLD,
  color: '#1a1406',
  border: 0,
  borderRadius: '8px',
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
}
const secondaryStyle: CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px',
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '14px',
  cursor: 'pointer',
}
const linkButtonStyle: CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  color: 'rgba(255,255,255,0.7)',
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '13px',
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
}
const closeStyle: CSSProperties = { background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }

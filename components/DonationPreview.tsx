'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CONFIG } from '@/lib/config'
import { ensureFonts } from '@/lib/fonts'
import { ImageCache } from '@/lib/images'
import { drawScene, focusView, pieceMap, tilePieces } from '@/lib/render'
import type { Tile } from '@/lib/tiling'
import type { Piece } from '@/lib/types'

const DRAFT_ID = '__apercu__'

export interface PreviewDraft {
  /** Morceau déjà existant (donateur reconnu par lien magique) : le don l'agrandit. Null = nouveau morceau. */
  donorId: string | null
  showName: boolean
  name: string
  message: string
  /** Adresse (ou blob local) de la photo choisie. */
  photoSrc: string | null
  color: string
  amountCents: number
}

/**
 * Aperçu du morceau de verre qu'on va créer : le vrai vitrail, avec le nouveau morceau inséré à sa taille,
 * la caméra centrée dessus, son nom, son message et sa photo. Se met à jour à chaque frappe.
 */
export default function DonationPreview({ pieces, draft, size = 340 }: { pieces: Piece[]; draft: PreviewDraft; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const images = useMemo(() => new ImageCache(), [])
  const [tiles, setTiles] = useState<Map<string, Tile> | null>(null)
  const [imageVersion, setImageVersion] = useState(0)
  const [fontsVersion, setFontsVersion] = useState(0)

  useEffect(() => {
    let stopped = false
    void ensureFonts().then(() => !stopped && setFontsVersion(v => v + 1))
    return () => {
      stopped = true
    }
  }, [])

  const amount = Math.max(draft.amountCents, CONFIG.minAmountCents)
  const draftId = draft.donorId ?? DRAFT_ID
  const existing = draft.donorId ? pieces.find(p => p.id === draft.donorId) ?? null : null

  // Le vitrail tel qu'il serait avec ce don
  const hypothetical = useMemo<Piece[]>(() => {
    if (existing) return pieces.map(p => (p.id === existing.id ? { ...p, amountCents: p.amountCents + amount } : p))
    return [...pieces, { id: draftId, name: null, message: null, photoUrl: null, color: draft.color, amountCents: amount }]
  }, [pieces, existing, draftId, amount, draft.color])

  useEffect(() => {
    return images.subscribe(() => setImageVersion(v => v + 1))
  }, [images])

  // Le pavage ne se recalcule que si la taille change (pas à chaque lettre du nom), avec un court délai
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      tilePieces(hypothetical).then(t => !cancelled && setTiles(t))
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [hypothetical])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !tiles) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const map = pieceMap(hypothetical)
    if (!existing) {
      map.set(draftId, {
        color: draft.color,
        name: draft.showName ? draft.name.trim() || 'Votre nom' : null,
        message: draft.showName ? draft.message.trim() || null : null,
        photoUrl: draft.showName ? draft.photoSrc : null,
      })
    }
    drawScene(ctx, {
      tiles,
      pieces: map,
      images,
      view: focusView(tiles.get(draftId), size),
      dpr,
      width: size,
      height: size,
      focusId: draftId,
    })
  }, [tiles, hypothetical, existing, draftId, draft.color, draft.showName, draft.name, draft.message, draft.photoSrc, images, imageVersion, fontsVersion, size])

  return (
    <figure className="m-0">
      <div className="mx-auto overflow-hidden rounded-2xl" style={{ width: size, height: size, background: '#07060b', border: '1px solid var(--line)' }}>
        {tiles ? <canvas ref={ref} style={{ width: size, height: size, display: 'block' }} aria-label="Aperçu de votre morceau de verre" /> : null}
      </div>
      <figcaption className="muted mt-2 text-center text-xs">
        Aperçu de votre morceau, cerclé d&apos;or. Sa place exacte change à mesure que d&apos;autres dons arrivent.
      </figcaption>
    </figure>
  )
}

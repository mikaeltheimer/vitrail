'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageCache } from '@/lib/images'
import { drawScene, pieceMap, tilePieces, UNIVERSE_RADIUS } from '@/lib/render'
import type { Tile } from '@/lib/tiling'
import type { Piece } from '@/lib/types'

/**
 * Petit vitrail pour les pages sur téléphone. Le morceau de la personne (highlightId) est mis en valeur,
 * le reste du vitrail est assombri.
 */
export default function MiniGlass({ pieces, highlightId, size = 300 }: { pieces: Piece[]; highlightId?: string | null; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const images = useMemo(() => new ImageCache(), [])
  const [tiles, setTiles] = useState<Map<string, Tile> | null>(null)
  const [imageVersion, setImageVersion] = useState(0)

  useEffect(() => {
    return images.subscribe(() => setImageVersion(v => v + 1))
  }, [images])

  useEffect(() => {
    let cancelled = false
    tilePieces(pieces).then(t => !cancelled && setTiles(t))
    return () => {
      cancelled = true
    }
  }, [pieces])

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !tiles) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawScene(ctx, {
      tiles,
      pieces: pieceMap(pieces),
      images,
      view: { scale: (size / 2 - 4) / UNIVERSE_RADIUS, ox: size / 2, oy: size / 2 },
      dpr,
      width: size,
      height: size,
      focusId: highlightId ?? null,
    })
  }, [tiles, pieces, images, imageVersion, highlightId, size])

  return <canvas ref={ref} style={{ width: size, height: size }} className="mx-auto block" aria-label="Le vitrail de l'école" />
}

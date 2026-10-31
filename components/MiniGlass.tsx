'use client'

import { useEffect, useRef } from 'react'
import { colorMap, paintEmptyGlass, paintGlass, tilePieces, UNIVERSE_RADIUS } from '@/lib/render'
import type { Piece } from '@/lib/types'

/**
 * Petit vitrail pour les pages sur téléphone. Le morceau de la personne (highlightId) est mis en valeur,
 * le reste du vitrail est assombri.
 */
export default function MiniGlass({ pieces, highlightId, size = 300 }: { pieces: Piece[]; highlightId?: string | null; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const scale = (size / 2 - 4) / UNIVERSE_RADIUS

    tilePieces(pieces).then(tiles => {
      if (cancelled) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, (size / 2) * dpr, (size / 2) * dpr)
      if (tiles.size === 0) {
        paintEmptyGlass(ctx, scale)
        return
      }
      paintGlass(ctx, tiles, colorMap(pieces), scale)
      const mine = highlightId ? tiles.get(highlightId) : null
      if (mine?.path) {
        // Tout le reste s'assombrit, le morceau de la personne garde sa lumière et reçoit un liseré doré
        ctx.save()
        ctx.beginPath()
        ctx.rect(-UNIVERSE_RADIUS, -UNIVERSE_RADIUS, UNIVERSE_RADIUS * 2, UNIVERSE_RADIUS * 2)
        ctx.fillStyle = 'rgba(5,4,8,0.55)'
        for (const [id, t] of tiles) if (id !== highlightId && t.path) ctx.fill(t.path)
        ctx.restore()
        ctx.lineJoin = 'round'
        ctx.lineWidth = 4 / scale
        ctx.strokeStyle = '#f5c451'
        ctx.stroke(mine.path)
      }
    })
    return () => {
      cancelled = true
    }
  }, [pieces, highlightId, size])

  return <canvas ref={ref} style={{ width: size, height: size }} className="mx-auto block" aria-label="Le vitrail de l'école" />
}

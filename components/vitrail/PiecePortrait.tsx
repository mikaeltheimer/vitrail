'use client'

// Portrait d'un morceau dans les fiches : sa photo entière si le donateur en a mis une, sinon la pièce de verre
// telle qu'elle est en ce moment dans le vitrail (elle suit chaque nouveau pavage).

import { useEffect, useRef } from 'react'
import { drawGlassTile, glassColors } from '@/lib/glass'
import type { Tile } from '@/lib/tiling'

export function PiecePortrait({ id, color, photoUrl, tile, size }: { id: string; color: string; photoUrl: string | null; tile: Tile | null; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (photoUrl) return
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.height = Math.round(size * dpr)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!tile?.path) return
    const [x0, y0, x1, y1] = tile.bbox
    const scale = ((size - 8) * dpr) / Math.max(x1 - x0, y1 - y0, 1e-6)
    ctx.setTransform(scale, 0, 0, scale, (canvas.width - (x1 - x0) * scale) / 2 - x0 * scale, (canvas.height - (y1 - y0) * scale) / 2 - y0 * scale)
    drawGlassTile(ctx, tile, { colors: glassColors(color, id), sizePx: size, zoom: scale / dpr, avatar: null, reveal: 0, dim: 1, hovered: false })
  }, [id, color, photoUrl, tile, size])

  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" style={{ width: size, height: size, borderRadius: 14, objectFit: 'cover', display: 'block', boxShadow: `0 0 30px ${color}33` }} />
  }
  return <canvas ref={ref} style={{ width: size, height: size, display: 'block' }} aria-hidden />
}

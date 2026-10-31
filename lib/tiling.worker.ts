// lib/tiling.worker.ts
// Calcule le pavage hors du fil principal : la page reste fluide pendant le calcul.
import { computeTileData, mulberry32, type TilingItem, type TileData } from './tiling'

export interface TilingRequest {
  requestId: number
  items: TilingItem[]
  /** Graine pour un univers stable ; absente = univers différent à chaque calcul. */
  seed?: number
}

export interface TilingResponse {
  requestId: number
  tiles: TileData[]
  ms: number
}

self.onmessage = (e: MessageEvent<TilingRequest>) => {
  const { requestId, items, seed } = e.data
  const t0 = performance.now()
  const tiles = computeTileData(items, seed === undefined ? Math.random : mulberry32(seed))
  const response: TilingResponse = { requestId, tiles, ms: performance.now() - t0 }
  ;(self as unknown as { postMessage: (m: TilingResponse) => void }).postMessage(response)
}

// lib/tilingClient.ts
// Point d'entrée asynchrone du pavage : Web Worker si possible, sinon calcul sur le fil principal.
import { computeTileData, hydrateTiles, mulberry32, type Tile, type TilingItem } from './tiling'
import type { TilingRequest, TilingResponse } from './tiling.worker'

let worker: Worker | null = null
let workerFailed = false
let nextId = 0
const pending = new Map<number, (r: TilingResponse) => void>()

function getWorker(): Worker | null {
  if (workerFailed || typeof window === 'undefined' || typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./tiling.worker.ts', import.meta.url))
    worker.onmessage = (e: MessageEvent<TilingResponse>) => {
      const resolve = pending.get(e.data.requestId)
      pending.delete(e.data.requestId)
      resolve?.(e.data)
    }
    worker.onerror = () => {
      // Le worker ne démarre pas (ancien navigateur, CSP…) : on bascule en synchrone pour la suite
      workerFailed = true
      worker = null
      const waiting = [...pending.values()]
      pending.clear()
      waiting.forEach(resolve => resolve({ requestId: -1, tiles: [], ms: 0 }))
    }
    return worker
  } catch {
    workerFailed = true
    return null
  }
}

/**
 * Calcule le pavage. Les réponses sont toujours hydratées (Path2D) sur le fil principal.
 * Renvoie aussi la durée du calcul, utile pour surveiller la montée en charge.
 */
export async function computeTiling(items: TilingItem[], seed?: number): Promise<{ tiles: Map<string, Tile>; ms: number }> {
  const w = getWorker()
  if (w) {
    const requestId = ++nextId
    const response = await new Promise<TilingResponse>(resolve => {
      pending.set(requestId, resolve)
      const req: TilingRequest = { requestId, items, seed }
      w.postMessage(req)
    })
    // requestId -1 : le worker a échoué en route, on recalcule ici
    if (response.requestId !== -1) return { tiles: hydrateTiles(response.tiles), ms: response.ms }
  }
  const t0 = performance.now()
  const data = computeTileData(items, seed === undefined ? Math.random : mulberry32(seed))
  return { tiles: hydrateTiles(data), ms: performance.now() - t0 }
}

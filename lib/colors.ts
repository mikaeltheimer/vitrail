import { GLASS_COLORS } from './config'

/** Couleur de départ, stable pour un courriel donné (le serveur attribue la même si le donateur n'en choisit pas). */
export function defaultColorFor(email: string): string {
  let h = 2166136261
  for (let i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return GLASS_COLORS[(h >>> 0) % GLASS_COLORS.length].value
}

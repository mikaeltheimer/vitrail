import type { Piece, RecentDonation, Snapshot } from './types'

// Morceaux d'essai du vitrail de démonstration, ajoutés à l'instantané du serveur (navigateur et serveur) :
// - sur /vitrail, ceux du visiteur, gardés dans son onglet ;
// - sur /ecran, ceux de l'écran jumelé (lib/demo-screen.ts), faits par le QR de cet écran.

/** Code de séance d'un écran de la démo : 12 lettres minuscules et chiffres. */
export const SCREEN_CODE_RE = /^[a-z0-9]{12}$/

/** Morceau d'essai : un morceau du vitrail plus la date du don. */
export type ScreenPiece = Piece & { at: string }

/** Nouveau code de séance, au hasard (navigateur). */
export function newScreenCode(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
}

/** L'instantané avec les morceaux d'essai à la fin (arrivés après tous les autres) ; inchangé s'il n'y en a pas. */
export function withDemoPieces(s: Snapshot, local: readonly ScreenPiece[]): Snapshot {
  if (!local.length) return s
  const last = s.pieces.reduce((n, p) => Math.max(n, p.arrival ?? 0), 0)
  const pieces: Piece[] = local.map(({ id, name, message, question, photoUrl, color, amountCents, at }, i) => ({
    id,
    name,
    message,
    question: question ?? null,
    photoUrl,
    color,
    amountCents,
    arrival: last + i + 1,
    since: at,
  }))
  const recent: RecentDonation[] = [...local].reverse().map(p => ({ id: p.id, donorId: p.id, name: p.name, message: p.message, photoUrl: p.photoUrl, amountCents: p.amountCents, at: p.at }))
  const sum = local.reduce((n, p) => n + p.amountCents, 0)
  return {
    ...s,
    version: `${s.version}+${local.map(p => p.id).join(',')}`,
    totalCents: s.totalCents + sum,
    donationsCount: s.donationsCount + local.length,
    pieces: [...s.pieces, ...pieces],
    recent: [...recent, ...s.recent].slice(0, Math.max(s.recent.length, recent.length)),
  }
}

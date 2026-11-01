import { CONFIG } from './config'

/**
 * Montant à payer pour que l'organisme reçoive `amountCents` net, une fois les frais de carte prélevés.
 * total − (total × % + fixe) = montant  ⇒  total = (montant + fixe) / (1 − %)
 */
export function withFees(amountCents: number): number {
  return Math.ceil((amountCents + CONFIG.feeFixedCents) / (1 - CONFIG.feePercent))
}

export function feeFor(amountCents: number): number {
  return withFees(amountCents) - amountCents
}

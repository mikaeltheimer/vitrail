const whole = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
const exact = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' })

/** 2500 → « 25 $ », 1250 → « 12,50 $ ». */
export function formatMoney(cents: number): string {
  return cents % 100 === 0 ? whole.format(cents / 100) : exact.format(cents / 100)
}

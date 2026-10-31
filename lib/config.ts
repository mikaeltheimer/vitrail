// Réglages de l'édition « Vitrail de dons ». Tout ce qui se discute avec l'école est ici.

export const CONFIG = {
  orgName: "École d'art de Sutton",
  appName: 'Vitrail de dons',
  currency: 'cad',

  /** Montants en cents. Le minimum protège le don net contre les frais fixes du fournisseur de paiement. */
  minAmountCents: 500,
  maxAmountCents: 500_000,
  suggestedCents: [1000, 2500, 5000, 10000, 25000],

  /**
   * Taille d'un morceau : l'aire est proportionnelle à (montant ^ sizeExponent).
   * 1 = strictement proportionnel ; 0,5 = racine carrée (un don 100 fois plus gros ne prend que 10 fois plus de place).
   * À valider avec une vraie distribution de dons : beaucoup de petits, quelques gros.
   */
  sizeExponent: 0.5,
  /**
   * Plancher de taille, en fraction de la taille moyenne d'un morceau : un petit don ne devient jamais une poussière
   * quand le vitrail grossit. 0 = aucun plancher ; 0,4 = un morceau a au moins 40 % de la taille d'un morceau moyen.
   */
  minRelativeToMean: 0.4,

  nameMax: 30,
  messageMax: 100,
  /** Afficher les messages sur le grand écran. Dans une école, on peut le couper ici ou masquer en direct depuis l'admin. */
  showMessagesOnScreen: true,

  /** Fréquence d'interrogation du serveur par l'écran d'affichage. */
  pollMs: 3000,
} as const

/** Verres disponibles (reprend les Glow Colors de Pay to Exist). */
export const GLASS_COLORS = [
  { name: 'Rose', value: '#f472b6' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Bleu', value: '#60a5fa' },
  { name: 'Turquoise', value: '#22d3ee' },
  { name: 'Émeraude', value: '#16a34a' },
  { name: 'Lime', value: '#a3e635' },
  { name: 'Jaune', value: '#facc15' },
  { name: 'Orange', value: '#fb923c' },
  { name: 'Rouge', value: '#f87171' },
] as const

export const VALID_COLORS: string[] = GLASS_COLORS.map(c => c.value)

export const ANON_LABEL = 'Anonyme'

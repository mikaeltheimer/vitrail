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
   * 1 = strictement proportionnel, comme Pay to Exist (un don 50 fois plus gros prend 50 fois plus de place) ; 0,5 = racine carrée (seulement ~7 fois plus).
   * À valider avec une vraie distribution de dons : beaucoup de petits, quelques gros.
   */
  sizeExponent: 1,
  /**
   * Plancher de taille, en fraction de la taille moyenne d'un morceau : un petit don ne devient jamais une poussière
   * quand le vitrail grossit. 0 = aucun plancher ; 0,1 = un morceau a au moins 10 % de la taille d'un morceau moyen (simple garde-fou, il ne joue presque jamais).
   */
  minRelativeToMean: 0.1,

  /**
   * Photos : une pièce montre sa photo « peinte » (grisaille teintée par la couleur du verre) tant qu'elle est petite, puis la vraie
   * photo en couleur entre ces deux tailles (côté du carré de même aire, en px à l'écran). Pay to Exist : 220 → 380.
   * Ici plus tôt, car sur un écran de 1080p presque aucune pièce n'atteint 220 px.
   */
  photoColorFromPx: 110,
  photoColorToPx: 230,

  nameMax: 30,
  messageMax: 100,
  /** Afficher les messages sur le grand écran. Dans une école, on peut le couper ici ou masquer en direct depuis l'admin. */
  showMessagesOnScreen: true,

  /** Fréquence d'interrogation du serveur par l'écran d'affichage. */
  pollMs: 3000,
  // Visite de l'écran : un don est toujours en brillance. Repère → le morceau sort du vitrail et s'agrandit (avec l'annonce) → pause → retour → suivant.
  tourMarkMs: 1000, // le prochain morceau pulse en place avant de sortir
  tourLiftMs: 1500, // durée de la sortie (et du retour)
  tourHoldMs: 5500, // pause avec nom, message ou photo
  tourHoldBareMs: 3500, // pause pour un morceau anonyme
  tourTargetFraction: 0.3, // un petit morceau sorti occupe (rayon inscrit) cette fraction de la hauteur de l'écran
  tourMaxLift: 40, // agrandissement maximal
  // Appel à donner : toutes les `ctaEvery` mises en vedette, une pause « Faites partie du vitrail » (0 = jamais)
  ctaEvery: 6,
  ctaMs: 9000,
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

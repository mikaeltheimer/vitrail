// Réglages de la plateforme, communs à tous les organismes. L'identité de chaque organisme est en base (lib/identity.ts).

import { DEFAULT_GLASSES } from './theme'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config'

export const CONFIG = {
  appName: 'Donivers',
  /** Police des noms des donateurs : 'sans' (DM Sans) ou 'serif' (Fraunces, comme le nom Donivers). Essai : ?noms=fraunces. */
  donorNameFont: 'sans' as 'sans' | 'serif',
  /** Marque de la plateforme (fixe pour tous les organismes). Le message de l'organisme passe toujours avant. */
  brand: {
    name: 'Donivers',
    slogan: "Chaque don, un morceau d'univers.",
    studio: 'Studio Existence',
    studioUrl: 'https://studioexistence.com',
    /** Exploitant de la plateforme (fixe pour tous les organismes) : repris par la politique de confidentialité et les conditions. */
    studioLegal: {
      name: 'Studio Existence inc.',
      neq: '1181980765',
      address: '59, rue Academy, Sutton (Québec) J0E 2K0',
      email: 'mikael@studioexistence.com',
    },
  },
  currency: 'cad',

  /** Montants en cents. Le minimum protège le don net contre les frais fixes du fournisseur de paiement. */
  minAmountCents: 500,
  maxAmountCents: 500_000,
  suggestedCents: [1000, 2500, 5000, 10000, 25000],
  /** Frais de transaction couverts par le donateur, s'il le souhaite (Stripe Canada : 2,9 % + 0,30 $ par paiement par carte canadienne). */
  feePercent: 0.029,
  feeFixedCents: 30,
  /** Nombre de morceaux à partir duquel on affiche « la plupart donnent X $ » (avant, l'échantillon ne veut rien dire). */
  typicalMinDonors: 8,

  /**
   * Taille d'un morceau : l'aire est proportionnelle à (montant ^ sizeExponent).
   * 1 = strictement proportionnel (un don 50 fois plus gros prend 50 fois plus de place) ; 0,75 ≈ 19 fois ; 0,5 = racine carrée (~7 fois).
   * 0,75 retenu en attendant les vrais dons ; comparer avec ?echelle=… sur /vitrail et /ecran.
   * À valider avec une vraie distribution de dons : beaucoup de petits, quelques gros.
   */
  sizeExponent: 0.75,
  /**
   * Plancher de taille, en fraction de la taille moyenne d'un morceau : un petit don ne devient jamais une poussière
   * quand le vitrail grossit. 0 = aucun plancher ; 0,1 = un morceau a au moins 10 % de la taille d'un morceau moyen (simple garde-fou, il ne joue presque jamais).
   */
  minRelativeToMean: 0.1,

  /**
   * Photos : une pièce montre sa photo « peinte » (grisaille teintée par la couleur du verre) tant qu'elle est petite, puis la vraie
   * photo en couleur entre ces deux tailles (côté du carré de même aire, en px à l'écran).
   * Ici plus tôt, car sur un écran de 1080p presque aucune pièce n'atteint 220 px.
   */
  photoColorFromPx: 110,
  photoColorToPx: 230,

  nameMax: 30,
  /** Le témoignage (souvenir, anecdote). 500 au plus : c'est aussi la limite d'une métadonnée Stripe. */
  messageMax: 500,
  /** Sur le verre, seul le début du témoignage s'affiche (le texte complet est dans la fiche et sur l'écran). */
  glassMessageMax: 80,
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

// ── Textes de la marque ─────────────────────────────────────────────────────
// Ce que rédige l'organisme (nom, présentation, témoignage, coordonnées juridiques) est en base : lib/identity.ts.

/** La marque de la plateforme, la même pour tous les organismes. */
export interface BrandTexts {
  descriptor: string
  slogan: string
  poweredBy: string
}

export const BRAND: Record<Locale, BrandTexts> = {
  fr: { descriptor: 'La collecte de fonds qui donne un visage à votre communauté.', slogan: CONFIG.brand.slogan, poweredBy: 'Propulsé par Donivers' },
  en: { descriptor: 'Fundraising that puts a face on your community.', slogan: 'Every donation, a piece of the universe.', poweredBy: 'Powered by Donivers' },
}

export const brandFor = (locale: Locale = DEFAULT_LOCALE): BrandTexts => BRAND[locale]

/** Verres disponibles : les cinq de la palette (plus tard, ceux choisis par l'organisme). */
export const GLASS_COLORS = DEFAULT_GLASSES

export const VALID_COLORS: string[] = GLASS_COLORS.map(c => c.value)

export const ANON_LABEL = 'Anonyme'

// Réglages du Donivers de l'organisme (ici, l'École d'art de Sutton). Tout ce qui se discute avec l'organisme est ici.

import { DEFAULT_GLASSES } from './theme'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config'

export const CONFIG = {
  orgName: "École d'art de Sutton",
  orgUrl: 'https://ecoleartsutton.ca/',
  /** Présentation de l'organisme (panneau « À propos de la collecte »). */
  orgAbout:
    "L'École d'art de Sutton est un organisme à but non lucratif voué à l'éveil artistique des enfants, petits et grands, par des expériences de création. Depuis 2016, c'est aussi un centre d'art pluridisciplinaire qui fait se rencontrer artistes et enfants : explorations libres, expositions, projections, performances et résidences d'artistes en recherche-création.",
  /** Pourquoi donner : en une phrase, montrée au moment du don. */
  orgWhy:
    "L'École avance sans subvention gouvernementale : c'est sa communauté qui la fait vivre. Chaque don rend possibles ses ateliers, ses expositions et ses résidences d'artistes.",
  /** La même idée en une phrase, pour l'appel à donner du grand écran. */
  orgWhyShort: "C'est la communauté qui fait vivre l'École",
  appName: 'Donivers',
  /** Police des noms des donateurs : 'sans' (DM Sans) ou 'serif' (Fraunces, comme le nom Donivers). Essai : ?noms=fraunces. */
  donorNameFont: 'sans' as 'sans' | 'serif',
  /** Titre du vitrail de l'organisme (écran, formulaire de don). */
  vitrailTitle: 'Le vitrail de la communauté',
  /** Marque de la plateforme (fixe pour tous les organismes). Le message de l'organisme passe toujours avant. */
  brand: {
    name: 'Donivers',
    descriptor: 'La plateforme de dons de votre communauté',
    slogan: "Chaque don, un morceau d'univers.",
    poweredBy: 'Propulsé par Donivers',
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
  /**
   * Coordonnées juridiques de l'organisme, reprises par la politique de confidentialité et les conditions d'utilisation.
   * Un champ vide s'affiche « [À COMPLÉTER : …] » (surligné) : à remplir avant la mise en ligne publique.
   * Fixes pour toutes les langues ; à l'étape 3, ils passent en base avec le reste des réglages de l'organisme.
   */
  legal: {
    /** Raison sociale exacte et numéro d'entreprise du Québec (NEQ). */
    entity: '',
    /** Adresse postale. */
    address: '',
    /** Responsable de la protection des renseignements personnels : nom et titre, courriel, téléphone. */
    officerName: '',
    officerEmail: '',
    officerPhone: '',
    /** Date de la dernière mise à jour des textes juridiques (AAAA-MM-JJ). */
    updated: '',
    /** Durée de conservation des renseignements, rédigée par l'organisme. */
    retention: '',
  } as Record<'entity' | 'address' | 'officerName' | 'officerEmail' | 'officerPhone' | 'updated' | 'retention', string>,
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
  /**
   * Invitation à témoigner, propre à l'organisme : une seule question, simple, et des pistes dans le champ pour
   * inspirer. L'objectif est d'avoir le plus de témoignages possible.
   */
  testimonial: {
    question: "Pourquoi soutenez-vous l'École d'art\u00a0?",
    cta: 'Ajoutez votre témoignage.',
    placeholder: "Une anecdote, un événement qui vous a marqué, ce que l'École a changé pour vous.",
    lead: 'Votre témoignage accompagne votre morceau, ici et sur le grand écran.',
    consent: "L'École peut citer mon témoignage dans ses communications (site, réseaux, rapport annuel).",
  },
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

// ── Textes par langue ─────────────────────────────────────────────────────
// Le français vit dans CONFIG ci-dessus (champs à plat, encore lus par les écrans pas encore migrés) ; l'anglais est ici.
// Les écrans lisent ces textes par orgFor(locale) / brandFor(locale), ou par useOrg() / useBrand() (lib/useOrg.ts).
// À l'étape 3, ils passent en base, éditables par l'organisme (anglais facultatif, avec repli sur le français).

/** Ce que l'organisme rédige lui-même : nom, présentation, pourquoi donner, invitation à témoigner. */
export interface OrgTexts {
  name: string
  url: string
  about: string
  why: string
  whyShort: string
  vitrailTitle: string
  testimonial: { question: string; cta: string; placeholder: string; lead: string; consent: string }
}

/** La marque de la plateforme, la même pour tous les organismes. */
export interface BrandTexts {
  descriptor: string
  slogan: string
  poweredBy: string
}

export const ORG: Record<Locale, OrgTexts> = {
  fr: {
    name: CONFIG.orgName,
    url: CONFIG.orgUrl,
    about: CONFIG.orgAbout,
    why: CONFIG.orgWhy,
    whyShort: CONFIG.orgWhyShort,
    vitrailTitle: CONFIG.vitrailTitle,
    testimonial: { ...CONFIG.testimonial },
  },
  en: {
    name: 'Sutton School of Art',
    url: CONFIG.orgUrl,
    about:
      'Sutton School of Art is a non-profit organization devoted to awakening the artistic curiosity of children, young and old, through creative experiences. Since 2016, it has also been a multidisciplinary art centre where artists and children meet: free exploration, exhibitions, screenings, performances and artist residencies in research-creation.',
    why: 'The School runs without government funding: its community is what keeps it alive. Every donation makes its workshops, exhibitions and artist residencies possible.',
    whyShort: 'The community keeps the School alive',
    vitrailTitle: "The community's stained glass",
    testimonial: {
      question: 'Why do you support Sutton School of Art?',
      cta: 'Add your testimonial.',
      placeholder: 'A story, an event that stayed with you, what the School has changed for you.',
      lead: 'Your testimonial goes with your piece, here and on the big screen.',
      consent: 'The School may quote my testimonial in its communications (website, social media, annual report).',
    },
  },
}

export const BRAND: Record<Locale, BrandTexts> = {
  fr: { descriptor: CONFIG.brand.descriptor, slogan: CONFIG.brand.slogan, poweredBy: CONFIG.brand.poweredBy },
  en: { descriptor: "Your community's giving platform", slogan: 'Every donation, a piece of the universe.', poweredBy: 'Powered by Donivers' },
}

export const orgFor = (locale: Locale = DEFAULT_LOCALE): OrgTexts => ORG[locale]
export const brandFor = (locale: Locale = DEFAULT_LOCALE): BrandTexts => BRAND[locale]

/** Verres disponibles : les cinq de la palette (plus tard, ceux choisis par l'organisme). */
export const GLASS_COLORS = DEFAULT_GLASSES

export const VALID_COLORS: string[] = GLASS_COLORS.map(c => c.value)

export const ANON_LABEL = 'Anonyme'

// Contenu du vitrail de démonstration (voir lib/demo.ts). Tout est FICTIF : organisme, personnes, témoignages.
// Pour changer la cause, les textes ou les noms : modifier ce fichier, puis « Régénérer » dans la section Studio.
// Aucun nom de vraie personne ni de vraie entreprise : prénoms et noms de famille courants, combinés au hasard.

import type { StoredTexts } from './identity-shared'

export const DEMO_SLUG = 'demo'
export const DEMO_NAME = 'Fondation Pleine Lumière'

export const DEMO_TEXTS: StoredTexts = {
  fr: {
    name: 'Fondation Pleine Lumière',
    vitrailTitle: 'Le vitrail de la Fondation',
    why: 'La Fondation Pleine Lumière restaure les vitraux de l’ancienne église du village, devenue notre salle communautaire : concerts, ateliers pour les jeunes, repas partagés. Chaque don fait entrer un peu plus de lumière.',
    about:
      'Depuis que la paroisse nous l’a cédée, la vieille église accueille tout le village : chorale, ateliers de création pour les jeunes, marché d’hiver, soirées de contes. Ses quatorze vitraux, posés en 1911, laissent aujourd’hui passer le vent autant que la lumière.\n\nAvec un artisan verrier de la région, nous les restaurons un à un. Votre don finance le verre, le plomb et les heures de travail ; il devient aussi un morceau de ce vitrail-ci, qui grandit avec chaque personne qui s’y joint.',
    question: 'Qu’est-ce que la salle représente pour vous?',
    placeholder: 'Un concert, un atelier, un souvenir…',
  },
  en: {
    name: 'Pleine Lumière Foundation',
    vitrailTitle: 'The Foundation’s stained glass',
    why: 'The Pleine Lumière Foundation is restoring the stained glass windows of the village’s old church, now our community hall: concerts, workshops for young people, shared meals. Every donation lets in a little more light.',
    about:
      'Since the parish handed it over to us, the old church has welcomed the whole village: the choir, creative workshops for young people, a winter market, storytelling nights. Its fourteen stained glass windows, installed in 1911, now let in the wind as much as the light.\n\nWith a local glass artisan, we are restoring them one by one. Your donation pays for glass, lead and hours of work; it also becomes a piece of this stained glass, which grows with everyone who joins in.',
    question: 'What does the hall mean to you?',
    placeholder: 'A concert, a workshop, a memory…',
  },
}

export const FIRST_NAMES_FR = [
  'Camille', 'Louis', 'Émilie', 'Mathieu', 'Geneviève', 'François', 'Isabelle', 'Simon', 'Catherine', 'Olivier', 'Julie', 'Étienne',
  'Marie-Ève', 'Jean-François', 'Sophie', 'Nicolas', 'Véronique', 'Alexandre', 'Annie', 'Philippe', 'Marianne', 'Gabriel', 'Valérie', 'Samuel',
  'Chantal', 'Benoît', 'Nathalie', 'Félix', 'Josée', 'Antoine', 'Mélanie', 'Raphaël', 'Lucie', 'Hugo', 'Claudette', 'Jacques', 'Monique', 'Rémi',
  'Sylvie', 'Denis', 'Rosalie', 'Léa', 'Thomas', 'Zoé', 'Laurent', 'Suzanne', 'Gilles', 'Hélène', 'Marc-André', 'Andrée',
]
export const FIRST_NAMES_EN = [
  'Emily', 'James', 'Sarah', 'David', 'Margaret', 'Andrew', 'Laura', 'Peter', 'Helen', 'Robert', 'Claire', 'Ian', 'Ruth', 'Michael', 'Anne',
  'Graham', 'Fiona', 'Colin', 'Heather', 'Stuart', 'Joan', 'Neil', 'Alice', 'Daniel',
]
export const LAST_NAMES_FR = [
  'Tremblay', 'Gagnon', 'Roy', 'Côté', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie', 'Fortin', 'Gagné', 'Ouellet', 'Pelletier', 'Bélanger',
  'Lévesque', 'Bergeron', 'Leblanc', 'Paquette', 'Girard', 'Simard', 'Boucher', 'Caron', 'Beaulieu', 'Cloutier', 'Dubé', 'Poirier', 'Fournier',
  'Lapointe', 'Leclerc', 'Lefebvre', 'Poulin', 'Thibault', 'St-Pierre', 'Nadeau', 'Martin', 'Landry', 'Desjardins', 'Brodeur', 'Vachon',
]
export const LAST_NAMES_EN = [
  'Smith', 'Brown', 'MacDonald', 'Wilson', 'Taylor', 'Campbell', 'Stewart', 'Anderson', 'Ross', 'Murray', 'Reid', 'Fraser', 'Bishop',
  'Hughes', 'Ward', 'Bennett', 'Parker', 'Mitchell',
]

/** Témoignages en français (chacun sert au plus une fois). */
export const TESTIMONIALS_FR = [
  'Ma fille a appris la guitare dans cette salle.',
  'J’y ai chanté avec la chorale pendant vingt ans. Elle mérite sa lumière.',
  'Pour les soirées de contes de l’hiver.',
  'Nous nous y sommes mariés en 1987.',
  'Le marché d’hiver, c’est là que je vois tout le monde.',
  'Parce qu’un village a besoin d’un lieu où se retrouver.',
  'Les ateliers du samedi ont changé l’année de mon fils.',
  'Pour le vitrail du chœur, mon préféré.',
  'Mon grand-père a posé le toit de cette église.',
  'Merci aux bénévoles qui font vivre la salle.',
  'J’y ai donné mon premier concert. J’avais neuf ans.',
  'Pour que mes petits-enfants la voient pleine de couleurs.',
  'Les repas partagés du dimanche, un vrai cadeau.',
  'Un lieu chaud, même quand le vent passe par les fenêtres!',
  'Je viens d’arriver au village et on m’y a accueillie à bras ouverts.',
  'En souvenir de ma mère, qui aimait tant ces vitraux.',
  'Pour la lumière de fin d’après-midi sur les bancs.',
  'Les spectacles de fin d’année des enfants : on rit, on pleure.',
  'C’est là que j’ai rencontré mes meilleurs amis.',
  'Parce que la beauté, ça se partage.',
  'Bravo à l’artisan verrier, le premier vitrail est magnifique.',
  'Pour les soirées de jazz du vendredi.',
  'J’habite en face : je vois les vitraux chaque matin.',
  'Ma petite contribution pour un grand projet.',
  'Le cœur du village, tout simplement.',
  'Pour le club de lecture qui s’y réunit chaque mois.',
  'Les cours de danse de ma mère, à 82 ans!',
  'Je donne au nom de toute notre famille.',
  'Pour que la salle reste ouverte à tout le monde.',
  'Parce que les vieilles pierres racontent notre histoire.',
  'Mon premier don en ligne, et pas le dernier.',
  'Pour la crèche vivante de Noël.',
  'J’y ai tenu ma première exposition de peinture.',
  'Un don pour chaque année passée au village.',
  'En mémoire de Raymond, qui sonnait la cloche.',
  'Merci pour les ateliers de vitrail : j’en ai fait un à la maison!',
]

/** Testimonials in English (each used at most once). */
export const TESTIMONIALS_EN = [
  'My kids learned to sing in this hall.',
  'For the Friday jazz nights, the best in the region.',
  'We moved here last year and this is where we met our neighbours.',
  'In memory of my father, who loved the rose window.',
  'Such a beautiful building deserves its light back.',
  'For the winter market and its hot cider.',
  'The Saturday workshops are the highlight of my week.',
  'Proud to be a small piece of this.',
  'For every concert I have enjoyed here.',
  'Because a village needs a heart.',
  'Thank you to the volunteers who keep it alive.',
  'I was married here, forty years ago this spring.',
  'For the storytelling nights, in both languages.',
  'Let the light in!',
  'A gift from the whole Bennett clan.',
  'Because beauty belongs to everyone.',
  'Happy to help with the next window.',
  'The best place in town for a shared meal.',
]

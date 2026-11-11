// Contenu du vitrail de démonstration (voir lib/demo.ts). Tout est FICTIF : organisme, personnes, témoignages.
// Pour changer la cause, les textes ou les noms : modifier ce fichier, puis « Régénérer » dans la section Studio.
// Aucun nom de vraie personne ni de vraie entreprise : prénoms et noms de famille courants, combinés au hasard.

import type { StoredTexts } from './identity-shared'

export const DEMO_SLUG = 'demo'
export const DEMO_NAME = 'Centre communautaire du Village'

export const DEMO_TEXTS: StoredTexts = {
  fr: {
    name: 'Centre communautaire du Village',
    vitrailTitle: 'Gardons notre centre ouvert à tout le monde',
    why: 'Le Centre accueille tout le monde, toute l’année : repas partagés, ateliers pour les jeunes, chorale, marché d’hiver, aide aux devoirs. Vos dons gardent nos portes ouvertes et nos activités accessibles à tous les budgets.',
    about:
      'Installé dans l’ancienne école du village depuis 1978, le Centre est l’endroit où le village se retrouve : repas du dimanche, aide aux devoirs, chorale, ateliers de création pour les jeunes, marché d’hiver, soirées de contes. Une petite équipe et une soixantaine de bénévoles le font vivre.\n\nCette année, il faut refaire la toiture et le chauffage, et la demande pour les repas et l’aide aux devoirs a doublé. Votre don finance ces travaux et ces activités ; il devient aussi un morceau de ce vitrail, qui grandit avec chaque personne qui s’y joint.',
    question: 'Pourquoi soutenez-vous le Centre ?',
    question2: 'Qu’est-ce que le Centre change pour vous ?',
    question3: 'Quel souvenir gardez-vous du Centre ?',
    placeholder: 'Un atelier, un repas, un souvenir…',
  },
  en: {
    name: 'Village Community Centre',
    vitrailTitle: 'Keep our centre open to everyone',
    why: 'The Centre welcomes everyone, all year round: shared meals, workshops for young people, a choir, a winter market, homework help. Your donations keep our doors open and our activities affordable for every budget.',
    about:
      'Housed in the old village school since 1978, the Centre is where the village comes together: Sunday meals, homework help, the choir, creative workshops for young people, a winter market, storytelling nights. A small team and some sixty volunteers keep it going.\n\nThis year the roof and the heating need replacing, and demand for meals and homework help has doubled. Your donation pays for this work and these activities; it also becomes a piece of this stained glass, which grows with everyone who joins in.',
    question: 'Why do you support the Centre?',
    question2: 'What difference does the Centre make for you?',
    question3: 'What memory of the Centre stays with you?',
    placeholder: 'A workshop, a meal, a memory…',
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

/** Les questions de la démo (champs question, question2, question3), dans l'ordre : `q` dit à laquelle répond un témoignage. */
export type DemoTestimonial = { q: 1 | 2 | 3; text: string }

/** Témoignages en français, chacun en réponse à une des trois questions de la démo (chacun sert au plus une fois). Des mots,
 * des souvenirs, quelques phrases qui tiennent seules : le mélange d’une vraie collecte. */
export const TESTIMONIALS_FR: DemoTestimonial[] = [
  { q: 1, text: 'Parce qu’un village a besoin d’un lieu où se retrouver.' },
  { q: 1, text: 'Pour que personne ne mange seul le dimanche.' },
  { q: 1, text: 'Parce que ma mère y a trouvé des amies, à 80 ans.' },
  { q: 1, text: 'Le Centre m’a aidée quand j’en avais besoin. C’est mon tour.' },
  { q: 1, text: 'Pour que les ados aient un endroit à eux, le soir.' },
  { q: 1, text: 'Parce que l’aide aux devoirs a sauvé l’année de mon fils.' },
  { q: 1, text: 'Un lieu où personne n’a besoin d’être invité, ça se protège.' },
  { q: 1, text: 'Pour les bénévoles, qui ne comptent pas leurs heures.' },
  { q: 1, text: 'Je donne au nom de toute notre famille.' },
  { q: 1, text: 'Pour garder les activités gratuites, ou presque.' },
  { q: 1, text: 'Parce que c’est le cœur du village.' },
  { q: 1, text: 'Ma petite contribution pour le toit neuf.' },
  { q: 1, text: 'Parce que la musique et les fous rires, ça se partage.' },
  { q: 1, text: 'Pour les familles qui arrivent au village et ne connaissent encore personne.' },
  { q: 1, text: 'Mon premier don en ligne, et pas le dernier.' },
  { q: 1, text: 'Un don pour chaque année passée au village.' },
  { q: 1, text: 'Parce que j’y ai reçu bien plus que ce que je donne.' },
  { q: 1, text: 'Pour que les portes restent ouvertes à tout le monde, quel que soit le budget.' },
  { q: 1, text: 'En mémoire de Raymond, qui y servait la soupe chaque mercredi.' },
  { q: 1, text: 'Parce que sans lui, le village ne serait qu’une rue avec des maisons.' },
  { q: 1, text: 'Pour le chauffage. Les hivers sont longs, ici.' },
  { q: 1, text: 'Pour que mes petits-enfants y passent leurs samedis, comme moi.' },
  { q: 1, text: 'Pour remercier l’équipe de la collecte de vêtements.' },
  { q: 1, text: 'Parce qu’on ne sait jamais quand on aura besoin d’un coup de main.' },
  { q: 2, text: 'Je ne mange plus seul le dimanche.' },
  { q: 2, text: 'Mes ados ont un endroit sûr où aller après l’école.' },
  { q: 2, text: 'J’ai appris le français aux repas communautaires. Aujourd’hui, c’est moi qui accueille les nouveaux.' },
  { q: 2, text: 'Le marché d’hiver : c’est là que je vois tout le monde au moins une fois par semaine.' },
  { q: 2, text: 'Les ateliers du samedi ont changé l’année de mon fils. Il y a trouvé des amis, et un peu de confiance.' },
  { q: 2, text: 'Ma fille a appris la guitare dans la grande salle, un mardi soir après l’autre.' },
  { q: 2, text: 'Vingt ans de chorale. Une bonne raison de sortir de chez moi chaque jeudi.' },
  { q: 2, text: 'Une maison commune.' },
  { q: 2, text: 'Le club de lecture du premier jeudi. On parle des livres une demi-heure, puis de tout le reste.' },
  { q: 2, text: 'Les cours de danse de ma mère, à 82 ans !' },
  { q: 2, text: 'Une deuxième maison pour les jeunes qui n’ont pas toujours la première.' },
  { q: 2, text: 'C’est le premier endroit où je me suis sentie d’ici.' },
  { q: 2, text: 'Le comptoir de vêtements, l’hiver où on a eu besoin d’un coup de main.' },
  { q: 2, text: 'Mes premiers pas de danse en ligne, à 70 ans.' },
  { q: 2, text: 'Un endroit où on est quelqu’un, pas un client.' },
  { q: 2, text: 'Les dimanches de pluie, avec les jeux de la ludothèque.' },
  { q: 2, text: 'Je connais enfin mes voisins.' },
  { q: 2, text: 'L’atelier de poterie du mardi : mes deux heures de calme de la semaine.' },
  { q: 2, text: 'On s’y retrouve après chaque tempête pour savoir qui a besoin d’aide.' },
  { q: 2, text: 'C’est ce qui m’a fait rester ici.' },
  { q: 2, text: 'Les vendredis de jazz, à deux pas de chez moi.' },
  { q: 2, text: 'Mon fils, si timide, y a trouvé sa troupe de théâtre.' },
  { q: 2, text: 'Le café du matin avec les autres retraités. Ça fait la journée.' },
  { q: 2, text: 'La patience des bénévoles avec nos enfants turbulents.' },
  { q: 3, text: 'Notre noce en 1987, dans la grande salle. Nous y dansons encore au réveillon.' },
  { q: 3, text: 'Mon premier concert. J’avais neuf ans et les jambes en coton.' },
  { q: 3, text: 'Mon grand-père a monté la scène de ses mains. Je pense à lui chaque fois que j’entre.' },
  { q: 3, text: 'Les spectacles de fin d’année des enfants : on rit, on pleure, on applaudit trop fort.' },
  { q: 3, text: 'La soirée de contes de 2009, où j’ai rencontré mes meilleurs amis.' },
  { q: 3, text: 'Ma première exposition de peinture. Personne n’a rien acheté, tout le monde est venu.' },
  { q: 3, text: 'La grande panne de 1998. On y a dormi à quarante, autour du poêle.' },
  { q: 3, text: 'Mon fils a joué son premier rôle sur cette scène. Une réplique, et il était le plus fier du monde.' },
  { q: 3, text: 'Le bingo du mercredi : je n’ai jamais gagné, je n’en ai jamais manqué un.' },
  { q: 3, text: 'La chorale des enfants à Noël.' },
  { q: 3, text: 'Le bruit des chaises qu’on empile après la fête.' },
  { q: 3, text: 'Ma petite-fille y a chanté seule pour la première fois. Toute la salle s’est levée.' },
  { q: 3, text: 'Le bal des aînés, en mai, avec ma femme.' },
  { q: 3, text: 'Le festival des récoltes et ses tartes aux pommes.' },
  { q: 3, text: 'Des fous rires, surtout.' },
  { q: 3, text: 'Le premier concert de mon groupe. Quatorze spectateurs, dont ma tante deux fois.' },
  { q: 3, text: 'Le soir où tout le village est venu chanter pour les cent ans de notre doyenne.' },
  { q: 3, text: 'Les 18 ans de ma fille, avec tout le village comme invité.' },
  { q: 3, text: 'Le café trop fort après les assemblées.' },
  { q: 3, text: 'L’odeur de la soupe aux pois, les soirs de bénévolat.' },
  { q: 3, text: 'Les veillées de Noël, avec la crèche bricolée par les enfants.' },
  { q: 3, text: 'La première fois que mon fils a lu une histoire à voix haute, à l’heure du conte.' },
]

/** Testimonials in English, each answering one of the three demo questions (each used at most once). */
export const TESTIMONIALS_EN: DemoTestimonial[] = [
  { q: 1, text: 'Because a village needs a heart.' },
  { q: 1, text: 'Thank you to the volunteers who keep it alive.' },
  { q: 1, text: 'So that nobody has to eat alone on Sundays.' },
  { q: 1, text: 'A gift from the whole Bennett clan.' },
  { q: 1, text: 'The Centre was there for us when we needed it.' },
  { q: 1, text: 'So the teens have somewhere to go at night.' },
  { q: 1, text: 'Proud to be a small piece of this.' },
  { q: 1, text: 'Because everyone should be welcome, whatever their budget.' },
  { q: 1, text: 'Happy to help with the new roof.' },
  { q: 1, text: 'So my kids can spend their Saturdays there, like I did.' },
  { q: 2, text: 'We moved here last year. This is where we met our neighbours.' },
  { q: 2, text: 'I finally learned French, one community supper at a time.' },
  { q: 2, text: 'Saturday workshops, the highlight of my week.' },
  { q: 2, text: 'My kids learned to sing in the big hall.' },
  { q: 2, text: 'Friday jazz nights, just down the road.' },
  { q: 2, text: 'The winter market and its hot cider.' },
  { q: 2, text: 'A place where nobody needs an invitation.' },
  { q: 2, text: 'A second home for kids who need one.' },
  { q: 2, text: 'I finally know my neighbours.' },
  { q: 2, text: 'It is the reason I stayed.' },
  { q: 3, text: 'Our wedding party in the big hall, forty years ago this spring.' },
  { q: 3, text: 'Storytelling nights, in both languages.' },
  { q: 3, text: 'My daughter’s first recital. She played two wrong notes and got a standing ovation.' },
  { q: 3, text: 'A warm room during the ice storm, when nobody had power.' },
  { q: 3, text: 'Bingo on Wednesdays. I have never won, and I have never missed one.' },
  { q: 3, text: 'My first art show. Nobody bought anything, everybody came.' },
  { q: 3, text: 'Christmas carols with the children’s choir.' },
  { q: 3, text: 'The smell of coffee after choir practice.' },
  { q: 3, text: 'The harvest festival and its apple pies.' },
  { q: 3, text: 'My son’s first line on that stage. He was the proudest kid in the world.' },
]

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
    question: 'Qu’est-ce que la salle représente pour vous ?',
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

/** Témoignages en français, en réponse à la question de la démo (chacun sert au plus une fois). Des mots, des souvenirs, quelques
 * phrases qui tiennent seules : le mélange d’une vraie collecte. */
export const TESTIMONIALS_FR = [
  'Le cœur du village.',
  'Là où ma fille a appris la guitare, un mardi soir après l’autre.',
  'Vingt ans de chorale. Mes plus belles soirées, je les ai passées sous ces voûtes.',
  'Nous nous y sommes mariés en 1987, quand c’était encore l’église. Nous y dansons maintenant au réveillon.',
  'Le marché d’hiver : c’est là que je vois tout le monde au moins une fois par semaine.',
  'Un lieu où personne n’a besoin d’être invité.',
  'Les ateliers du samedi ont changé l’année de mon fils. Il y a trouvé des amis, et un peu de confiance.',
  'Le vitrail du chœur, au coucher du soleil.',
  'Mon grand-père a refait la toiture en 1954. Je pense à lui chaque fois que j’entre.',
  'Des bénévoles qui ne comptent pas leurs heures.',
  'Mon premier concert. J’avais neuf ans et les jambes en coton.',
  'L’endroit où mes petits-enfants vont grandir, j’espère.',
  'Les repas partagés du dimanche. On arrive seul, on repart avec dix voisins.',
  'La chaleur, même quand le vent passe par les fenêtres !',
  'Je venais d’arriver au village. Le premier soir, on m’a fait une place à table. Je n’oublierai pas.',
  'Ma mère. Elle s’assoyait toujours sous le vitrail bleu.',
  'La lumière de fin d’après-midi sur les bancs.',
  'Les spectacles de fin d’année des enfants : on rit, on pleure, on applaudit trop fort.',
  'C’est là que j’ai rencontré mes meilleurs amis, à la soirée de contes de 2009.',
  'Un peu de beauté qu’on ne garde pas pour soi.',
  'Le silence, entre deux répétitions.',
  'Les vendredis de jazz.',
  'J’habite en face. Les vitraux, c’est ma première vue le matin.',
  'Une maison commune.',
  'Le club de lecture du premier jeudi. On parle des livres une demi-heure, puis de tout le reste.',
  'Les cours de danse de ma mère, à 82 ans !',
  'Trois générations de notre famille y ont fêté quelque chose.',
  'Une porte toujours ouverte, que tu aies de l’argent ou non.',
  'Des pierres qui racontent notre histoire mieux que n’importe quel livre.',
  'La crèche vivante. Cette année, mon fils est le mouton.',
  'Ma première exposition de peinture. Personne n’a rien acheté, tout le monde est venu.',
  'Raymond, qui sonnait la cloche pour annoncer les soupers.',
  'L’atelier de vitrail : j’en ai fait un pour ma cuisine !',
  'Le seul endroit où mes ados acceptent encore de me suivre.',
  'Un refuge pendant la grande panne de 1998. On y a dormi à quarante.',
  'Des souvenirs de baptêmes, de mariages et de funérailles. Toute une vie, en fait.',
  'La fierté d’avoir un si beau lieu dans un si petit village.',
  'Le café trop fort après les assemblées.',
  'L’odeur du bois et de la cire.',
  'Mon fils a joué son premier rôle sur cette scène. Une réplique, et il était le plus fier du monde.',
  'Le lieu qui m’a fait rester ici.',
  'Les soirées de contes de l’hiver, avec un chocolat chaud.',
  'Le bingo du mercredi : je n’ai jamais gagné, je n’en ai jamais manqué un.',
  'La chorale des enfants à Noël.',
  'Le bruit des chaises qu’on empile après la fête.',
  'Une deuxième maison pour les jeunes qui n’ont pas toujours la première.',
  'Le premier endroit où je me suis sentie d’ici.',
  'Mon père y jouait de l’orgue. Je n’ai jamais appris, mais je reconnais encore le son des touches.',
  'Le lieu de toutes les réunions qui ont sauvé l’école du village.',
  'La lumière, littéralement.',
  'Les ateliers de poterie du mardi.',
  'On s’y retrouve après chaque tempête pour savoir qui a besoin d’aide.',
  'Ma petite-fille y a chanté seule pour la première fois. Toute la salle s’est levée.',
  'Le bal des aînés, en mai.',
  'Mes cours de français, quand je suis arrivé de Colombie. Aujourd’hui, c’est moi qui aide les nouveaux.',
  'Un clocher qu’on voit de partout, pour ne jamais se perdre.',
  'Le festival des récoltes et ses tartes aux pommes.',
  'Des fous rires, surtout.',
  'Le premier concert de mon groupe. Quatorze spectateurs, dont ma tante deux fois.',
  'Le vitrail rouge qui teinte la scène vers quatre heures.',
  'La patience des bénévoles avec nos enfants turbulents.',
  'L’endroit où le village se dit les choses importantes.',
  'Les veillées de Noël d’autrefois et celles qu’on invente maintenant.',
  'Un lieu sacré, même pour ceux qui ne croient pas.',
  'Le comptoir de vêtements, quand on a eu besoin d’un coup de main.',
  'Mes premiers pas de danse en ligne, à 70 ans.',
  'La place de mon père, troisième banc à gauche. Je m’y assois encore.',
  'Le lieu où ma fille a fêté ses 18 ans, avec tout le village comme invité.',
  'Un endroit où on est quelqu’un, pas un client.',
  'Les dimanches de pluie, avec les jeux de société de la ludothèque.',
]

/** Testimonials in English, answering the demo question (each used at most once). */
export const TESTIMONIALS_EN = [
  'The heart of the village.',
  'My kids learned to sing in this hall.',
  'Friday jazz nights, the best in the region.',
  'We moved here last year. This is where we met our neighbours.',
  'My father, who loved the rose window.',
  'A building this beautiful, shared by everyone.',
  'The winter market and its hot cider.',
  'Saturday workshops, the highlight of my week.',
  'Every concert I have heard here, and a few I have played.',
  'A place where nobody needs an invitation.',
  'I was married here, forty years ago this spring.',
  'Storytelling nights, in both languages.',
  'Light, quite literally!',
  'Three generations of the Bennett clan have celebrated something here.',
  'Where I finally learned French, one community supper at a time.',
  'The smell of old wood and coffee after choir practice.',
  'Shared meals. You come alone and leave with ten neighbours.',
  'The place that made me stay.',
  'My daughter’s first recital. She played two wrong notes and got a standing ovation.',
  'A warm room during the ice storm, when nobody had power.',
  'The quiet between rehearsals.',
  'Bingo on Wednesdays. I have never won, and I have never missed one.',
  'The red window that turns the stage pink at four o’clock.',
  'A second home for kids who need one.',
  'Where the village talks about what really matters.',
  'My first art show. Nobody bought anything, everybody came.',
  'Christmas carols with the children’s choir.',
  'Volunteers who never count their hours.',
  'Sacred ground, even for those of us who don’t pray.',
  'The bench my mother always sat on, under the blue window.',
]

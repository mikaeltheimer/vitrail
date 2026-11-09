import fr from '@/messages/fr.json'
import en from '@/messages/en.json'
import Affiche from './Affiche'

// Les textes de l'affiche dans les deux langues (l'affiche peut être bilingue, quelle que soit la langue de la page).
// Seul cet espace des messages part vers le navigateur.
export default function AffichePage() {
  return <Affiche poster={{ fr: fr.affiche.poster, en: en.affiche.poster }} />
}

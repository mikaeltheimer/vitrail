// Filtre de mots grossiers pour les noms et messages affichés sur l'écran de l'école (français, sacres québécois, anglais).
// Volontairement simple : il arrête l'évidence (y compris les variantes « f.u.c.k », « fuuuck », « 5alope »),
// pas un esprit inventif. La console admin reste le filet de sécurité.

// Mots refusés seulement quand ils forment un mot entier (pour ne pas bloquer « Calista », « Esther », « festival »…)
const WORDS = [
  // français
  'merde', 'merdique', 'putain', 'pute', 'putes', 'salope', 'salopes', 'salaud', 'connard', 'connards', 'connasse', 'conne', 'con', 'cons',
  'encule', 'enculer', 'enculee', 'encules', 'nique', 'niquer', 'ntm', 'fdp', 'bite', 'bites', 'couille', 'couilles', 'chier', 'chiant',
  'batard', 'bouffon', 'pd', 'pede', 'pedes', 'tapette', 'gouine', 'negre', 'negro', 'bougnoule', 'youpin', 'bordel', 'cul', 'trouduc',
  'branleur', 'branlette', 'pouffiasse', 'catin', 'fiotte', 'zizi', 'teub', 'chatte',
  // sacres québécois
  'tabarnak', 'tabarnac', 'tabernak', 'tabarnouche', 'calisse', 'caliss', 'calice', 'crisse', 'criss', 'ostie', 'osti', 'hostie', 'esti', 'estie',
  'ciboire', 'sacrament', 'sacrement', 'viarge', 'mautadit', 'maudit',
  // anglais
  'fuck', 'fucker', 'fucking', 'fucked', 'fck', 'fk', 'shit', 'shitty', 'bitch', 'bitches', 'cunt', 'dick', 'dicks', 'cock', 'cocks', 'pussy',
  'whore', 'slut', 'sluts', 'asshole', 'ass', 'bastard', 'wanker', 'twat', 'prick', 'nigger', 'nigga', 'niggas', 'faggot', 'fag', 'retard', 'porn',
  'porno', 'sex', 'sexy', 'nazi', 'hitler', 'kkk', 'wtf', 'stfu', 'milf', 'boobs', 'tits', 'penis', 'vagina', 'anal', 'cum', 'rape',
]

// Racines refusées même collées à d'autres lettres (« fuckyou », « tabarnaque ») : choisies pour ne jamais apparaître dans un mot normal
const STEMS = ['fuck', 'nigg', 'fagg', 'tabarn', 'tabern', 'caliss', 'salope', 'encul', 'connard', 'connass', 'pouffiass', 'motherf', 'bitch', 'putain', 'asshole', 'bougnoul']

const WORD_SET = new Set(WORDS)

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b', '+': 't' }

/** Minuscules, sans accents, chiffres « leet » remplacés, lettres répétées réduites (« fuuuuck » → « fuck »). */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0-9!@$+]/g, c => LEET[c] ?? c)
    .replace(/(.)\1{2,}/g, '$1')
}

/** Vrai si le texte contient un mot qui ne peut pas être affiché. */
export function isProfane(text: string): boolean {
  const n = normalize(text)
  // Mots entiers (séparés par tout ce qui n'est pas une lettre)
  for (const w of n.split(/[^a-z]+/)) if (w && WORD_SET.has(w)) return true
  // Lettres espacées ou pointées (« f u c k », « s.a.l.o.p.e ») : on les recolle
  const glued = n.replace(/[^a-z]/g, '')
  for (const s of STEMS) if (glued.includes(s)) return true
  // Lettres doublées (« fuuck », « sallope ») : seulement pour les racines sans lettre double (sinon « Calista » ressemblerait à « caliss »)
  const squeezed = glued.replace(/(.)\1+/g, '$1')
  for (const s of STEMS) if (!/(.)\1/.test(s) && squeezed.includes(s)) return true
  return false
}

'use client'

// La question du témoignage au moment de l'écrire : une des questions de l'organisme, tirée au hasard, et un lien
// « Une autre question » qui passe à la suivante (puis revient à la première). Le lien n'existe que s'il y a plus
// d'une question. La question montrée est celle qu'on enregistre avec le témoignage.

import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'

/**
 * `initial` : la question déjà associée au témoignage (page du donateur), gardée si elle fait encore partie des questions ;
 * sinon une question au hasard. Le tirage se fait après le montage (le serveur ne peut pas faire le même).
 */
export function useQuestionPicker(questions: readonly string[], initial?: string | null) {
  // Nouveau tirage quand la liste ou la question d'origine change (celle-ci arrive après le chargement sur la page du donateur)
  const key = `${questions.join('\u0000')}\u0001${initial ?? ''}`
  const [index, setIndex] = useState(() => Math.max(0, initial ? questions.indexOf(initial) : 0))
  useEffect(() => {
    const at = initial ? questions.indexOf(initial) : -1
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tirage au hasard après l'hydratation, une seule fois par liste
    setIndex(at >= 0 ? at : Math.floor(Math.random() * Math.max(1, questions.length)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la liste est comparée par son contenu (key)
  }, [key])
  const question = questions[index % Math.max(1, questions.length)] ?? questions[0] ?? ''
  return { question, canChange: questions.length > 1, next: () => setIndex(i => (i + 1) % questions.length) }
}

/** Le lien « Une autre question », sous le champ du témoignage. */
export function AnotherQuestion({ onClick, style }: { onClick: () => void; style?: CSSProperties }) {
  const t = useTranslations('commun')
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        justifySelf: 'start',
        alignSelf: 'flex-start',
        background: 'none',
        border: 0,
        padding: '2px 0',
        color: '#F0B24A',
        fontSize: '16px',
        fontWeight: 600,
        textDecoration: 'underline',
        textUnderlineOffset: '3px',
        textDecorationColor: 'rgba(240,178,74,0.45)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        ...style,
      }}
    >
      <span aria-hidden>↻ </span>
      {t('autreQuestion')}
    </button>
  )
}

'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useAtelier, type EditTarget } from './Atelier'

/**
 * Un élément personnalisable de la page. Hors de l'atelier (ou hors du mode « Modifier »), il rend son contenu tel quel.
 * En mode « Modifier » : pointillé doré, crayon, et un clic ouvre son éditeur (au lieu de l'action habituelle).
 * `empty` : ce qu'on montre à la place d'un contenu vide (ex. présentation pas encore écrite), en mode Modifier seulement.
 */
export default function Editable({ field, children, block, empty, style }: { field: EditTarget; children?: ReactNode; block?: boolean; empty?: ReactNode; style?: CSSProperties }) {
  const atelier = useAtelier()
  const t = useTranslations('atelier')
  if (!atelier?.editing) return <>{children}</>
  const Tag = block ? 'div' : 'span'
  return (
    <Tag
      role="button"
      tabIndex={0}
      aria-label={t('modifierChamp', { champ: t(`champs.${field}`) })}
      title={t('modifierChamp', { champ: t(`champs.${field}`) })}
      onClickCapture={e => {
        e.preventDefault()
        e.stopPropagation()
        atelier.open(field)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          atelier.open(field)
        }
      }}
      style={{
        position: 'relative',
        display: block ? 'block' : 'inline-flex',
        alignItems: 'center',
        gap: 'inherit',
        outline: '1.5px dashed rgba(240,178,74,0.85)',
        outlineOffset: 3,
        borderRadius: 6,
        cursor: 'pointer',
        ...style,
      }}
    >
      {children || empty}
      <span aria-hidden style={{ position: 'absolute', top: -10, right: -10, width: 20, height: 20, borderRadius: 999, background: '#F0B24A', color: '#1A1208', fontSize: 11, display: 'grid', placeItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
        ✎
      </span>
    </Tag>
  )
}

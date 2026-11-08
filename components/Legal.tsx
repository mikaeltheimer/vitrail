// Briques des pages juridiques (/confidentialite, /conditions) : mise en page, passages à compléter et balises des messages.
// Les textes viennent de messages/*.json (espaces confidentialite et conditions) ; les coordonnées de l'organisme, de la base (Mon vitrail).

/* eslint-disable react/display-name -- fonctions de rendu de balises next-intl, pas des composants */
import type { ReactNode } from 'react'
import Link from 'next/link'
import type { LegalInfo } from '@/lib/identity-shared'

/** Passage à remplir par l'organisme : surligné, avec son intitulé. */
export function Todo({ children, label }: { children: ReactNode; label: string }) {
  return (
    <mark style={{ background: 'rgba(240,178,74,0.25)', color: 'inherit', padding: '0 0.2em', borderRadius: '0.2em' }}>
      [{label} : {children}]
    </mark>
  )
}

type Chunks = ReactNode

/**
 * Balises utilisables dans les messages juridiques (t.rich) :
 * <b>, <todo> (passage à compléter), <terms> / <privacy> (liens vers l'autre texte),
 * et une balise par coordonnée juridique de l'organisme (<entity>, <address>, <officerName>, <officerEmail>, <officerPhone>,
 * <updated>, <retention>) : elle affiche la valeur si elle est renseignée, sinon le passage à compléter décrit entre les balises.
 * `todoLabel` : « À COMPLÉTER » / « TO COMPLETE ».
 */
export function legalTags(todoLabel: string, legal: LegalInfo, retentionDefault: string) {
  const field = (key: keyof LegalInfo) => (chunks: Chunks) => (legal[key] ? <span style={{ whiteSpace: 'pre-line' }}>{legal[key]}</span> : <Todo label={todoLabel}>{chunks}</Todo>)
  return {
    b: (chunks: Chunks) => <b>{chunks}</b>,
    todo: (chunks: Chunks) => <Todo label={todoLabel}>{chunks}</Todo>,
    terms: (chunks: Chunks) => (
      <Link href="/conditions" className="underline">
        {chunks}
      </Link>
    ),
    privacy: (chunks: Chunks) => (
      <Link href="/confidentialite" className="underline">
        {chunks}
      </Link>
    ),
    // Raison sociale, suivie du NEQ ou du numéro d'organisme de bienfaisance s'il est donné
    entity: (chunks: Chunks) => (legal.entity ? <span>{legal.neq ? `${legal.entity}, ${legal.neq}` : legal.entity}</span> : <Todo label={todoLabel}>{chunks}</Todo>),
    address: field('address'),
    officerName: field('officerName'),
    officerEmail: (chunks: Chunks) =>
      legal.officerEmail ? <a href={`mailto:${legal.officerEmail}`} className="underline">{legal.officerEmail}</a> : <Todo label={todoLabel}>{chunks}</Todo>,
    officerPhone: field('officerPhone'),
    updated: field('updated'),
    // Vide : la phrase par défaut de la plateforme
    retention: () => <span style={{ whiteSpace: 'pre-line' }}>{legal.retention || retentionDefault}</span>,
  }
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

export function Items({ children }: { children: ReactNode }) {
  return <ul className="mt-2 list-disc space-y-1 pl-5">{children}</ul>
}

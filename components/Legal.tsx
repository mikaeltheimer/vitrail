// Briques des pages juridiques (/confidentialite, /conditions) : mise en page, passages à compléter et balises des messages.
// Les textes viennent de messages/*.json (espaces confidentialite et conditions) ; les coordonnées de l'organisme, de CONFIG.legal.

/* eslint-disable react/display-name -- fonctions de rendu de balises next-intl, pas des composants */
import type { ReactNode } from 'react'
import Link from 'next/link'
import { CONFIG } from '@/lib/config'

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
 * et une balise par coordonnée de CONFIG.legal (<entity>, <address>, <officerName>, <officerEmail>, <officerPhone>,
 * <updated>, <retention>) : elle affiche la valeur si elle est renseignée, sinon le passage à compléter décrit entre les balises.
 * `todoLabel` : « À COMPLÉTER » / « TO COMPLETE ».
 */
export function legalTags(todoLabel: string) {
  const field = (key: keyof typeof CONFIG.legal) => (chunks: Chunks) => (CONFIG.legal[key] ? CONFIG.legal[key] : <Todo label={todoLabel}>{chunks}</Todo>)
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
    entity: field('entity'),
    address: field('address'),
    officerName: field('officerName'),
    officerEmail: (chunks: Chunks) =>
      CONFIG.legal.officerEmail ? <a href={`mailto:${CONFIG.legal.officerEmail}`} className="underline">{CONFIG.legal.officerEmail}</a> : <Todo label={todoLabel}>{chunks}</Todo>,
    officerPhone: field('officerPhone'),
    updated: field('updated'),
    retention: field('retention'),
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

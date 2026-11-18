'use client'

import type { ReactNode } from 'react'

// Mise en page de /don et de « Mon fragment » (Mika, 18 nov.). Sur ordinateur (≥ 1 024 px) : deux colonnes, l'en-tête
// et l'aperçu du fragment à gauche (fixes pendant le défilement, pour voir le fragment changer en remplissant le
// formulaire), le formulaire à droite. Sur téléphone : une colonne, l'aperçu au-dessus du formulaire.
export default function DonLayout({ aside, children, footer }: { aside: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-6 lg:max-w-[1140px] lg:px-10 lg:pt-12">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-start lg:gap-14">
        <aside className="lg:sticky lg:top-10">{aside}</aside>
        <div className="min-w-0">{children}</div>
      </div>
      {footer}
    </main>
  )
}

/** Aperçu à 300 px sur téléphone, 340 sur tablette, 440 sur ordinateur. */
export function previewSize(width: number): number {
  return width >= 1024 ? 440 : width >= 640 ? 340 : 300
}

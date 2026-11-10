'use client'

import { createContext, useContext } from 'react'
import type { Identity } from '@/lib/identity-shared'
import type { Surface } from '@/lib/hosts'

// Identité de l'organisme de la page, fournie par le gabarit racine (app/layout.tsx) : lue en base par le serveur.
// Hors organisme (vitrine, inscription, Studio), elle est absente.

// brandHref : la vitrine de Donivers, avec la provenance (?ref=<organisme>) ; lien de la signature « propulsé par ».
const Ctx = createContext<{ identity: Identity | null; surface: Surface; brandHref: string | null }>({ identity: null, surface: 'platform', brandHref: null })

export function OrgIdentityProvider({ identity, surface, brandHref = null, children }: { identity: Identity | null; surface: Surface; brandHref?: string | null; children: React.ReactNode }) {
  return <Ctx.Provider value={{ identity, surface, brandHref }}>{children}</Ctx.Provider>
}

export function useIdentityContext() {
  return useContext(Ctx)
}

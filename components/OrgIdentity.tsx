'use client'

import { createContext, useContext } from 'react'
import type { Identity } from '@/lib/identity-shared'
import type { Surface } from '@/lib/hosts'

// Identité de l'organisme de la page, fournie par le gabarit racine (app/layout.tsx) : lue en base par le serveur.
// Hors organisme (vitrine, inscription, Studio), elle est absente.

const Ctx = createContext<{ identity: Identity | null; surface: Surface }>({ identity: null, surface: 'platform' })

export function OrgIdentityProvider({ identity, surface, children }: { identity: Identity | null; surface: Surface; children: React.ReactNode }) {
  return <Ctx.Provider value={{ identity, surface }}>{children}</Ctx.Provider>
}

export function useIdentityContext() {
  return useContext(Ctx)
}

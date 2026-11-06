'use client'

import { useRouter } from 'next/navigation'

// Connecté, mais pas membre de l'organisme de cette adresse : on le dit, et on propose les siens.
export default function NoAccess({ orgName, email, orgs }: { orgName: string; email: string; orgs: { id: string; name: string; url: string }[] }) {
  const router = useRouter()
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Pas d&apos;accès ici</h1>
      <p className="muted mt-2 text-sm">
        Vous êtes connecté avec {email}, qui ne fait pas partie de l&apos;équipe de {orgName}. Pour y accéder, demandez une invitation au propriétaire.
      </p>
      {orgs.length > 0 && (
        <div className="mt-6 space-y-2">
          <p className="text-sm">Vos organismes :</p>
          {orgs.map(o => (
            <a key={o.id} className="btn btn-ghost block" href={o.url}>
              {o.name}
            </a>
          ))}
        </div>
      )}
      <button
        className="btn btn-ghost mt-6"
        onClick={async () => {
          await fetch('/api/admin/login', { method: 'DELETE' })
          router.refresh()
        }}
      >
        Me déconnecter
      </button>
    </main>
  )
}

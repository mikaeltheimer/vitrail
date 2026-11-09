'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import AuthFrame from '@/components/AuthFrame'

// Connecté, mais pas membre de l'organisme de cette adresse : on le dit, et on propose les siens.
export default function NoAccess({ orgName, email, orgs }: { orgName: string; email: string; orgs: { id: string; name: string; url: string }[] }) {
  const router = useRouter()
  const t = useTranslations('acces.pasAcces')
  return (
    <AuthFrame>
      <h1 className="m-0 text-2xl font-bold">{t('titre')}</h1>
      <p className="muted mt-2 text-sm">{t('texte', { email, org: orgName })}</p>
      {orgs.length > 0 && (
        <div className="mt-6 space-y-2">
          <p className="text-sm">{t('vosOrganismes')}</p>
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
        {t('deconnexion')}
      </button>
    </AuthFrame>
  )
}

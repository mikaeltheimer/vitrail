'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useConsole } from './useConsole'
import { Icon, RED, GREEN } from './ui'
import Accueil from './Accueil'
import Dons from './Dons'
import Moderation from './Moderation'
import Diffuser from './Diffuser'
import Plus from './Plus'
import LanguageSwitch from '@/components/LanguageSwitch'

export type Tab = 'accueil' | 'dons' | 'moderation' | 'diffuser' | 'plus'
const TABS: Tab[] = ['accueil', 'dons', 'moderation', 'diffuser', 'plus']

// Console de l'organisme, rangée par tâche (Accueil, Dons, Modération, Diffuser, Plus). Pensée pour le téléphone :
// barre d'onglets en bas sur petit écran, en haut sur grand écran. Le bénévole n'a pas « Plus » (Mon vitrail, Réglages).
// L'onglet est dans l'adresse (#dons) : un lien ou un retour arrière ramène au même endroit.
export default function Console() {
  const t = useTranslations('console')
  const c = useConsole()
  const { data } = c
  const owner = data?.me.role === 'owner'
  const [tab, setTabState] = useState<Tab>('accueil')
  const [donorId, setDonorId] = useState<string | null>(null)
  const [cashOpen, setCashOpen] = useState(false)

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as Tab
      setTabState(TABS.includes(h) ? h : 'accueil')
    }
    const first = setTimeout(read, 0)
    window.addEventListener('hashchange', read)
    window.addEventListener('popstate', read)
    return () => {
      clearTimeout(first)
      window.removeEventListener('hashchange', read)
      window.removeEventListener('popstate', read)
    }
  }, [])
  const setTab = (next: Tab) => {
    window.history.pushState(null, '', next === 'accueil' ? window.location.pathname : `#${next}`)
    setTabState(next)
    window.scrollTo({ top: 0 })
  }

  // Ce qui attend l'équipe dans la file de modération (le chiffre de la pastille)
  const pending = useMemo(() => {
    if (!data) return 0
    const photos = data.donors.filter(d => d.photo_url && d.photo_status === 'pending').length
    const messages = data.donors.filter(d => d.message && d.message_status === 'pending').length
    const reported = new Set(data.reports.map(r => r.donor_id)).size
    return photos + messages + reported
  }, [data])

  const visible = TABS.filter(x => x !== 'plus' || owner)
  const label: Record<Tab, string> = { accueil: t('onglets.accueil'), dons: t('onglets.dons'), moderation: t('onglets.moderation'), diffuser: t('onglets.diffuser'), plus: t('onglets.plus') }
  const icon: Record<Tab, 'accueil' | 'dons' | 'moderation' | 'diffuser' | 'plus'> = { accueil: 'accueil', dons: 'dons', moderation: 'moderation', diffuser: 'diffuser', plus: 'plus' }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 md:pb-12">
      {data?.org.practice && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(165,107,217,0.18)', border: '1px solid rgba(165,107,217,0.6)' }} role="note">
          <span>
            <b>{t('entrainement.bandeau')}</b> {t('entrainement.bandeauAide')}
          </span>
          {data.switchUrl && (
            <a href={data.switchUrl} className="chip !px-3 !text-[var(--text)]">
              {t('entrainement.quitter')}
            </a>
          )}
        </div>
      )}
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="muted text-xs tracking-wide">{owner || !data ? t('titre') : t('titreBenevole')}</p>
          <h1 className="truncate text-xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            {data?.org.name ?? '…'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {data && !data.org.practice && data.switchUrl && (
            <a href={data.switchUrl} className="chip hidden !px-3 text-sm !text-[var(--text)] sm:inline-flex">
              {t('entrainement.ouvrir')}
            </a>
          )}
          {data && <Account data={data} />}
        </div>
      </header>

      <nav
        aria-label={t('navigation')}
        className="fixed inset-x-0 bottom-0 z-40 grid border-t md:static md:mt-4 md:flex md:gap-2 md:border-0"
        style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`, background: 'var(--panel)', borderColor: 'var(--line)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {visible.map(x => (
          <button
            key={x}
            aria-current={tab === x ? 'page' : undefined}
            onClick={() => setTab(x)}
            className={`console-row relative flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] md:min-h-0 md:flex-row md:rounded-xl md:px-4 md:py-2 md:text-sm ${tab === x ? '' : 'hover:!text-[var(--text)]'}`}
            style={{ color: tab === x ? 'var(--accent)' : 'var(--muted)', fontWeight: tab === x ? 700 : 500, background: 'transparent' }}
          >
            <Icon name={icon[x]} />
            {label[x]}
            {x === 'moderation' && pending > 0 && (
              <span
                aria-label={t('enAttente', { count: pending })}
                className="absolute left-1/2 top-1 rounded-full px-1.5 text-[10px] font-bold md:static md:ml-1"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)', lineHeight: '16px' }}
              >
                {pending}
              </span>
            )}
          </button>
        ))}
      </nav>

      {c.toast && (
        <p role="status" className="card fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md !p-3 text-sm md:bottom-6" style={{ borderColor: c.toast.ok ? GREEN : RED }}>
          {c.toast.text}
        </p>
      )}

      <main className="mt-5">
        {c.loadError && <p style={{ color: RED }}>{t('chargementImpossible', { erreur: c.loadError })}</p>}
        {!data && !c.loadError && <p className="muted">{t('chargement')}</p>}
        {data && tab === 'accueil' && <Accueil data={data} setTab={setTab} openDonor={id => { setDonorId(id); setTab('dons') }} openCash={() => { setCashOpen(true); setTab('dons') }} open={c.open} />}
        {data && tab === 'dons' && <Dons data={data} act={c.act} donorId={donorId} setDonorId={setDonorId} cashOpen={cashOpen} setCashOpen={setCashOpen} />}
        {data && tab === 'moderation' && <Moderation data={data} act={c.act} notify={c.notifyDonor} setNotify={c.setNotifyDonor} />}
        {data && tab === 'diffuser' && <Diffuser data={data} />}
        {data && tab === 'plus' && owner && <Plus data={data} act={c.act} open={c.open} />}
      </main>
    </div>
  )
}

/** Compte connecté : nom, rôle, autres organismes, déconnexion. */
function Account({ data }: { data: NonNullable<ReturnType<typeof useConsole>['data']> }) {
  const t = useTranslations('console')
  const [openMenu, setOpenMenu] = useState(false)
  const initials = (data.me.name || data.me.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('')
  return (
    <div className="relative">
      <button
        className="console-row h-11 w-11 rounded-full border text-[15px] font-semibold"
        style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}
        aria-label={t('compte.menu')}
        aria-expanded={openMenu}
        onClick={() => setOpenMenu(!openMenu)}
      >
        {initials}
      </button>
      {openMenu && (
        <div className="card absolute right-0 top-12 z-50 w-64 space-y-3 !p-4 text-sm">
          <p>
            <b>{data.me.name || data.me.email}</b>
            <span className="muted block">{data.me.email}</span>
            <span className="muted block">{data.me.role === 'owner' ? t('roles.owner') : t('roles.volunteer')}</span>
          </p>
          {data.orgs.length > 0 && (
            <div className="space-y-1">
              <p className="muted text-xs">{t('compte.autres')}</p>
              {data.orgs.map(o => (
                <a key={o.id} href={o.url} className="block underline">
                  {o.name}
                </a>
              ))}
            </div>
          )}
          <p>
            <LanguageSwitch style={{ textDecoration: 'underline' }} />
          </p>
          <button
            className="btn btn-ghost w-full"
            onClick={async () => {
              await fetch('/api/admin/login', { method: 'DELETE' })
              window.location.reload()
            }}
          >
            {t('compte.deconnexion')}
          </button>
        </div>
      )}
    </div>
  )
}

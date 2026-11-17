'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useConsole } from './useConsole'
import { Icon, RED, GREEN } from './ui'
import Accueil from './Accueil'
import Dons, { type DonsView } from './Dons'
import Moderation from './Moderation'
import Diffuser from './Diffuser'
import Plus, { SCREENS, needsAttention, type Screen } from './Plus'
import LanguageSwitch from '@/components/LanguageSwitch'
import { TermsScreen, laterKey, readLater } from './Conditions'
import Compte from './Compte'

export type Tab = 'accueil' | 'dons' | 'moderation' | 'diffuser' | 'plus'
const TABS: Tab[] = ['accueil', 'dons', 'moderation', 'diffuser', 'plus']

// Console de l'organisme, rangée par tâche (Accueil, Dons, Modération, Diffuser, Réglages). Pensée pour le téléphone :
// barre d'onglets en bas sur petit écran, en haut sur tablette, menu latéral fixe sur ordinateur (pleine page, 17 nov.). Le bénévole n'a pas Réglages (identifiant « plus »).
// L'onglet est dans l'adresse (#dons, #dons/donateurs, #plus/juridique) : un lien ou un retour arrière ramène au même endroit.
// Les filtres du journal des dons suivent un « ? » (#dons?periode=hier) ; Journal.tsx les lit et les écrit.
export default function Console() {
  const t = useTranslations('console')
  const c = useConsole()
  const { data } = c
  const owner = data?.me.role === 'owner'
  const [tab, setTabState] = useState<Tab>('accueil')
  const [screen, setScreen] = useState<Screen | null>(null)
  const [donorId, setDonorId] = useState<string | null>(null)
  const [cashOpen, setCashOpen] = useState(false)
  const [donsView, setDonsView] = useState<DonsView>('journal')
  // Filtres du journal gardés pendant un passage par « Donateurs »
  const journalQuery = useRef('')
  // Nouvelles conditions à accepter (propriétaire) : plein écran, sauf si « Plus tard » a déjà été choisi dans cet onglet
  const termsVersion = owner && data?.terms && !data.terms.accepted ? data.terms.version : null
  // Lu après le premier rendu (sessionStorage n'existe pas côté serveur) : rien ne s'affiche avant de savoir
  const [later, setLater] = useState<{ version: string; later: boolean } | null>(null)
  useEffect(() => {
    if (!termsVersion) return
    const id = setTimeout(() => setLater({ version: termsVersion, later: readLater(termsVersion) }), 0)
    return () => clearTimeout(id)
  }, [termsVersion])
  const showTerms = !!data && !!termsVersion && later?.version === termsVersion && !later.later

  useEffect(() => {
    const read = () => {
      const [path] = window.location.hash.slice(1).split('?')
      const [h, sub] = path.split('/') as [Tab, string | undefined]
      setTabState(TABS.includes(h) ? h : 'accueil')
      setScreen(h === 'plus' && sub && SCREENS.includes(sub as Screen) ? (sub as Screen) : null)
      setDonsView(h === 'dons' && sub === 'donateurs' ? 'donateurs' : 'journal')
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
  const setTab = (next: Tab, sub: Screen | null = null) => {
    // Les filtres du journal survivent à un passage par un autre onglet
    if (tab === 'dons' && donsView === 'journal') journalQuery.current = window.location.hash.split('?')[1] ?? ''
    const query = next === 'dons' && journalQuery.current ? `?${journalQuery.current}` : ''
    window.history.pushState(null, '', next === 'accueil' ? window.location.pathname : `#${next}${next === 'plus' && sub ? `/${sub}` : ''}${query}`)
    setTabState(next)
    setScreen(next === 'plus' ? sub : null)
    if (next === 'dons') setDonsView('journal')
    window.scrollTo({ top: 0 })
  }
  const setView = (v: DonsView) => {
    if (v === donsView) return
    if (v === 'donateurs') journalQuery.current = window.location.hash.split('?')[1] ?? ''
    window.history.pushState(null, '', v === 'donateurs' ? '#dons/donateurs' : `#dons${journalQuery.current ? `?${journalQuery.current}` : ''}`)
    setDonsView(v)
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
  const icon: Record<Tab, string> = { accueil: 'accueil', dons: 'dons', moderation: 'moderation', diffuser: 'diffuser', plus: 'reglages' }
  const attention = !!data && owner && needsAttention(data)

  // État du vitrail (pastille du menu latéral), comme sur l'Accueil
  const stateKey = !data ? null : data.org.practice ? 'etatEntrainement' : data.org.status === 'draft' ? 'etatBrouillon' : data.mode === 'demo' ? 'etatDemo' : data.mode === 'off' ? 'etatFerme' : 'etatEnLigne'
  const stateColor = data?.mode === 'stripe' ? GREEN : data?.mode === 'demo' ? 'var(--accent)' : RED
  const badges = (x: Tab, side: boolean) => (
    <>
      {x === 'plus' && attention && <span aria-hidden="true" className={side ? 'ml-auto h-2 w-2 rounded-full' : 'absolute left-[calc(50%+8px)] top-2.5 h-2 w-2 rounded-full md:static md:ml-0.5'} style={{ background: 'var(--accent)' }} />}
      {x === 'moderation' && pending > 0 && (
        <span
          aria-label={t('enAttente', { count: pending })}
          className={side ? 'ml-auto rounded-full px-2 text-xs font-bold' : 'absolute left-1/2 top-1 rounded-full px-1.5 text-[10px] font-bold md:static md:ml-1'}
          style={{ background: 'var(--accent)', color: 'var(--on-accent)', lineHeight: side ? '18px' : '16px' }}
        >
          {pending}
        </span>
      )}
    </>
  )

  // Ordinateur (≥ 1024 px) : menu latéral fixe et contenu en pleine largeur. Tablette : onglets en haut. Téléphone : barre en bas.
  return (
    <div className="lg:flex lg:min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[248px] flex-none flex-col gap-6 overflow-y-auto border-r px-4 py-6 lg:flex" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}>
        <div className="space-y-1 px-2">
          <p className="muted text-xs tracking-wide">{owner || !data ? t('titre') : t('titreBenevole')}</p>
          <p className="text-xl font-semibold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {data?.org.name ?? '…'}
          </p>
          {stateKey && (
            <p className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: stateColor }}>
              <span className="h-2 w-2 rounded-full" style={{ background: stateColor }} />
              {t(`accueil.${stateKey}`)}
            </p>
          )}
        </div>
        <nav aria-label={t('navigation')} className="flex flex-col gap-0.5">
          {visible.map(x => (
            <button
              key={x}
              aria-current={tab === x ? 'page' : undefined}
              onClick={() => setTab(x)}
              className={`console-row flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-left text-[15px] ${tab === x ? '' : 'hover:!text-[var(--text)]'}`}
              style={{ color: tab === x ? 'var(--text)' : 'var(--muted)', fontWeight: tab === x ? 700 : 500, background: tab === x ? 'rgba(240,178,74,0.12)' : 'transparent' }}
            >
              <Icon name={icon[x]} size={20} color={tab === x ? 'var(--accent)' : 'currentColor'} />
              {label[x]}
              {badges(x, true)}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-0.5 border-t pt-4 text-sm" style={{ borderColor: 'var(--line)' }}>
          <a href="/ecran" target="_blank" rel="noopener" className="console-row flex min-h-[40px] items-center gap-3 rounded-xl px-3 !text-[var(--muted)] hover:!text-[var(--text)]">
            <Icon name="ecran" size={18} />
            <span className="flex-1">{t('accueil.ouvrirEcran')}</span>
            <Icon name="externe" size={14} />
          </a>
          {data && (
            <a href={data.vitrailUrl} target="_blank" rel="noopener" className="console-row flex min-h-[40px] items-center gap-3 rounded-xl px-3 !text-[var(--muted)] hover:!text-[var(--text)]">
              <Icon name="globe" size={18} />
              <span className="flex-1">{data.org.practice ? t('accueil.voirEntrainement') : t('accueil.voirVitrail')}</span>
              <Icon name="externe" size={14} />
            </a>
          )}
          {data && !data.org.practice && data.switchUrl && (
            <a href={data.switchUrl} className="console-row flex min-h-[40px] items-center gap-3 rounded-xl px-3 !text-[var(--muted)] hover:!text-[var(--text)]">
              <Icon name="pinceau" size={18} />
              <span className="flex-1">{t('entrainement.ouvrir')}</span>
            </a>
          )}
          {data && (
            <div className="pt-3">
              <Account data={data} side onChanged={() => void c.load()} />
            </div>
          )}
        </div>
      </aside>

      <div className="mx-auto w-full min-w-0 max-w-3xl flex-1 px-4 pb-28 pt-5 md:pb-12 lg:max-w-[1320px] lg:px-10 lg:pb-16 lg:pt-9">
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
        <header className="flex items-center justify-between gap-3 lg:hidden">
          <div className="min-w-0">
            <p className="muted text-xs tracking-wide">{owner || !data ? t('titre') : t('titreBenevole')}</p>
            <p className="truncate text-xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
              {data?.org.name ?? '…'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data && !data.org.practice && data.switchUrl && (
              <a href={data.switchUrl} className="chip hidden !px-3 text-sm !text-[var(--text)] sm:inline-flex">
                {t('entrainement.ouvrir')}
              </a>
            )}
            {data && <Account data={data} onChanged={() => void c.load()} />}
          </div>
        </header>

        <nav
          aria-label={t('navigation')}
          className="fixed inset-x-0 bottom-0 z-40 grid border-t md:static md:mt-4 md:flex md:gap-2 md:border-0 lg:hidden"
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
              {badges(x, false)}
            </button>
          ))}
        </nav>

        {c.toast && (
          <p role="status" className="card fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md !p-3 text-sm md:bottom-6" style={{ borderColor: c.toast.ok ? GREEN : RED }}>
            {c.toast.text}
          </p>
        )}

        {showTerms && data && (
          <TermsScreen
            data={data}
            act={c.act}
            onLater={() => {
              try {
                sessionStorage.setItem(laterKey(termsVersion!), '1')
              } catch {}
              setLater({ version: termsVersion!, later: true })
            }}
          />
        )}

        <div className="md:mt-6 lg:mt-0">
          <h1 className="sr-only text-[26px] font-semibold leading-tight md:not-sr-only lg:text-[34px]" style={{ fontFamily: 'var(--font-display)' }}>
            {label[tab]}
          </h1>
          <p className="muted mt-1 hidden max-w-2xl text-[15px] md:block">{t(`pages.${tab}`)}</p>
        </div>

        <main className="mt-5 lg:mt-7">
          {c.loadError && <p style={{ color: RED }}>{t('chargementImpossible', { erreur: c.loadError })}</p>}
          {!data && !c.loadError && <p className="muted">{t('chargement')}</p>}
          {data && tab === 'accueil' && <Accueil data={data} act={c.act} setTab={setTab} openDonor={id => { setDonorId(id); setTab('dons') }} openCash={() => { setCashOpen(true); setTab('dons') }} open={c.open} />}
          {data && tab === 'dons' && <Dons data={data} act={c.act} donorId={donorId} setDonorId={setDonorId} cashOpen={cashOpen} setCashOpen={setCashOpen} view={donsView} setView={setView} />}
          {data && tab === 'moderation' && <Moderation data={data} act={c.act} notify={c.notifyDonor} setNotify={c.setNotifyDonor} />}
          {data && tab === 'diffuser' && <Diffuser data={data} />}
          {data && tab === 'plus' && owner && <Plus data={data} act={c.act} open={c.open} onError={text => c.setToast({ ok: false, text })} screen={screen} go={s => setTab('plus', s)} />}
        </main>
      </div>
    </div>
  )
}

/** Compte connecté : nom, rôle, autres organismes, déconnexion. */
function Account({ data, side = false, onChanged }: { data: NonNullable<ReturnType<typeof useConsole>['data']>; side?: boolean; onChanged: () => void }) {
  const t = useTranslations('console')
  const [openMenu, setOpenMenu] = useState(false)
  const [compte, setCompte] = useState(false)
  const initials = (data.me.name || data.me.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('')
  return (
    <div className="relative">
      {side ? (
        // Menu latéral : initiales, nom et rôle ; le menu s'ouvre vers le haut
        <button className="console-row flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left" style={{ background: 'transparent' }} aria-label={t('compte.menu')} aria-expanded={openMenu} onClick={() => setOpenMenu(!openMenu)}>
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border text-[13px] font-semibold" style={{ borderColor: 'var(--line)' }}>
            {initials}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold">{data.me.name || data.me.email}</span>
            <span className="muted text-xs">{data.me.role === 'owner' ? t('roles.owner') : t('roles.volunteer')}</span>
          </span>
        </button>
      ) : (
        <button
          className="console-row h-11 w-11 rounded-full border text-[15px] font-semibold"
          style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}
          aria-label={t('compte.menu')}
          aria-expanded={openMenu}
          onClick={() => setOpenMenu(!openMenu)}
        >
          {initials}
        </button>
      )}
      {openMenu && (
        <div className={`card absolute z-50 space-y-3 !p-4 text-sm ${side ? 'inset-x-0 bottom-14' : 'right-0 top-12 w-64'}`}>
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
          <button className="btn btn-ghost w-full" onClick={() => (setOpenMenu(false), setCompte(true))}>
            {t('compte.menu')}
          </button>
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
      {compte && <Compte onClose={() => setCompte(false)} onChanged={onChanged} />}
    </div>
  )
}

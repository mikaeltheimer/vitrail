'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Act, ConsoleData, Role } from './types'
import { GREEN, Icon, RED, Section, useDay, useTime } from './ui'
import { CourrielsForm, JuridiqueForm, SiteWebForm, useIdentity, type Identity } from './MonVitrail'
import Adresse from './Adresse'

// Réglages (propriétaire seulement) : un menu groupé, chaque ligne affiche son état et ouvre son propre écran
// (#plus/juridique…), avec un retour au menu. Décision du 12 novembre 2026 : cinq onglets, pas un sixième ; le menu
// accueille les ajouts à venir (forfait, exports, Pro) sans redevenir un long défilement.
// Dans l'atelier : seulement « Repartir à neuf » et le retour à la console de l'organisme.

export type Screen = 'adresse' | 'juridique' | 'equipe' | 'courriels' | 'paiements' | 'demo'
export const SCREENS: Screen[] = ['adresse', 'juridique', 'equipe', 'courriels', 'paiements', 'demo']

/** Ce qui demande une action dans Réglages (le point sur l'onglet et sur les lignes). */
export function needsAttention(data: ConsoleData): boolean {
  if (data.org.practice) return false
  return data.identityMissing.length > 0 || !data.stripe.ready || data.bounces.length > 0
}

export default function Plus({
  data,
  act,
  open,
  onError,
  screen,
  go,
}: {
  data: ConsoleData
  act: Act
  open: (action: string, sameTab?: boolean) => Promise<void>
  onError: (text: string) => void
  screen: Screen | null
  go: (screen: Screen | null) => void
}) {
  if (data.org.practice) return <Practice data={data} act={act} />
  return <Settings data={data} act={act} open={open} onError={onError} screen={screen} go={go} />
}

function Settings({ data, act, open, onError, screen, go }: Parameters<typeof Plus>[0]) {
  const t = useTranslations('console.reglages')
  const { identity, reload } = useIdentity()
  if (!screen) return <Menu data={data} identity={identity} go={go} />
  const title = t(`ecrans.${screen}`)
  return (
    <div className="space-y-4">
      <button className="muted flex items-center gap-1 text-sm hover:!text-[var(--text)]" onClick={() => go(null)}>
        <Icon name="retour" size={16} />
        {t('retour')}
      </button>
      <h2 className="text-lg font-bold">{title}</h2>
      {screen === 'adresse' && (
        <div className="space-y-6">
          {data.address && <Adresse address={data.address} onError={onError} />}
          {identity && <SiteWebForm identity={identity} reload={reload} />}
        </div>
      )}
      {screen === 'juridique' && identity && <JuridiqueForm identity={identity} reload={reload} />}
      {screen === 'courriels' && (
        <div className="space-y-6">
          {identity && <CourrielsForm identity={identity} reload={reload} />}
          <Journal />
        </div>
      )}
      {screen === 'equipe' && data.team && <Team team={data.team} meId={data.me.accountId} act={act} />}
      {screen === 'paiements' && <Paiements data={data} act={act} open={open} />}
      {screen === 'demo' && <DemoData data={data} act={act} />}
      {!identity && (screen === 'adresse' || screen === 'juridique' || screen === 'courriels') && <p className="card muted text-sm">{t('chargement')}</p>}
    </div>
  )
}

type Row = { key: string; icon: string; title: string; status: string; attention?: boolean; onClick?: () => void; href?: string }

function Menu({ data, identity, go }: { data: ConsoleData; identity: Identity | null; go: (s: Screen) => void }) {
  const t = useTranslations('console.reglages')
  const day = useDay()
  const missing = data.identityMissing.length
  const members = data.team?.members.length ?? 0
  const invites = data.team?.invitations.length ?? 0
  const demo = data.demoDonations ?? 0
  const sender = identity ? identity.senderName || identity.orgName : data.org.name

  const groups: { key: 'vitrail' | 'organisme' | 'argent' | 'donnees'; rows: Row[] }[] = [
    {
      key: 'vitrail',
      rows: [
        // L'atelier existe pour tout organisme réel ; la ligne s'efface seulement s'il manque (données incomplètes)
        ...(data.atelierUrl ? [{
          key: 'atelier',
          icon: 'pinceau',
          title: t('lignes.atelier'),
          status: identity?.pending ? t('etats.atelierEnAttente') : identity?.publishedAt ? t('etats.atelierPublie', { date: day(identity.publishedAt) }) : data.published ? t('etats.atelierPublieSansDate') : t('etats.atelierJamais'),
          attention: !!identity?.pending,
          href: data.atelierUrl,
        }] : []),
        { key: 'adresse', icon: 'globe', title: t('lignes.adresse'), status: data.address ? `${data.address.current}.${data.address.domain}` : '', onClick: () => go('adresse') },
      ],
    },
    {
      key: 'organisme',
      rows: [
        { key: 'juridique', icon: 'document', title: t('lignes.juridique'), status: missing ? t('etats.juridiqueManque', { count: missing }) : t('etats.juridiqueComplet'), attention: missing > 0, onClick: () => go('juridique') },
        { key: 'equipe', icon: 'equipe', title: t('lignes.equipe'), status: invites ? t('etats.equipeInvitations', { count: members, invites }) : t('etats.equipe', { count: members }), onClick: () => go('equipe') },
        {
          key: 'courriels',
          icon: 'courriel',
          title: t('lignes.courriels'),
          status: data.bounces.length ? t('etats.courrielsRebonds', { count: data.bounces.length }) : t('etats.courrielsExpediteur', { name: sender }),
          attention: data.bounces.length > 0,
          onClick: () => go('courriels'),
        },
      ],
    },
    {
      key: 'argent',
      rows: [
        {
          key: 'paiements',
          icon: 'carte',
          title: t('lignes.paiements'),
          status: data.stripe.ready ? t('etats.stripePret') : data.stripe.accountId ? t('etats.stripeATerminer') : t('etats.stripeNonConnecte'),
          attention: !data.stripe.ready,
          onClick: () => go('paiements'),
        },
      ],
    },
    ...(demo > 0 ? [{ key: 'donnees' as const, rows: [{ key: 'demo', icon: 'donnees', title: t('lignes.demo'), status: t('etats.demo', { count: demo }), onClick: () => go('demo') }] }] : []),
  ]

  return (
    <div className="space-y-5">
      {groups.map(g => (
        <section key={g.key} className="space-y-2" aria-labelledby={`reglages-${g.key}`}>
          <h2 id={`reglages-${g.key}`} className="muted px-1 text-xs font-semibold uppercase tracking-wide">
            {t(`groupes.${g.key}`)}
          </h2>
          <ul className="card !p-0">
            {g.rows.map((r, i) => {
              const inner = (
                <>
                  <Icon name={r.icon} size={20} color="var(--muted)" />
                  <span className="min-w-0 flex-1">
                    <span className="block">{r.title}</span>
                    <span className="muted block truncate text-[13px]" style={{ color: r.attention ? 'var(--accent)' : undefined }}>
                      {r.status}
                    </span>
                  </span>
                  {r.attention && <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full" style={{ background: 'var(--accent)' }} />}
                  <Icon name={r.href ? 'externe' : 'chevron'} size={18} color="var(--muted)" />
                </>
              )
              const cls = `console-row flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] !text-[var(--text)] ${i ? 'border-t' : ''}`
              return (
                <li key={r.key} style={{ borderColor: 'var(--line)' }} className={i ? 'border-t' : ''}>
                  {r.href ? (
                    <a href={r.href} className={cls.replace('border-t', '')}>
                      {inner}
                    </a>
                  ) : (
                    <button onClick={r.onClick} className={cls.replace('border-t', '')}>
                      {inner}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Paiements({ data, act, open }: { data: ConsoleData; act: Act; open: (action: string, sameTab?: boolean) => Promise<void> }) {
  const t = useTranslations('console.plus')
  const ready = data.stripe.ready
  return (
    <div className="card space-y-3 text-sm">
      <p>
        {t('stripeEtat')}{' '}
        <b style={{ color: ready ? GREEN : 'var(--accent)' }}>{ready ? t('stripePret') : data.stripe.accountId ? t('stripeATerminer') : t('stripeNonConnecte')}</b>
      </p>
      <p className="muted text-xs">{data.mode === 'stripe' ? t('modeStripe') : data.mode === 'demo' ? t('modeDemo') : t('modeFerme')}</p>
      <div className="flex flex-wrap gap-2">
        {!ready && (
          <button className="btn" onClick={() => void open('connectStripe', true)}>
            {data.stripe.accountId ? t('terminerStripe') : t('connecterStripe')}
          </button>
        )}
        {ready && (
          <button className="btn btn-ghost" onClick={() => void open('stripeDashboard')}>
            {t('tableauStripe')}
          </button>
        )}
        {data.stripe.accountId && (
          <button className="btn btn-ghost" onClick={() => void act({ action: 'refreshStripe' }, t('stripeVerifie'))}>
            {t('verifierStripe')}
          </button>
        )}
      </div>
    </div>
  )
}

/** Supprimer les dons de démonstration (organisme réel) ou vider l'atelier (tous ses dons fictifs). */
function DemoData({ data, act }: { data: ConsoleData; act: Act }) {
  const t = useTranslations('console.plus')
  const practice = data.org.practice
  return (
    <div className="card space-y-3 text-sm">
      <p className="muted">{practice ? t('viderAide') : t('purgeAide')}</p>
      <button
        className="btn btn-ghost"
        onClick={() => {
          if (confirm(practice ? t('viderConfirmer') : t('purgeConfirmer'))) void act({ action: 'purgeDemo' }, practice ? t('viderOk') : t('purgeOk'))
        }}
      >
        {practice ? t('vider') : t('purge')}
      </button>
    </div>
  )
}

/** L'atelier : on y personnalise le vitrail ; ici, seulement repartir à neuf et revenir à la console de l'organisme. */
function Practice({ data, act }: { data: ConsoleData; act: Act }) {
  const t = useTranslations('console.monVitrail')
  const tp = useTranslations('console.plus')
  return (
    <div className="space-y-6">
      <div className="card space-y-3 text-sm">
        <p className="muted">{t('dansAtelier')}</p>
        {data.switchUrl && (
          <a className="btn btn-ghost" href={data.switchUrl}>
            {t('ouvrirReel')}
          </a>
        )}
      </div>
      <Section title={tp('viderTitre')}>
        <DemoData data={data} act={act} />
      </Section>
    </div>
  )
}

function Team({ team, meId, act }: { team: NonNullable<ConsoleData['team']>; meId: string; act: Act }) {
  const t = useTranslations('console.equipe')
  const tr = useTranslations('console.roles')
  const tl = useTranslations('commun.langue')
  const day = useDay()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('volunteer')
  // Langue du courriel d'invitation et de la page d'acceptation (par défaut, celle de la console)
  const [lang, setLang] = useState<'fr' | 'en'>(useLocale() === 'en' ? 'en' : 'fr')
  return (
    <div className="card space-y-3 text-sm">
        <p className="muted text-xs">{t('aide')}</p>
        <ul className="space-y-2">
          {team.members.map(m => (
            <li key={m.accountId} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate">{m.name || m.email}</span>
                <span className="muted block truncate text-xs">
                  {m.email} · {tr(m.role)}
                </span>
              </span>
              {m.accountId !== meId && (
                <button
                  className="chip !px-3 text-xs"
                  onClick={() => {
                    if (confirm(t('retirerConfirmer', { email: m.email }))) void act({ action: 'removeMember', accountId: m.accountId }, t('retire'))
                  }}
                >
                  {t('retirer')}
                </button>
              )}
            </li>
          ))}
          {team.invitations.map(i => (
            <li key={i.id} className="flex items-center justify-between gap-2">
              <span className="muted min-w-0 text-xs">
                <span className="block truncate">{i.email}</span>
                {t('enAttente', { role: tr(i.role), date: day(i.expiresAt) })}
              </span>
              <button className="chip !px-3 text-xs" onClick={() => void act({ action: 'revokeInvitation', invitationId: i.id }, t('annulee'))}>
                {t('annuler')}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async e => {
            e.preventDefault()
            if (await act({ action: 'inviteMember', email, role, locale: lang }, t('envoyee', { email }))) setEmail('')
          }}
        >
          <input className="field min-w-0 basis-full sm:basis-auto sm:flex-1" type="email" placeholder={t('courriel')} value={email} onChange={e => setEmail(e.target.value)} required aria-label={t('courriel')} />
          <select className="field !w-auto" value={role} onChange={e => setRole(e.target.value as Role)} aria-label={t('role')}>
            <option value="volunteer">{tr('volunteer')}</option>
            <option value="owner">{tr('owner')}</option>
          </select>
          <select className="field !w-auto" value={lang} onChange={e => setLang(e.target.value === 'en' ? 'en' : 'fr')} aria-label={t('langue')}>
            <option value="fr" lang="fr">{tl('fr')}</option>
            <option value="en" lang="en">{tl('en')}</option>
          </select>
          <button className="btn">{t('inviter')}</button>
        </form>
    </div>
  )
}

interface JournalData {
  available: boolean
  counts: Record<string, number>
  rows: { id: string; created_at: string; to_email: string; kind: string; status: string; error: string | null }[]
}

/** Journal des courriels envoyés par la plateforme pour cet organisme (reçus, liens, rappels, avis, invitations). */
function Journal() {
  const t = useTranslations('console.courriels')
  const time = useTime()
  const [j, setJ] = useState<JournalData | null>(null)
  const [show, setShow] = useState(false)
  const load = useCallback(() => {
    fetch('/api/admin/journal', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(setJ)
      .catch(() => setJ(null))
  }, [])
  useEffect(() => {
    const id = requestAnimationFrame(load)
    return () => cancelAnimationFrame(id)
  }, [load])
  const bad = (s: string) => ['bounced', 'complained', 'failed'].includes(s)
  const problems = j ? Object.entries(j.counts).filter(([k]) => bad(k)).reduce((s, [, n]) => s + n, 0) : 0
  return (
    <Section
      title={t('titre')}
      aside={
        <button className="muted text-xs underline" onClick={load}>
          {t('actualiser')}
        </button>
      }
    >
      <div className="card space-y-2 text-sm">
        {!j && <p className="muted">{t('indisponible')}</p>}
        {j && (
          <>
            <p className="muted">
              {Object.entries(j.counts)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => `${n} ${t(`statut.${k}` as 'statut.sent').toLowerCase()}`)
                .join(' · ') || t('aucun')}
            </p>
            {problems > 0 && <p style={{ color: RED }}>{t('aVerifier', { count: problems })}</p>}
            {j.rows.length > 0 && (
              <button className="chip !px-3" aria-expanded={show} onClick={() => setShow(!show)}>
                {show ? t('masquerListe') : t('voirListe', { count: j.rows.length })}
              </button>
            )}
            {show && (
              <ul className="space-y-2">
                {j.rows.map(r => (
                  <li key={r.id} className="border-t pt-2" style={{ borderColor: 'var(--line)' }}>
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{r.to_email}</span>
                      <b className="text-xs" style={{ color: bad(r.status) ? RED : undefined }}>
                        {t(`statut.${r.status}` as 'statut.sent')}
                      </b>
                    </div>
                    <div className="muted text-xs">
                      {t(`type.${r.kind}` as 'type.receipt')} · {time(r.created_at)}
                    </div>
                    {bad(r.status) && <div className="mt-1 text-xs">{t('aide')}</div>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Section>
  )
}

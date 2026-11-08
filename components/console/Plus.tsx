'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { Act, ConsoleData, Role } from './types'
import { GREEN, RED, Section, useDay, useTime } from './ui'
import MonVitrail from './MonVitrail'

// « Plus » (propriétaire seulement) : Mon vitrail, puis les réglages : paiements, équipe, courriels, données.
export default function Plus({ data, act, open }: { data: ConsoleData; act: Act; open: (action: string, sameTab?: boolean) => Promise<void> }) {
  const t = useTranslations('console.plus')
  const ready = data.stripe.ready
  return (
    <div className="space-y-6">
      <MonVitrail switchUrl={data.switchUrl} />

      {!data.org.practice && <Section title={t('paiements')}>
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
      </Section>}

      {data.team && !data.org.practice && <Team team={data.team} meId={data.me.accountId} act={act} />}

      <Journal />

      <Section title={data.org.practice ? t('viderTitre') : t('donnees')}>
        <div className="card space-y-3 text-sm">
          <p className="muted">{data.org.practice ? t('viderAide') : t('purgeAide')}</p>
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (confirm(data.org.practice ? t('viderConfirmer') : t('purgeConfirmer'))) void act({ action: 'purgeDemo' }, data.org.practice ? t('viderOk') : t('purgeOk'))
            }}
          >
            {data.org.practice ? t('vider') : t('purge')}
          </button>
        </div>
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
    <Section title={t('titre')}>
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
          <input className="field min-w-0 flex-1" type="email" placeholder={t('courriel')} value={email} onChange={e => setEmail(e.target.value)} required aria-label={t('courriel')} />
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
    </Section>
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

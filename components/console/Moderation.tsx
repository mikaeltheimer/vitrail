'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { askConfirm } from '@/components/ConfirmDialog'
import { isQuotable, shownTestimonials, signatureOf } from '@/lib/testimonials'
import type { Act, ConsoleData } from './types'
import { GREEN, Section, useAgo, useDay } from './ui'

// Modération : photos et témoignages en attente, signalements. Une décision = un geste. Le donateur est prévenu par
// courriel (sauf si la case est décochée : pourriel, abus). Mode : publication immédiate, ou après approbation.
// Puis tous les témoignages affichés (Mika, 18 nov.) : relire sans attendre un signalement, et savoir lesquels
// l'organisme peut citer (filtre, copie, export).
export default function Moderation({ data, act, notify, setNotify, openDonor }: { data: ConsoleData; act: Act; notify: boolean; setNotify: (v: boolean) => void; openDonor: (id: string) => void }) {
  const t = useTranslations('console.moderation')
  const ago = useAgo()
  const photos = data.donors.filter(d => d.photo_url && d.photo_status === 'pending')
  const messages = data.donors.filter(d => d.message && d.message_status === 'pending')
  const byDonor = new Map<string, { reasons: string[]; at: string }>()
  for (const r of data.reports) {
    const cur = byDonor.get(r.donor_id) ?? { reasons: [], at: r.created_at }
    if (r.reason) cur.reasons.push(r.reason)
    byDonor.set(r.donor_id, cur)
  }
  const donorById = new Map(data.donors.map(d => [d.id, d]))
  const empty = photos.length + messages.length + byDonor.size === 0

  return (
    <div className="space-y-6">
      <section className="card space-y-3 text-sm lg:max-w-3xl">
        <b>{t('mode')}</b>
        <div className="flex flex-wrap gap-2">
          <button className="chip !px-3" aria-pressed={data.photoModeration === 'live'} onClick={() => void act({ action: 'setPhotoModeration', mode: 'live' }, t('modeImmediatOk'))}>
            {t('immediat')}
          </button>
          <button className="chip !px-3" aria-pressed={data.photoModeration === 'moderation'} onClick={() => void act({ action: 'setPhotoModeration', mode: 'moderation' }, t('modeApprobationOk'))}>
            {t('approbation')}
          </button>
        </div>
        <p className="muted text-xs">{data.photoModeration === 'live' ? t('immediatAide') : t('approbationAide')}</p>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={notify} onChange={e => setNotify(e.target.checked)} />
          <span>{t('prevenir')}</span>
        </label>
      </section>

      {empty && <p className="card muted text-sm">{t('vide')}</p>}

      {photos.length > 0 && (
        <Section title={t('photos', { count: photos.length })}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {photos.map(d => (
              <div key={d.id} className="card space-y-2 !p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.photo_url!} alt={t('photoDe', { nom: d.display_name || t('anonyme') })} className="aspect-square w-full rounded-lg object-cover" />
                <p className="truncate text-xs">{d.display_name || t('anonyme')}</p>
                <div className="grid grid-cols-2 gap-1">
                  <button className="chip !px-2 text-sm" onClick={() => void act({ action: 'approvePhoto', donorId: d.id }, t('photoPubliee'))}>
                    {t('publier')}
                  </button>
                  <button className="chip !px-2 text-sm" onClick={() => void act({ action: 'removePhoto', donorId: d.id }, t('photoRefusee'))}>
                    {t('refuser')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {messages.length > 0 && (
        <Section title={t('temoignages', { count: messages.length })}>
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {messages.map(d => (
              <div key={d.id} className="card space-y-2 text-sm">
                <p className="italic">« {d.message} »</p>
                <p className="muted text-xs">— {d.display_name || t('anonyme')}</p>
                <div className="flex gap-2">
                  <button className="chip !px-3" onClick={() => void act({ action: 'approveMessage', donorId: d.id }, t('temoignagePublie'))}>
                    {t('publier')}
                  </button>
                  <button className="chip !px-3" onClick={() => void act({ action: 'removeMessage', donorId: d.id }, t('temoignageRefuse'))}>
                    {t('refuser')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {byDonor.size > 0 && (
        <Section title={t('signalements', { count: byDonor.size })}>
          {[...byDonor.entries()].map(([donorId, r]) => {
            const d = donorById.get(donorId)
            return (
              <div key={donorId} className="card space-y-2 text-sm">
                <p>
                  <b>{d?.display_name || t('anonyme')}</b> <span className="muted">· {ago(r.at)}</span>
                </p>
                {d?.message && <p className="italic">« {d.message} »</p>}
                {r.reasons.length > 0 && <p className="muted text-xs">{t('raisons', { raisons: r.reasons.join(' · ') })}</p>}
                <div className="flex flex-wrap gap-2">
                  <button className="chip !px-3" onClick={async () => (await act({ action: 'hideDonor', donorId, hidden: true })) && act({ action: 'resolveReports', donorId }, t('masque'))}>
                    {t('masquer')}
                  </button>
                  <button className="chip !px-3" onClick={async () => (await act({ action: 'scrubDonor', donorId })) && act({ action: 'resolveReports', donorId }, t('efface'))}>
                    {t('effacer')}
                  </button>
                  <button className="chip !px-3" onClick={() => void act({ action: 'resolveReports', donorId }, t('classe'))}>
                    {t('sansSuite')}
                  </button>
                </div>
              </div>
            )
          })}
        </Section>
      )}

      <Testimonials data={data} act={act} openDonor={openDonor} />
    </div>
  )
}

function Testimonials({ data, act, openDonor }: { data: ConsoleData; act: Act; openDonor: (id: string) => void }) {
  const t = useTranslations('console.temoignages')
  const tm = useTranslations('console.moderation')
  const day = useDay()
  const owner = data.me.role === 'owner'
  const [filter, setFilter] = useState<'tous' | 'citables'>('tous')
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const all = useMemo(() => shownTestimonials(data.donors), [data.donors])
  const quotable = all.filter(isQuotable)
  const needle = q.trim().toLocaleLowerCase()
  const list = (filter === 'citables' ? quotable : all).filter(d => !needle || `${d.display_name ?? ''} ${d.message ?? ''}`.toLocaleLowerCase().includes(needle))

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(c => (c === id ? null : c)), 2000)
    } catch {
      // Presse-papiers refusé (navigateur, iframe) : rien à faire, le texte reste sélectionnable
    }
  }

  return (
    <Section title={t('titre', { count: all.length })}>
      <p className="muted max-w-3xl text-sm">{t('regle')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t('filtre')} className="inline-flex gap-1 rounded-xl border p-1" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,0.03)' }}>
          <button className="chip !border-0 !px-3 !py-1.5 text-sm" aria-pressed={filter === 'tous'} onClick={() => setFilter('tous')}>
            {t('tous', { count: all.length })}
          </button>
          <button className="chip !border-0 !px-3 !py-1.5 text-sm" aria-pressed={filter === 'citables'} onClick={() => setFilter('citables')}>
            {t('citables', { count: quotable.length })}
          </button>
        </div>
        <input className="field !w-auto min-w-[200px] flex-1 !py-2 md:max-w-xs" type="search" placeholder={t('chercher')} aria-label={t('chercher')} value={q} onChange={e => setQ(e.target.value)} />
        {owner && (filter === 'tous' ? all : quotable).length > 0 && (
          <a className="chip !px-3 text-sm !text-[var(--text)]" href={`/api/admin/export?type=temoignages${filter === 'citables' ? '&filtre=citables' : ''}`}>
            {filter === 'citables' ? t('exporterCitables') : t('exporter')}
          </a>
        )}
      </div>

      {list.length === 0 ? (
        <p className="card muted text-sm">{all.length === 0 ? t('aucun') : filter === 'citables' && !needle ? t('aucunCitable') : t('aucunResultat')}</p>
      ) : (
        <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {list.map(d => {
            const ok = isQuotable(d)
            const sig = signatureOf(d)
            const photo = d.photo_url && d.photo_status !== 'pending' ? d.photo_url : null
            return (
              <article key={d.id} className="card space-y-3 text-sm">
                <header className="flex items-center gap-3">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="h-11 w-11 flex-none rounded-lg object-cover" />
                  ) : (
                    <span aria-hidden="true" className="h-11 w-11 flex-none rounded-lg" style={{ background: d.color, opacity: 0.85 }} />
                  )}
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[15px]">{sig ?? tm('anonyme')}</b>
                    {d.updated_at && <span className="muted text-xs">{day(d.updated_at)}</span>}
                  </span>
                  {ok ? (
                    <span className="flex-none rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: 'rgba(240,178,74,0.16)', color: 'var(--accent)' }}>
                      {d.quote_consent_at ? (
                        <>
                          {/* Sur mobile, le badge court laisse la place au nom ; la date passe dans l'info-bulle */}
                          <span className="sm:hidden" title={t('citableDepuis', { date: day(d.quote_consent_at) })}>{t('citable')}</span>
                          <span className="hidden sm:inline">{t('citableDepuis', { date: day(d.quote_consent_at) })}</span>
                        </>
                      ) : (
                        t('citable')
                      )}
                    </span>
                  ) : (
                    <span className="muted flex-none rounded-full px-2.5 py-0.5 text-xs" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      {t('nonCitable')}
                    </span>
                  )}
                </header>
                {d.message_question && <p className="muted text-xs">{d.message_question}</p>}
                <p className="text-[15px] italic leading-relaxed">« {d.message?.trim()} »</p>
                <div className="flex flex-wrap gap-2">
                  {ok && (
                    <button className="chip !px-3 text-sm" onClick={() => void copy(d.id, `« ${d.message?.trim()} » — ${sig ?? tm('anonyme')}`)}>
                      {copied === d.id ? <span style={{ color: GREEN }}>{t('copie')}</span> : t('copier')}
                    </button>
                  )}
                  <button className="chip !px-3 text-sm" onClick={() => openDonor(d.id)}>
                    {t('fiche')}
                  </button>
                  <button
                    className="chip !px-3 text-sm"
                    onClick={async () => {
                      const yes = await askConfirm({ title: t('retirerTitre'), text: t('retirerTexte'), confirmLabel: t('retirer'), cancelLabel: t('annuler'), danger: true })
                      if (yes) void act({ action: 'removeMessage', donorId: d.id }, tm('temoignageRefuse'))
                    }}
                  >
                    {t('retirer')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </Section>
  )
}

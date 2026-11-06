'use client'

import { useTranslations } from 'next-intl'
import type { Act, ConsoleData } from './types'
import { Section, useAgo } from './ui'

// Modération : photos et témoignages en attente, signalements. Une décision = un geste. Le donateur est prévenu par
// courriel (sauf si la case est décochée : pourriel, abus). Mode : publication immédiate, ou après approbation.
export default function Moderation({ data, act, notify, setNotify }: { data: ConsoleData; act: Act; notify: boolean; setNotify: (v: boolean) => void }) {
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
      <section className="card space-y-3 text-sm">
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
    </div>
  )
}

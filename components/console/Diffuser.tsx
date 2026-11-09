'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import QRCode from 'qrcode'
import { publicLink } from '@/lib/links'
import { useMoney } from '@/lib/useI18n'
import type { ConsoleData } from './types'
import { GREEN, Icon, Section } from './ui'

// Emplacement d'un code QR : lettres, chiffres et tirets (il devient la provenance des dons : « D'où viennent les dons »)
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)

// Diffuser : le lien à partager, un code QR par emplacement, les écrans de projection, et d'où viennent les dons.
export default function Diffuser({ data }: { data: ConsoleData }) {
  const t = useTranslations('console.diffuser')
  const money = useMoney()
  const [origin, setOrigin] = useState('')
  const [place, setPlace] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // L'adresse publique est celle de cette console (le sous-domaine de l'organisme)
    const id = requestAnimationFrame(() => setOrigin(window.location.origin))
    return () => cancelAnimationFrame(id)
  }, [])
  const link = origin ? publicLink('/vitrail?src=partage') : ''
  const placeSlug = slug(place)
  const qrLink = origin ? publicLink(`/vitrail?don&src=${placeSlug || 'qr'}`) : ''

  useEffect(() => {
    if (!qrLink) return
    let live = true
    QRCode.toDataURL(qrLink, { margin: 2, width: 1024, errorCorrectionLevel: 'M', color: { dark: '#0b0a10', light: '#ffffff' } }).then(d => live && setQr(d))
    return () => {
      live = false
    }
  }, [qrLink])

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: data.org.name, url: link })
        return
      }
    } catch {
      return // partage annulé
    }
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="space-y-6">
      <Section title={t('lien')}>
        <div className="card space-y-3 text-sm">
          <p className="break-all">{link || '…'}</p>
          <button className="btn" onClick={() => void share()} disabled={!link}>
            <Icon name="partager" size={18} />
            {copied ? t('copie') : t('partager')}
          </button>
          <p className="muted text-xs">{t('lienAide')}</p>
        </div>
      </Section>

      <Section title={t('qr')}>
        <div className="card space-y-3 text-sm">
          <label className="block">
            <span>{t('emplacement')}</span>
            <input className="field mt-1" value={place} onChange={e => setPlace(e.target.value)} placeholder={t('emplacementExemple')} maxLength={40} />
            <span className="muted mt-1 block text-xs">{t('emplacementAide')}</span>
          </label>
          {qr && (
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={t('qrAlt', { emplacement: placeSlug || 'qr' })} className="h-40 w-40 rounded-lg bg-white" />
              <div className="flex flex-col gap-2">
                <a className="btn btn-ghost" href={qr} download={`qr-${data.org.slug}-${placeSlug || 'qr'}.png`}>
                  {t('telecharger')}
                </a>
                <a className="btn btn-ghost" href={`/affiche${place.trim() ? `?lieu=${encodeURIComponent(place.trim())}` : ''}`} target="_blank" rel="noopener">
                  {t('affiche')}
                </a>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title={t('ecrans')}>
        <div className="card space-y-3 text-sm">
          <p className="muted">{t('ecransAide')}</p>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-ghost" href="/ecran" target="_blank" rel="noopener">
              <Icon name="ecran" size={18} />
              {t('ecranFr')}
            </a>
            <a className="btn btn-ghost" href="/screen" target="_blank" rel="noopener">
              <Icon name="ecran" size={18} />
              {t('ecranEn')}
            </a>
          </div>
        </div>
      </Section>

      <Section title={t('provenance')}>
        {data.channels.length === 0 ? (
          <p className="card muted text-sm">{t('provenanceVide')}</p>
        ) : (
          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="muted text-left text-xs">
                  <th className="p-3 font-medium">{t('colEmplacement')}</th>
                  <th className="p-3 text-right font-medium">{t('colVisites')}</th>
                  <th className="p-3 text-right font-medium">{t('colDons')}</th>
                  <th className="p-3 text-right font-medium">{t('colMontant')}</th>
                </tr>
              </thead>
              <tbody>
                {data.channels.map(c => (
                  <tr key={c.channel} className="border-t" style={{ borderColor: 'var(--line)' }}>
                    <td className="p-3">{t.has(`canal.${c.channel}` as 'canal.direct') ? t(`canal.${c.channel}` as 'canal.direct') : c.channel}</td>
                    <td className="p-3 text-right">{c.visits}</td>
                    <td className="p-3 text-right">
                      {c.donations}
                      {c.visits > 0 && <span className="muted text-xs"> ({Math.round((c.donations / c.visits) * 100)} %)</span>}
                    </td>
                    <td className="p-3 text-right" style={{ color: c.totalCents > 0 ? GREEN : undefined }}>
                      {money(c.totalCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted text-xs">{t('provenanceAide')}</p>
      </Section>
    </div>
  )
}

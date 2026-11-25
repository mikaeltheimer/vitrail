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

// Diffuser : le lien à partager, un code QR par emplacement, les écrans de projection, l'intégration au site de
// l'organisme, et d'où viennent les dons.
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

  // Ordinateur : le lien et les écrans à gauche, le code QR à droite, la provenance sur toute la largeur
  return (
    <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
      <Section title={t('lien')} className="lg:col-start-1 lg:row-start-1">
        <div className="card space-y-3 text-sm">
          <p className="break-all">{link || '…'}</p>
          <button className="btn" onClick={() => void share()} disabled={!link}>
            <Icon name="partager" size={18} />
            {copied ? t('copie') : t('partager')}
          </button>
          <p className="muted text-xs">{t('lienAide')}</p>
        </div>
      </Section>

      <Section title={t('qr')} className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
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

      <Section title={t('ecrans')} className="lg:col-start-1 lg:row-start-2">
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

      <Integrer data={data} origin={origin} className="lg:col-span-2 lg:row-start-3" />

      <Section title={t('provenance')} className="lg:col-span-2 lg:row-start-4">
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

/**
 * Intégrer à votre site : le code d'un <iframe> vers /integrer (le vitrail vivant, sans QR ; un clic ouvre le don), avec
 * ses réglages dans l'adresse (aucune donnée enregistrée) et un aperçu en direct. Par défaut : les donateurs seulement.
 * Le montant ne se règle qu'avec la présentation (c'est là qu'il s'affiche) et jamais s'il est masqué sur le vitrail.
 */
function Integrer({ data, origin, className }: { data: ConsoleData; origin: string; className: string }) {
  const t = useTranslations('console.diffuser.integrer')
  const tl = useTranslations('commun.langue')
  const [presentation, setPresentation] = useState(false)
  const [montant, setMontant] = useState(false)
  const [pourquoi, setPourquoi] = useState(false)
  const [lang, setLang] = useState<'fr' | 'en'>('fr')
  const [format, setFormat] = useState<'3/2' | '16/9'>('3/2')
  const [copied, setCopied] = useState(false)
  const totalHidden = data.showTotal === false
  const query = [presentation && 'presentation=1', presentation && montant && !totalHidden && 'montant=1', pourquoi && 'pourquoi=1', `lang=${lang}`].filter(Boolean).join('&')
  const src = origin ? publicLink(`/integrer?${query}`) : ''
  const code = `<iframe src="${src}" title="${t('titreCadre', { org: data.org.name }).replace(/"/g, '&quot;')}" style="width:100%;aspect-ratio:${format};border:0" loading="lazy"></iframe>`
  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }
  return (
    <Section title={t('titre')} className={className}>
      <div className="card grid gap-6 text-sm lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
          <p className="muted pb-2 text-xs">{t('intro')}</p>
          <Option checked disabled title={t('donateurs')} help={t('donateursAide')} onChange={() => {}} />
          <div>
            <Option checked={presentation} onChange={setPresentation} title={t('presentation')} help={t('presentationAide')} />
            <div className="pb-2 pl-7">
              <Option checked={presentation && montant && !totalHidden} onChange={setMontant} disabled={!presentation || totalHidden} title={t('montant')} help={totalHidden ? t('montantMasque') : t('montantAide')} />
            </div>
          </div>
          <Option checked={pourquoi} onChange={setPourquoi} title={t('pourquoi')} help={t('pourquoiAide')} />
          <Choice label={t('langue')} value={lang} onChange={setLang} options={[['fr', tl('fr')], ['en', tl('en')]]} />
          <Choice label={t('format')} value={format} onChange={setFormat} options={[['3/2', t('paysage')], ['16/9', t('panoramique')]]} />
        </div>
        <div className="min-w-0 space-y-3">
          {/* L'aperçu : le vrai code, à la taille de cette carte (la page se met seule à l'échelle de son cadre) */}
          {src && <iframe key={src + format} src={src} title={t('apercu')} className="block w-full rounded-xl border" style={{ aspectRatio: format, borderColor: 'var(--line)', background: '#0B0A12' }} loading="lazy" />}
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl border p-3 text-xs" style={{ borderColor: 'var(--line)', background: 'rgba(0,0,0,0.25)' }}>
            {code}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => void copy()} disabled={!src}>
              {copied ? t('copie') : t('copier')}
            </button>
            <a className="btn btn-ghost" href={src || undefined} target="_blank" rel="noopener">
              {t('ouvrir')}
            </a>
          </div>
          <p className="muted text-xs">{t('aide')}</p>
        </div>
      </div>
    </Section>
  )
}

function Option({ checked, onChange, title, help, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; title: string; help: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 py-2 ${disabled ? (checked ? '' : 'opacity-50') : 'cursor-pointer'}`}>
      <input type="checkbox" className="mt-1" style={{ accentColor: 'var(--accent)' }} checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="muted block text-xs">{help}</span>
      </span>
    </label>
  )
}
function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <span className="w-24 font-semibold">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-lg border" style={{ borderColor: 'var(--line)' }}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className="px-3 py-1.5 text-xs" style={value === v ? { background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)', fontWeight: 600 } : undefined} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

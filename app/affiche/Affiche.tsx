'use client'

/* eslint-disable @next/next/no-img-element -- code QR (data URL) et logo téléversé par l'organisme */
import { DEFAULT_GLASSES } from '@/lib/theme'
import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { publicLink } from '@/lib/links'
import { CONFIG, brandFor } from '@/lib/config'
import { useIdentity } from '@/lib/useOrg'
import { clampLocale } from '@/lib/identity-shared'
import type { Locale } from '@/i18n/config'

// Affiche à imprimer : chacune a son propre code QR (?src=…) pour savoir, dans la console (« D'où viennent les dons »),
// quels emplacements font donner. Format lettre, portrait ; tout ce qui n'est pas l'affiche disparaît à l'impression.
// Identité de l'organisme : son logo (version claire, sur fond sombre) dans le bandeau du haut, sinon son nom.
// Langues : celles que l'organisme offre ; bilingue, l'affiche peut porter les deux (la langue principale d'abord).

type PosterTexts = { invitation: string; titre: string; explication: string; scannez: string; enUneMinute: string; qrAlt: string }

const SUGGESTIONS = ['accueil', 'cafe', 'ateliers', 'exposition', 'caisse'] as const

/** « Café de l'entrée » → « cafe-de-l-entree » (même règle que la console) */
function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'affiche'
  )
}

/** Un texte de l'affiche : la langue principale, puis la seconde en dessous, plus petite et en italique. */
function Bi({ texts, langs, k, size, style, second = 0.55 }: { texts: Record<Locale, PosterTexts>; langs: Locale[]; k: keyof PosterTexts; size: number; style?: React.CSSProperties; second?: number }) {
  const [main, ...rest] = langs
  return (
    <div style={style}>
      <div lang={main} style={{ fontSize: `${size}cqi` }}>
        {texts[main][k]}
      </div>
      {rest.map(l => (
        <div key={l} lang={l} style={{ fontSize: `${size * second}cqi`, fontStyle: 'italic', fontWeight: 400, opacity: 0.75, marginTop: '0.6cqi' }}>
          {texts[l][k]}
        </div>
      ))}
    </div>
  )
}

export default function Affiche({ poster }: { poster: Record<Locale, PosterTexts> }) {
  const t = useTranslations('affiche')
  const identity = useIdentity()
  const params = useSearchParams()
  const offered: Locale[] = identity?.locales ?? ['fr']
  const bilingual = offered.length > 1
  const [place, setPlace] = useState(() => params.get('lieu') || t('suggestions.accueil'))
  const [choice, setChoice] = useState<Locale | 'both'>(bilingual ? 'both' : offered[0])
  const [origin, setOrigin] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setOrigin(window.location.origin))
    return () => cancelAnimationFrame(id)
  }, [])

  // Langues imprimées, la principale d'abord
  const langs: Locale[] = choice === 'both' ? offered : [choice]
  const main = langs[0]
  const nameIn = (l: Locale) => identity?.texts[clampLocale(offered, l)]?.name || ''
  const slug = slugify(place)
  // Même destination que le QR de la console : le vitrail, panneau de don ouvert. Une seule langue : on la fixe.
  const link = origin ? publicLink(`/vitrail?don&src=${slug}${langs.length === 1 && bilingual ? `&lang=${main}` : ''}`) : ''
  // Bilingue : un peu plus serré, pour que tout tienne sur la page lettre
  const qrSize = langs.length > 1 ? '28cqi' : '32cqi'
  const shortHost = useMemo(() => origin.replace(/^https?:\/\//, ''), [origin])

  useEffect(() => {
    if (!link) return
    let stop = false
    QRCode.toDataURL(link, { margin: 0, width: 900, errorCorrectionLevel: 'M', color: { dark: '#0b0a10', light: '#ffffff' } })
      .then(d => !stop && setQr(d))
      .catch(() => !stop && setQr(null))
    return () => {
      stop = true
    }
  }, [link])

  return (
    <main className="affiche-page min-h-screen px-4 py-6">
      <style>{`
        @page { size: letter portrait; margin: 0; }
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .affiche-page { padding: 0 !important; }
          .poster { box-shadow: none !important; margin: 0 !important; width: 8.5in !important; height: 11in !important; }
          .poster, .poster * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Réglages (invisibles à l'impression) */}
      <section className="no-print mx-auto mb-6 max-w-xl space-y-3">
        <h1 className="text-xl font-bold">{t('titrePage')}</h1>
        <p className="muted text-sm">{t('aide')}</p>
        <label className="block text-sm font-semibold" htmlFor="place">
          {t('emplacement')}
        </label>
        <input id="place" className="field" value={place} onChange={e => setPlace(e.target.value)} maxLength={40} />
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => {
            const label = t(`suggestions.${s}`)
            return (
              <button key={s} className="chip !px-3 text-sm" aria-pressed={place === label} onClick={() => setPlace(label)}>
                {label}
              </button>
            )
          })}
        </div>
        {bilingual && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">{t('langue')}</legend>
            <div className="flex flex-wrap gap-2">
              {(['both', ...offered] as const).map(c => (
                <button key={c} className="chip !px-3 text-sm" aria-pressed={choice === c} onClick={() => setChoice(c)}>
                  {c === 'both' ? t('langueBilingue') : c === 'fr' ? 'Français' : 'English' /* i18n-ok : chaque langue nommée dans sa propre langue */}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="card flex items-center gap-2 !p-3 text-sm">
          <code className="min-w-0 flex-1 truncate">{link}</code>
          <button
            className="chip !px-3"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
            }}
          >
            {copied ? t('copie') : t('copier')}
          </button>
        </div>
        <button className="btn" onClick={() => window.print()}>
          {t('imprimer')}
        </button>
        <p className="muted text-xs">{t('imprimerAide')}</p>
      </section>

      {/* L'affiche */}
      <article
        className="poster mx-auto flex flex-col items-center text-center"
        lang={main}
        style={{
          width: 'min(100%, 8.5in)',
          aspectRatio: '8.5 / 11',
          background: '#fbf8f1',
          color: '#14111c',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          containerType: 'inline-size',
          overflow: 'hidden',
        }}
      >
        {/* Bandeau de l'organisme : fond nuit, pour le logo en version claire (celui de ses pages) */}
        <div style={{ width: '100%', background: '#14111c', color: '#F4EFE6', padding: '5cqi 8% 4.5cqi', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '18cqi' }}>
          {identity?.logoUrl ? (
            <img src={identity.logoUrl} alt={nameIn(main)} style={{ maxWidth: '62cqi', maxHeight: '11cqi', width: 'auto', height: 'auto' }} />
          ) : (
            <div className="font-display" style={{ fontSize: '4.4cqi', lineHeight: 1.15 }}>
              {nameIn(main)}
              {langs.slice(1).map(l => (nameIn(l) && nameIn(l) !== nameIn(main) ? <div key={l} lang={l} style={{ fontSize: '0.6em', opacity: 0.75, fontStyle: 'italic' }}>{nameIn(l)}</div> : null))}
            </div>
          )}
        </div>

        <div className="flex w-full flex-1 flex-col items-center" style={{ padding: langs.length > 1 ? '3.5cqi 8% 4cqi' : '4.5cqi 8% 5cqi' }}>
          <Bi texts={poster} langs={langs} k="invitation" size={3} style={{ letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, color: '#B07A1F' }} />
          <Bi texts={poster} langs={langs} k="titre" size={langs.length > 1 ? 6.6 : 8.8} second={0.42} style={{ fontFamily: 'var(--font-display)', lineHeight: 1.02, marginTop: '1.6cqi' }} />

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '3.5cqi', margin: langs.length > 1 ? '3.5cqi 0 1.5cqi' : '5cqi 0 2cqi' }}>
            {[
              { dollars: 10, color: DEFAULT_GLASSES[1].value },
              { dollars: 25, color: DEFAULT_GLASSES[4].value },
              { dollars: 100, color: '#F0B24A' },
            ].map(d => {
              const side = 4.2 * Math.pow(d.dollars / 10, CONFIG.sizeExponent / 2)
              return (
                <div key={d.dollars}>
                  <div style={{ width: `${side}cqi`, height: `${side}cqi`, background: d.color, border: '0.5cqi solid #14111c', margin: '0 auto' }} />
                  <div style={{ fontSize: '3cqi', fontWeight: 700, marginTop: '1cqi' }}>{main === 'en' ? `$${d.dollars}` : `${d.dollars} $`}</div>
                </div>
              )
            })}
          </div>
          <Bi texts={poster} langs={langs} k="explication" size={langs.length > 1 ? 2.6 : 3.1} second={0.85} style={{ lineHeight: 1.35, color: '#3d3747', maxWidth: '84%' }} />

          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '5cqi' }}>
            {qr ? <img src={qr} alt={poster[main].qrAlt.replace('{org}', nameIn(main))} style={{ width: qrSize, height: qrSize }} /> : <div style={{ width: qrSize, height: qrSize, background: '#e8e4dc' }} />}
            <div style={{ textAlign: 'left' }}>
              <Bi texts={poster} langs={langs} k="scannez" size={langs.length > 1 ? 4.8 : 5.4} second={0.6} style={{ fontWeight: 700, lineHeight: 1.05 }} />
              <Bi texts={poster} langs={langs} k="enUneMinute" size={2.8} second={0.85} style={{ color: '#3d3747', marginTop: '1.5cqi' }} />
              <div style={{ fontSize: '2.4cqi', color: '#6b6475', marginTop: '1cqi', wordBreak: 'break-all' }}>{shortHost}</div>
            </div>
          </div>
          <div style={{ marginTop: langs.length > 1 ? '3cqi' : '4cqi', fontSize: '2.2cqi', color: '#6b6475' }}>
            {CONFIG.brand.name} · <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: '#B07A1F' }}>{brandFor(main).slogan}</span>
          </div>
        </div>
      </article>
    </main>
  )
}

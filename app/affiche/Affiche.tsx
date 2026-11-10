'use client'

/* eslint-disable @next/next/no-img-element -- code QR (data URL) et logo téléversé par l'organisme */
import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { publicLink } from '@/lib/links'
import { useIdentity } from '@/lib/useOrg'
import { clampLocale } from '@/lib/identity-shared'
import { DEFAULT_GLASSES } from '@/lib/theme'
import { glassScene, lightRays, type GlassScene, type SvgPiece } from '@/lib/glassSvg'
import Signature from '@/components/Signature'
import type { Snapshot } from '@/lib/types'
import type { Locale } from '@/i18n/config'

// Affiche « La place libre » (validée par Mika le 10 nov. 2026) : le vrai vitrail de l'organisme, avec un morceau
// vide au plomb pointillé, et « Il manque un morceau. Le vôtre. » Faite pour être vue de loin dans un événement.
// - Chaque affiche a son propre code QR (?src=…) : « D'où viennent les dons » (console) montre ce que chacune amène.
// - Formats lettre et tabloïd (11 × 17), portrait ; tout ce qui n'est pas l'affiche disparaît à l'impression.
// - Fond papier, la couleur dans le vitrail : passe sur une imprimante de bureau.
// - L'organisme parle : bandeau nuit avec son logo (version claire, celle de ses pages), sinon son nom ;
//   Donivers signe en bas, en petit.
// - Langues : celles que l'organisme offre ; bilingue, l'affiche porte les deux (la langue principale d'abord).

type PosterTexts = {
  titre1: string
  titre2: string
  sousTitre: string
  scannez: string
  details: string
  place: string
  qrAlt: string
}
type Format = 'lettre' | 'tabloid'

const SUGGESTIONS = ['accueil', 'cafe', 'ateliers', 'exposition', 'caisse'] as const
const PAPER = '#FBF8F1'
const INK = '#1A1720'
const AMBER_INK = '#B07A1F'
const SIZES: Record<Format, { w: number; h: number; page: string }> = {
  lettre: { w: 8.5, h: 11, page: 'letter portrait' },
  tabloid: { w: 11, h: 17, page: '11in 17in' },
}

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

/** Vitrail d'attente (aucun don encore) : 24 morceaux égaux aux couleurs de la palette, graine tirée du nom. */
function waiting(seed: string): SvgPiece[] {
  return Array.from({ length: 24 }, (_, i) => ({
    id: `${seed}-${i}`,
    color: DEFAULT_GLASSES[i % DEFAULT_GLASSES.length].value,
    amountCents: 2500,
  }))
}

/** Un polygone « x,y x,y … » ramené vers un point (pour le pointillé intérieur de la place libre). */
function shrink(points: string, [cx, cy]: [number, number], k: number): string {
  return points
    .split(' ')
    .map(p => {
      const [x, y] = p.split(',').map(Number)
      return `${(cx + (x - cx) * k).toFixed(1)},${(cy + (y - cy) * k).toFixed(1)}`
    })
    .join(' ')
}

/** Le vitrail de l'affiche : verre, plomb, halo chaud sur le papier, et la place libre. */
function PosterGlass({ scene, label, veiled }: { scene: GlassScene; label: string; veiled: boolean }) {
  const { view, radius: R, ring, free } = scene
  const words = label.toUpperCase().split(' ')
  const fs = free ? free.inRadius * (words.some(w => w.length >= 7) ? 0.26 : 0.32) : 0
  const rays = lightRays(scene, 3.2)
  return (
    // Les rayons débordent sous le vitrail (overflow visible) : ils passent derrière le titre, l'affiche les coupe en bas
    <svg
      viewBox={`${-view * 1.12} ${-view * 1.12} ${view * 2.24} ${view * 2.24}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <defs>
        {rays.map((r, i) => (
          <linearGradient key={i} id={`affiche-r${i}`} gradientUnits="userSpaceOnUse" x1={r.from[0]} y1={r.from[1]} x2={r.to[0]} y2={r.to[1]}>
            <stop offset="0" stopColor={r.color} stopOpacity={veiled ? 0.1 : 0.26} />
            <stop offset="0.45" stopColor={r.color} stopOpacity={veiled ? 0.04 : 0.1} />
            <stop offset="1" stopColor={r.color} stopOpacity="0" />
          </linearGradient>
        ))}
        <radialGradient id="affiche-halo">
          <stop offset="0.75" stopColor="#F0B24A" stopOpacity="0.28" />
          <stop offset="1" stopColor="#F0B24A" stopOpacity="0" />
        </radialGradient>
        {scene.tiles.map((t, i) =>
          t.shaded ? (
            <radialGradient key={t.id} id={`affiche-g${i}`} gradientUnits="userSpaceOnUse" cx={t.glow[0]} cy={t.glow[1]} r={t.glow[2]}>
              <stop offset="0" stopColor={t.core} stopOpacity="0.9" />
              <stop offset="0.55" stopColor={t.mid} />
              <stop offset="1" stopColor={t.mid} stopOpacity="0" />
            </radialGradient>
          ) : null,
        )}
      </defs>
      {/* Lumière du vitrail sur le papier : rayons colorés, sous le verre */}
      {rays.map((r, i) => (
        <polygon key={i} points={r.points} fill={`url(#affiche-r${i})`} />
      ))}
      <circle r={view * 1.12} fill="url(#affiche-halo)" />
      <circle r={R} fill={veiled ? PAPER : '#050408'} />
      {/* Aucun don encore : le vitrail d'attente est voilé (on ne montre pas une communauté qui n'existe pas encore) */}
      <g opacity={veiled ? 0.36 : 1}>
        {scene.tiles.map((t, i) => (
          <g key={t.id}>
            <polygon points={t.points} fill={t.shaded ? t.base : t.mid} />
            {t.shaded && <polygon points={t.points} fill={`url(#affiche-g${i})`} />}
            <polygon points={t.points} fill="none" stroke="#050408" strokeWidth={t.lead} strokeLinejoin="round" />
          </g>
        ))}
      </g>
      {free && (
        <g>
          <polygon points={free.points} fill={PAPER} stroke="#050408" strokeWidth={free.lead} strokeLinejoin="round" />
          <polygon
            points={shrink(free.points, free.labelCenter, 0.84)}
            fill="none"
            stroke={AMBER_INK}
            strokeWidth={free.lead * 0.55}
            strokeDasharray={`${free.lead * 1.6} ${free.lead * 1.3}`}
            strokeLinejoin="round"
          />
          {words.map((w, i) => (
            <text
              key={i}
              x={free.labelCenter[0]}
              y={free.labelCenter[1] + (i - (words.length - 1) / 2) * fs * 1.15}
              textAnchor="middle"
              dominantBaseline="central"
              fill={AMBER_INK}
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                fontSize: fs,
                letterSpacing: fs * 0.08,
              }}
            >
              {w}
            </text>
          ))}
        </g>
      )}
      <circle r={R + ring / 2} fill="none" stroke="#050408" strokeWidth={ring} />
    </svg>
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
  const [format, setFormat] = useState<Format>(params.get('format') === 'tabloid' ? 'tabloid' : 'lettre')
  const [origin, setOrigin] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pieces, setPieces] = useState<SvgPiece[] | null>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setOrigin(window.location.origin))
    return () => cancelAnimationFrame(id)
  }, [])

  // Le vrai vitrail de l'organisme, au moment d'imprimer
  useEffect(() => {
    let stop = false
    fetch('/api/vitrail', { cache: 'no-store' })
      .then(r => (r.ok ? (r.json() as Promise<Snapshot>) : null))
      .then(
        s =>
          !stop &&
          setPieces(
            (s?.pieces ?? []).map(p => ({
              id: p.id,
              color: p.color,
              amountCents: p.amountCents,
            })),
          ),
      )
      .catch(() => !stop && setPieces([]))
    return () => {
      stop = true
    }
  }, [])

  // Langues imprimées, la principale d'abord
  const langs: Locale[] = choice === 'both' ? offered : [choice]
  const main = langs[0]
  const two = langs.length > 1
  const nameIn = (l: Locale) => identity?.texts[clampLocale(offered, l)]?.name || ''
  const slug = slugify(place)
  // Même destination que le QR de la console : le vitrail, panneau de don ouvert. Une seule langue : on la fixe.
  const link = origin ? publicLink(`/vitrail?don&src=${slug}${langs.length === 1 && bilingual ? `&lang=${main}` : ''}`) : ''
  const shortHost = useMemo(() => origin.replace(/^https?:\/\//, ''), [origin])
  const size = SIZES[format]

  // Pavage avec la place libre (vitrail vide : vitrail d'attente)
  const scene = useMemo(() => {
    if (!pieces) return null
    return glassScene(pieces.length ? pieces : waiting(nameIn(main) || 'donivers'), 900, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- le nom ne sert que de graine au vitrail d'attente
  }, [pieces])

  useEffect(() => {
    if (!link) return
    let stop = false
    QRCode.toDataURL(link, {
      margin: 0,
      width: 900,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B0A12', light: '#ffffff' },
    })
      .then(d => !stop && setQr(d))
      .catch(() => !stop && setQr(null))
    return () => {
      stop = true
    }
  }, [link])

  /** Un texte dans la langue principale, puis la seconde dessous, plus petite et en italique. */
  const bi = (k: keyof PosterTexts, sizeCqi: number, style: React.CSSProperties = {}, second = 0.5) => {
    const fill = (l: Locale) => poster[l][k].replace('{org}', nameIn(l))
    return (
      <div style={style}>
        <div lang={main} style={{ fontSize: `${sizeCqi}cqi` }}>
          {fill(main)}
        </div>
        {langs.slice(1).map(l => (
          <div
            key={l}
            lang={l}
            style={{
              fontSize: `${sizeCqi * second}cqi`,
              fontStyle: 'italic',
              fontWeight: 400,
              opacity: 0.72,
              marginTop: '0.5cqi',
            }}
          >
            {fill(l)}
          </div>
        ))}
      </div>
    )
  }

  const qrSize = format === 'tabloid' ? (two ? '22cqi' : '24cqi') : two ? '19cqi' : '21cqi'

  return (
    <main className="affiche-page min-h-screen px-4 py-6">
      <style>{`
        @page { size: ${size.page}; margin: 0; }
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .affiche-page { padding: 0 !important; }
          .poster { box-shadow: none !important; margin: 0 !important; width: ${size.w}in !important; height: ${size.h}in !important; }
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
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">{t('format')}</legend>
          <div className="flex flex-wrap gap-2">
            {(['lettre', 'tabloid'] as const).map(f => (
              <button key={f} className="chip !px-3 text-sm" aria-pressed={format === f} onClick={() => setFormat(f)}>
                {f === 'lettre' ? t('formatLettre') : t('formatTabloid')}
              </button>
            ))}
          </div>
        </fieldset>
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
        className="poster mx-auto flex flex-col text-center"
        lang={main}
        style={{
          width: `min(100%, ${format === 'tabloid' ? '7.6in' : '8.5in'})`,
          aspectRatio: `${size.w} / ${size.h}`,
          background: PAPER,
          color: INK,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          containerType: 'inline-size',
          overflow: 'hidden',
        }}
      >
        {/* L'organisme : son logo (version claire) sur le bandeau nuit, sinon son nom */}
        <div
          style={{
            background: '#0B0A12',
            color: '#F4EFE6',
            padding: '3.2cqi 8%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '12cqi',
            flex: 'none',
          }}
        >
          {identity?.logoUrl ? (
            <img
              src={identity.logoUrl}
              alt={nameIn(main)}
              style={{
                maxWidth: '62cqi',
                maxHeight: '9cqi',
                width: 'auto',
                height: 'auto',
              }}
            />
          ) : (
            <div className="font-display" style={{ fontSize: '4.6cqi', lineHeight: 1.15 }}>
              {nameIn(main)}
              {langs.slice(1).map(l =>
                nameIn(l) && nameIn(l) !== nameIn(main) ? (
                  <div
                    key={l}
                    lang={l}
                    style={{
                      fontSize: '0.6em',
                      opacity: 0.75,
                      fontStyle: 'italic',
                    }}
                  >
                    {nameIn(l)}
                  </div>
                ) : null,
              )}
            </div>
          )}
        </div>

        {/* Le vitrail et sa place libre : prend toute la hauteur qui reste (plus grand en tabloïd) */}
        <div style={{ flex: '1 1 0', minHeight: 0, padding: '2cqi 6% 0' }}>{scene && <PosterGlass scene={scene} label={poster[main].place} veiled={pieces?.length === 0} />}</div>

        <div style={{ flex: 'none', padding: '1.5cqi 7% 0' }}>
          <div className="font-display" style={{ lineHeight: 1.02 }}>
            {bi('titre1', 7.4, {}, 0.45)}
          </div>
          <div className="font-display" style={{ lineHeight: 1.02, color: AMBER_INK, marginTop: '0.6cqi' }}>
            {bi('titre2', 7.4, {}, 0.45)}
          </div>
          {bi('sousTitre', two ? 2.8 : 3.2, { color: '#4a4453', marginTop: '2.4cqi', lineHeight: 1.3 }, 0.85)}
        </div>

        {/* Donner : le code QR et ce qu'il faut savoir ; Donivers signe à droite, en petit */}
        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4cqi',
            padding: two ? '3cqi 7% 4cqi' : '3.5cqi 7% 4.5cqi',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              flex: 'none',
              background: '#fff',
              padding: '1.4cqi',
              borderRadius: '1.6cqi',
              boxShadow: `0 0 0 0.35cqi ${INK}`,
            }}
          >
            {qr ? (
              <img src={qr} alt={poster[main].qrAlt.replace('{org}', nameIn(main))} style={{ width: qrSize, height: qrSize, display: 'block' }} />
            ) : (
              <div style={{ width: qrSize, height: qrSize, background: '#e8e4dc' }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {bi('scannez', two ? 4.6 : 5.4, { fontWeight: 700, lineHeight: 1.05 }, 0.6)}
            {bi('details', two ? 2.3 : 2.6, { color: '#4a4453', marginTop: '1.4cqi', lineHeight: 1.35 }, 0.9)}
            <div
              style={{
                fontSize: '2.2cqi',
                color: '#6b6475',
                marginTop: '1.2cqi',
                wordBreak: 'break-all',
              }}
            >
              {shortHost}
            </div>
          </div>
          <div style={{ flex: 'none', alignSelf: 'flex-end' }}>
            <Signature
              tone="dark"
              link={false}
              height="2.8cqi"
              opacity={0.6}
              style={{
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '0.6cqi',
              }}
            />
          </div>
        </div>
      </article>
    </main>
  )
}

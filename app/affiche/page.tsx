'use client'

import { browserOrigin } from '@/lib/env'
import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { CONFIG } from '@/lib/config'

// Affiches à imprimer : chacune a son propre code QR (?src=…) pour savoir, dans la console (onglet Provenance),
// quels emplacements font donner. Format lettre, portrait ; tout ce qui n'est pas l'affiche disparaît à l'impression.

const SUGGESTIONS = ['Accueil', 'Café', 'Ateliers', 'Exposition', 'Caisse', 'Réseaux sociaux', 'Infolettre']

/** « Café de l'entrée » → « cafe-de-l-entree » */
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

export default function AffichePage() {
  const [place, setPlace] = useState('Accueil')
  const [origin, setOrigin] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    Promise.resolve().then(() => setOrigin(browserOrigin()))
  }, [])

  const slug = slugify(place)
  const link = origin ? `${origin}/don?src=${slug}` : ''
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
        }
      `}</style>

      {/* Réglages (invisibles à l'impression) */}
      <section className="no-print mx-auto mb-6 max-w-xl space-y-3">
        <h1 className="text-xl font-bold">Affiches à code QR</h1>
        <p className="muted text-sm">
          Une affiche par emplacement : chacune a son propre code, et l&apos;onglet <b>Provenance</b> de la console montre combien de visites et de dons
          elle amène. Pour un lien à partager en ligne (réseaux sociaux, infolettre), copiez simplement le lien.
        </p>
        <label className="block text-sm font-semibold" htmlFor="place">
          Emplacement
        </label>
        <input id="place" className="field" value={place} onChange={e => setPlace(e.target.value)} maxLength={40} />
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button key={s} className="chip !px-3 text-sm" aria-pressed={place === s} onClick={() => setPlace(s)}>
              {s}
            </button>
          ))}
        </div>
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
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
        <button className="btn" onClick={() => window.print()}>
          Imprimer cette affiche
        </button>
      </section>

      {/* L'affiche */}
      <article
        className="poster mx-auto flex flex-col items-center text-center"
        style={{
          width: 'min(100%, 8.5in)',
          aspectRatio: '8.5 / 11',
          background: '#fbf8f1',
          color: '#14111c',
          padding: '7% 8% 6%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          containerType: 'inline-size',
        }}
      >
        <div style={{ fontSize: '2.4cqi', letterSpacing: '0.24em', textTransform: 'uppercase', fontWeight: 500, color: '#6b6475' }}>{CONFIG.orgName}</div>
        <div style={{ fontSize: '3cqi', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, color: '#B07A1F', marginTop: '4cqi' }}>
          Faites partie du vitrail
        </div>
        <h2 className="font-display" style={{ fontSize: '8.8cqi', lineHeight: 1.02, marginTop: '1.6cqi' }}>Chaque don devient un morceau de verre</h2>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '3.5cqi', margin: '5cqi 0 2cqi' }}>
          {[
            { dollars: 10, color: '#3DB5A6' },
            { dollars: 25, color: '#E0657F' },
            { dollars: 100, color: '#F0B24A' },
          ].map(d => {
            const side = 4.2 * Math.pow(d.dollars / 10, CONFIG.sizeExponent / 2)
            return (
              <div key={d.dollars}>
                <div style={{ width: `${side}cqi`, height: `${side}cqi`, background: d.color, border: '0.5cqi solid #14111c', margin: '0 auto' }} />
                <div style={{ fontSize: '3cqi', fontWeight: 700, marginTop: '1cqi' }}>{d.dollars} $</div>
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: '3.1cqi', lineHeight: 1.35, color: '#3d3747', maxWidth: '80%' }}>
          Plus votre don est grand, plus votre morceau l&apos;est. Ajoutez votre nom, un mot, une photo : ils apparaissent sur le grand écran.
        </p>

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '5cqi' }}>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Code QR pour donner" style={{ width: '34cqi', height: '34cqi' }} />
          ) : (
            <div style={{ width: '34cqi', height: '34cqi', background: '#e8e4dc' }} />
          )}
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '5.6cqi', fontWeight: 700, lineHeight: 1.05 }}>
              Scannez
              <br />
              pour donner
            </div>
            <div style={{ fontSize: '3cqi', color: '#3d3747', marginTop: '1.5cqi' }}>En une minute : carte, Apple Pay ou Google Pay</div>
            <div style={{ fontSize: '2.4cqi', color: '#6b6475', marginTop: '1cqi', wordBreak: 'break-all' }}>{shortHost}</div>
          </div>
        </div>
        <div style={{ marginTop: '4cqi', fontSize: '2.2cqi', color: '#6b6475' }}>
          {CONFIG.brand.name} · <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: '#B07A1F' }}>{CONFIG.brand.slogan}</span>
        </div>
      </article>
    </main>
  )
}

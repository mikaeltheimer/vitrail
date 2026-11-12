'use client'

/* eslint-disable @next/next/no-img-element -- aperçus servis par la plateforme (image de partage, captures de la console) */
import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useEscape } from '@/lib/useEscape'

// Vitrail de démonstration seulement : un bandeau toujours visible (« tout est fictif ») et le tiroir des outils que
// l'organisme reçoit avec son vitrail (écran, image de partage, affiche, courriel de remerciement, console).
// Tout ce que montre le tiroir est fait des données fictives de la démo : les vraies pages de la démo (/ecran, /affiche,
// /api/og, /api/demo/courriel), et des captures fixes de la console (scripts/console-captures, jamais de vraies données).

export const DEMO_BANNER_HEIGHT = 36
const GOLD = '#F0B24A'
const CREAM = '#F4EFE6'
const SANS = "'DM Sans', sans-serif"

/** Bandeau noir d'une ligne, en haut de la page, impossible à fermer. Version courte sur téléphone. */
export function DemoBanner({ mobile, open, onOpen }: { mobile: boolean; open: boolean; onOpen: () => void }) {
  const t = useTranslations('vitrail.demoOutils')
  return (
    <div
      role="note"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: DEMO_BANNER_HEIGHT,
        zIndex: 2100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: mobile ? 'space-between' : 'center',
        gap: mobile ? 10 : 18,
        padding: mobile ? '0 8px 0 14px' : '0 16px',
        background: '#000',
        borderBottom: '1px solid rgba(240,178,74,0.28)',
        color: CREAM,
        fontFamily: SANS,
        fontSize: 13,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: GOLD, boxShadow: '0 0 8px rgba(240,178,74,0.8)', flex: 'none' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.rich(mobile ? 'bandeauCourt' : 'bandeau', { b: chunks => <b style={{ fontWeight: 600 }}>{chunks}</b> })}</span>
      </span>
      <button
        onClick={onOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{
          flex: 'none',
          height: 26,
          padding: '0 12px',
          borderRadius: 999,
          border: `1px solid ${open ? GOLD : 'rgba(240,178,74,0.6)'}`,
          background: open ? 'rgba(240,178,74,0.16)' : 'transparent',
          color: GOLD,
          fontFamily: SANS,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {mobile ? t('boutonCourt') : t('bouton')} <span aria-hidden>→</span>
      </button>
    </div>
  )
}

/** Un aperçu d'une vraie page, dessinée à sa taille réelle puis réduite à la largeur de la carte (inerte). */
function ScaledFrame({ src, width, height, title, srcDoc }: { src?: string; srcDoc?: string; width: number; height: number; title: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const k = w / width
  return (
    <div ref={box} style={{ position: 'relative', width: '100%', aspectRatio: `${width} / ${height}`, overflow: 'hidden' }}>
      {w > 0 && (
        <iframe
          title={title}
          src={src}
          srcDoc={srcDoc}
          sandbox={srcDoc !== undefined ? '' : undefined}
          tabIndex={-1}
          aria-hidden
          loading="lazy"
          style={{ position: 'absolute', top: 0, left: 0, width, height, border: 0, transform: `scale(${k})`, transformOrigin: '0 0', pointerEvents: 'none', background: 'transparent' }}
        />
      )}
    </div>
  )
}

function Card({ n, title, text, children, actions }: { n: number; title: string; text: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 12, padding: 14, borderRadius: 16, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ borderRadius: 10, overflow: 'hidden', background: '#0B0A12', border: '1px solid rgba(255,255,255,0.08)' }}>{children}</div>
      <div style={{ display: 'grid', gap: 4 }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 10, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 19, lineHeight: 1.2, color: CREAM }}>
          <span aria-hidden style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: GOLD }}>
            {String(n).padStart(2, '0')}
          </span>
          {title}
        </h3>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: 'rgba(244,239,230,0.72)' }}>{text}</p>
      </div>
      {actions && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{actions}</div>}
    </section>
  )
}

const actionStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 13px',
  borderRadius: 999,
  border: '1px solid rgba(240,178,74,0.55)',
  background: 'transparent',
  color: GOLD,
  fontFamily: SANS,
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
}

/** Une vignette cliquable (affiche, capture) avec sa légende. */
function Thumb({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" style={{ display: 'grid', gap: 6, textDecoration: 'none', color: 'rgba(244,239,230,0.75)', fontSize: 12, alignContent: 'start' }}>
      <span style={{ display: 'block', borderRadius: 6, overflow: 'hidden', boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}>{children}</span>
      <span>
        {label} <span aria-hidden>↗</span>
      </span>
    </a>
  )
}

/** Le tiroir des outils : à droite sur ordinateur, en bas sur téléphone. Le bandeau reste visible au-dessus. */
export function DemoToolsDrawer({ mobile, onClose, onEmail }: { mobile: boolean; onClose: () => void; onEmail: () => void }) {
  const t = useTranslations('vitrail.demoOutils')
  const tc = useTranslations('commun')
  const locale = useLocale()
  const heading = useRef<HTMLHeadingElement>(null)
  const [mail, setMail] = useState<string | null>(null)
  useEscape(onClose)
  useEffect(() => heading.current?.focus(), [])
  // Aperçu du courriel : le vrai gabarit, rendu par le serveur pour un don fictif de 50 $ (liens inertes)
  useEffect(() => {
    let live = true
    fetch(`/api/demo/courriel?montant=${EMAIL_PREVIEW_CENTS}&lang=${locale}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => live && d && setMail(String(d.html).replace('</head>', '<style>a{pointer-events:none}html,body{overflow:hidden}</style></head>')))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [locale])

  const intro = <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: 'rgba(244,239,230,0.7)' }}>{t('intro')}</p>
  const screen = locale === 'en' ? '/screen' : '/ecran'
  const shot = (name: 'accueil' | 'moderation') => `/demo/console-${name}-${locale === 'en' ? 'en' : 'fr'}.png`

  return (
    <>
      <div onClick={onClose} aria-hidden style={{ position: 'fixed', inset: `${DEMO_BANNER_HEIGHT}px 0 0 0`, zIndex: 2000, background: 'rgba(0,0,0,0.55)' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-outils-titre"
        className="demo-outils"
        style={{
          position: 'fixed',
          zIndex: 2001,
          display: 'flex',
          flexDirection: 'column',
          background: '#121019',
          color: CREAM,
          fontFamily: SANS,
          boxShadow: '0 0 60px rgba(0,0,0,0.6)',
          ...(mobile
            ? { left: 0, right: 0, bottom: 0, top: DEMO_BANNER_HEIGHT + 48, borderRadius: '18px 18px 0 0', borderTop: '1px solid rgba(240,178,74,0.3)' }
            : { top: DEMO_BANNER_HEIGHT, right: 0, bottom: 0, width: 'min(460px, 100%)', borderLeft: '1px solid rgba(240,178,74,0.25)' }),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: mobile ? '14px 16px 12px' : '22px 22px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: GOLD }}>{t('surtitre')}</span>
            <h2 id="demo-outils-titre" ref={heading} tabIndex={-1} style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: mobile ? 23 : 26, lineHeight: 1.1, outline: 'none' }}>
              {t('titre')}
            </h2>
            {!mobile && intro}
          </div>
          <button onClick={onClose} aria-label={tc('fermer')} style={{ flex: 'none', width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}>
            ×
          </button>
        </div>

        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: mobile ? '14px 14px calc(20px + env(safe-area-inset-bottom))' : '18px 22px 28px', display: 'grid', gap: 14, alignContent: 'start' }}>
          {/* Téléphone : l'en-tête reste court (titre et fermeture), le texte d'introduction défile avec les cartes */}
          {mobile && intro}
          <Card
            n={1}
            title={t('ecran.titre')}
            text={t('ecran.texte')}
            actions={
              <a href={screen} target="_blank" rel="noopener" style={actionStyle}>
                {t('ecran.ouvrir')} <span aria-hidden>↗</span>
              </a>
            }
          >
            <ScaledFrame src={`${screen}?embed`} width={1280} height={720} title={t('ecran.titre')} />
          </Card>

          <Card
            n={2}
            title={t('partage.titre')}
            text={t('partage.texte')}
            actions={
              <a href={`/api/og?lang=${locale}`} target="_blank" rel="noopener" style={actionStyle}>
                {t('partage.ouvrir')} <span aria-hidden>↗</span>
              </a>
            }
          >
            <img src={`/api/og?lang=${locale}`} alt={t('partage.alt')} width={1200} height={630} loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
          </Card>

          <Card n={3} title={t('affiche.titre')} text={t('affiche.texte')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start', padding: '14px 14px 12px', background: 'linear-gradient(180deg, #1a1722, #0f0d15)' }}>
              <Thumb href="/affiche?format=lettre" label={t('affiche.lettre')}>
                <ScaledFrame src="/affiche?format=lettre&apercu" width={816} height={1056} title={t('affiche.lettre')} />
              </Thumb>
              <Thumb href="/affiche?format=tabloid" label={t('affiche.tabloid')}>
                <ScaledFrame src="/affiche?format=tabloid&apercu" width={816} height={1261} title={t('affiche.tabloid')} />
              </Thumb>
            </div>
          </Card>

          <Card
            n={4}
            title={t('courriel.titre')}
            text={t('courriel.texte')}
            actions={
              <button onClick={onEmail} style={actionStyle}>
                {t('courriel.ouvrir')}
              </button>
            }
          >
            <div style={{ position: 'relative' }}>
              {mail ? <ScaledFrame srcDoc={mail} width={600} height={430} title={t('courriel.titre')} /> : <div style={{ aspectRatio: '600 / 430' }} />}
              <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 48, background: 'linear-gradient(180deg, rgba(11,10,18,0), #0B0A12)' }} />
            </div>
          </Card>

          <Card n={5} title={t('console.titre')} text={t('console.texte')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start', padding: '14px 14px 12px', background: 'linear-gradient(180deg, #1a1722, #0f0d15)' }}>
              <Thumb href={shot('accueil')} label={t('console.accueil')}>
                <img src={shot('accueil')} alt={t('console.accueilAlt')} width={390} height={844} loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
              </Thumb>
              <Thumb href={shot('moderation')} label={t('console.moderation')}>
                <img src={shot('moderation')} alt={t('console.moderationAlt')} width={390} height={844} loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
              </Thumb>
            </div>
          </Card>
          <p style={{ margin: '2px 4px 0', fontSize: 12, lineHeight: 1.45, color: 'rgba(244,239,230,0.5)' }}>{t('note')}</p>
        </div>
      </div>
    </>
  )
}

/** Montant du don fictif des aperçus du courriel (50 $). */
export const EMAIL_PREVIEW_CENTS = 5000

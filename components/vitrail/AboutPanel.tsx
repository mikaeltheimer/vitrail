'use client'

// « À propos de la collecte » : qui est l'école, pourquoi donner, comment marche le vitrail.
// Ordinateur : panneau à droite (comme une fiche) ; téléphone : feuille en plein écran sous l'en-tête.

import { CONFIG } from '@/lib/config'
import { formatMoney } from '@/lib/format'

const MONO = "'DM Sans', sans-serif"
const GOLD = '#F0B24A'

export default function AboutPanel({
  isMobile,
  totalCents,
  goalCents,
  donors,
  onClaim,
  onClose,
}: {
  isMobile: boolean
  totalCents: number
  goalCents: number
  donors: number
  onClaim: () => void
  onClose: () => void
}) {
  const pct = goalCents > 0 ? Math.min(100, (totalCents / goalCents) * 100) : 0
  const steps = [
    ['Choisissez un montant', 'Plus le don est grand, plus votre morceau de verre l’est.'],
    ['Signez-le, si vous voulez', 'Votre nom, un mot, une photo. Ou restez anonyme.'],
    ['Il entre dans le vitrail', 'Ici, et sur le grand écran de l’école pendant ses événements.'],
  ]
  return (
    <div
      style={{
        position: 'fixed',
        top: 56,
        right: 0,
        bottom: 0,
        left: isMobile ? 0 : 'auto',
        width: isMobile ? 'auto' : 380,
        background: 'rgba(15,15,25,0.97)',
        backdropFilter: 'blur(30px)',
        borderLeft: isMobile ? 'none' : '1px solid rgba(240,178,74,0.2)',
        boxShadow: '0 0 40px rgba(0,0,0,0.5)',
        zIndex: 600,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>À propos de la collecte</span>
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#F4EFE6', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: '24px', display: 'grid', gap: 22, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ecole-logo.png" alt={CONFIG.orgName} style={{ width: 240, maxWidth: '100%', height: 'auto' }} />

        <div>
          <h2 className="font-display" style={{ fontSize: 24, lineHeight: 1.2, margin: 0 }}>Le Donivers de l&apos;{CONFIG.orgName}</h2>
          <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.75)' }}>
            Chaque morceau de verre est un don à l&apos;école. Ensemble, ils forment ce vitrail, qui grandit à chaque nouveau don.
          </p>
        </div>

        {/* Où en est la collecte */}
        <div style={{ padding: 16, borderRadius: 12, background: 'rgba(240,178,74,0.06)', border: '1px solid rgba(240,178,74,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: GOLD }}>{formatMoney(totalCents)}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{goalCents > 0 ? `sur ${formatMoney(goalCents)}` : 'amassés'}</span>
          </div>
          {goalCents > 0 && (
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: GOLD, borderRadius: 3 }} />
            </div>
          )}
          <div style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 8 }}>
            {donors} donateur{donors > 1 ? 's' : ''}
          </div>
        </div>

        <div>
          <h3 style={sectionTitle}>Pourquoi donner</h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#F4EFE6', fontWeight: 500 }}>{CONFIG.orgWhy}</p>
        </div>

        <div>
          <h3 style={sectionTitle}>L&apos;école</h3>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(255,255,255,0.75)' }}>{CONFIG.orgAbout}</p>
          <a href={CONFIG.orgUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 14, color: GOLD, textDecoration: 'none' }}>
            {CONFIG.orgUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
          </a>
        </div>

        <div>
          <h3 style={sectionTitle}>Comment ça marche</h3>
          <ol style={{ display: 'grid', gap: 12, margin: 0, padding: 0, listStyle: 'none' }}>
            {steps.map(([t, d], i) => (
              <li key={t} style={{ display: 'flex', gap: 12 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', border: `1px solid ${GOLD}`, color: GOLD, fontFamily: MONO, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                  <b>{t}</b>
                  <span style={{ display: 'block', color: 'rgba(255,255,255,0.6)' }}>{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <button
          onClick={onClaim}
          style={{ padding: '13px 18px', background: GOLD, color: '#1A1208', border: 0, borderRadius: 999, fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 8px 30px rgba(240,178,74,0.25)' }}
        >
          Ajouter mon morceau
        </button>
        <p style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
          L&apos;école n&apos;est pas encore un organisme de bienfaisance enregistré : aucun reçu fiscal n&apos;est émis pour le moment. Paiement sécurisé par Stripe.{' '}
          <a href="/confidentialite" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Confidentialité
          </a>
        </p>

        {/* La plateforme : seul endroit (avec la confidentialité) où Studio Existence apparaît */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
          <div className="font-display" style={{ fontSize: 18 }}>{CONFIG.brand.name}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{CONFIG.brand.descriptor}</div>
          <div className="slogan" style={{ fontSize: 14, marginTop: 6 }}>{CONFIG.brand.slogan}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
            Une création de{' '}
            <a href={CONFIG.brand.studioUrl} target="_blank" rel="noreferrer" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {CONFIG.brand.studio}
            </a>
            .
          </div>
        </div>
      </div>
    </div>
  )
}

const sectionTitle: React.CSSProperties = { fontFamily: MONO, fontSize: 11, fontWeight: 400, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', margin: '0 0 8px' }

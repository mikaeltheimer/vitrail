'use client'

// « À propos de la collecte » : qui est l'école, pourquoi donner, comment marche le vitrail.
// Ordinateur : panneau à droite (comme une fiche) ; téléphone : feuille en plein écran sous l'en-tête.

import { useTranslations } from 'next-intl'
import { CONFIG } from '@/lib/config'
import { useBrand, useOrg } from '@/lib/useOrg'
import { useMoney } from '@/lib/useI18n'
import { OrgLogo } from '@/components/OrgBrand'
import Editable from '@/components/atelier/Editable'
import { useAtelier } from '@/components/atelier/Atelier'

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
  const t = useTranslations('vitrail.apropos')
  const tm = useTranslations('vitrail')
  const te = useTranslations('vitrail.entete')
  const tc = useTranslations('commun')
  const td = useTranslations('don')
  const org = useOrg()
  const editing = !!useAtelier()?.editing
  const ta = useTranslations('atelier')
  const brand = useBrand()
  const money = useMoney()
  const pct = goalCents > 0 ? Math.min(100, (totalCents / goalCents) * 100) : 0
  const steps = [
    [t('etape1'), t('etape1Texte')],
    [t('etape2'), t('etape2Texte')],
    [t('etape3'), t('etape3Texte')],
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
        <span style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('titre')}</span>
        <button
          onClick={onClose}
          aria-label={tc('fermer')}
          style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#F4EFE6', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: '24px', display: 'grid', gap: 22, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <Editable field="logo" block style={{ alignSelf: 'start', justifySelf: 'start' }}>
          <OrgLogo style={{ width: 240, maxWidth: '100%' }} nameStyle={{ fontSize: 22 }} />
        </Editable>

        <div>
          <h2 className="font-display" style={{ fontSize: 24, lineHeight: 1.2, margin: 0 }}>
            <Editable field="vitrailTitle">{org.vitrailTitle}</Editable>
          </h2>
          <p style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{t('nomPlateforme', { org: org.name })}</p>
          <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.75)' }}>
            {t('chaque')}
          </p>
        </div>

        {/* Où en est la collecte */}
        <div style={{ padding: 16, borderRadius: 12, background: 'rgba(240,178,74,0.06)', border: '1px solid rgba(240,178,74,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: GOLD }}>{money(totalCents)}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{goalCents > 0 ? td('sur', { montant: money(goalCents) }) : te('amasses')}</span>
          </div>
          {goalCents > 0 && (
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: GOLD, borderRadius: 3 }} />
            </div>
          )}
          <div style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 8 }}>
            {te('donateurs', { count: donors })}
          </div>
        </div>

        <div>
          <h3 style={sectionTitle}>{t('pourquoi')}</h3>
          <Editable field="why" block>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: '#F4EFE6', fontWeight: 500 }}>{org.why}</p>
          </Editable>
        </div>

        {(org.about || org.url || editing) && (
          <div>
            <h3 style={sectionTitle}>{org.name}</h3>
            <Editable field="about" block empty={<p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>{ta('ajouterPresentation')}</p>}>
              {org.about && <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(255,255,255,0.75)', whiteSpace: 'pre-line' }}>{org.about}</p>}
            </Editable>
            {org.url && (
              <a href={org.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 14, color: GOLD, textDecoration: 'none' }}>
                {org.url.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
              </a>
            )}
          </div>
        )}

        <div>
          <h3 style={sectionTitle}>{t('commentCaMarche')}</h3>
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
          {tm('ajouter')}
        </button>
        <p style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
          {t('recu')}{' '}
          <a href="/confidentialite" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {tc('confidentialiteCourt')}
          </a>
          {' · '}
          <a href="/conditions" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {tc('conditionsCourt')}
          </a>
        </p>

        {/* La plateforme : seul endroit (avec la confidentialité) où Studio Existence apparaît */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
          <div className="font-display" style={{ fontSize: 18 }}>{CONFIG.brand.name}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{brand.descriptor}</div>
          <div className="slogan" style={{ fontSize: 14, marginTop: 6 }}>{brand.slogan}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
            {t.rich('creation', {
              studio: CONFIG.brand.studio,
              lien: chunks => (
                <a href={CONFIG.brand.studioUrl} target="_blank" rel="noreferrer" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {chunks}
                </a>
              ),
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

const sectionTitle: React.CSSProperties = { fontFamily: MONO, fontSize: 11, fontWeight: 400, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', margin: '0 0 8px' }

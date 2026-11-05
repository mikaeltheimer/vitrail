'use client'

// Partager un morceau : lien direct vers lui dans le vitrail en ligne (/vitrail?d=…), par le menu de partage du
// téléphone, en copiant le lien, ou vers Facebook et le courriel.

import { browserOrigin } from '@/lib/env'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CONFIG } from '@/lib/config'
import { useOrg } from '@/lib/useOrg'

export function ShareDialog({ id, name, own, onClose }: { id: string; name: string | null; own: boolean; onClose: () => void }) {
  const t = useTranslations('vitrail.partage')
  const tf = useTranslations('vitrail.fiche')
  const tc = useTranslations('commun')
  const org = useOrg()
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? browserOrigin() : ''
  const link = `${origin}/vitrail?d=${id}&src=partage`
  const text = own ? t('texteMien', { org: org.name }) : name ? t('texteNom', { nom: name, org: org.name }) : t('texteAnonyme', { org: org.name })
  const canNative = typeof navigator !== 'undefined' && !!navigator.share

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-[900] flex items-end justify-center p-3 sm:items-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="card w-full max-w-sm space-y-2" style={{ background: '#121019' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <b>{own ? tf('partagerMien') : tf('partagerCe')}</b>
          <button className="muted px-2 text-xl leading-none" aria-label={tc('fermer')} onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted text-sm">{text}</p>
        {canNative && (
          <button className="btn" onClick={() => void navigator.share({ title: `${CONFIG.brand.name} — ${org.name}`, text, url: link }).catch(() => {})}>
            {t('natif')}
          </button>
        )}
        <button className="btn btn-ghost" onClick={copy}>
          {copied ? t('copie') : t('copier')}
        </button>
        <div className="flex gap-2">
          <a className="btn btn-ghost !py-3 text-sm" target="_blank" rel="noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`}>
            Facebook
          </a>
          <a className="btn btn-ghost !py-3 text-sm" href={`mailto:?subject=${encodeURIComponent(`${CONFIG.brand.name} — ${org.name}`)}&body=${encodeURIComponent(`${text}\n\n${link}`)}`}>
            {t('courriel')}
          </a>
        </div>
      </div>
    </div>
  )
}

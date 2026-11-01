'use client'

// Partager un morceau : lien direct vers lui dans le vitrail en ligne (/vitrail?d=…), par le menu de partage du
// téléphone, en copiant le lien, ou vers Facebook et le courriel.

import { useState } from 'react'
import { CONFIG } from '@/lib/config'

export function ShareDialog({ id, name, own, onClose }: { id: string; name: string | null; own: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '') : ''
  const link = `${origin}/vitrail?d=${id}&src=partage`
  const text = own
    ? `J'ai mon morceau de verre dans le vitrail de l'${CONFIG.orgName}. Ajoutez le vôtre!`
    : name
      ? `Le morceau de ${name} dans le vitrail de l'${CONFIG.orgName}. Chaque don devient un morceau de verre.`
      : `Un morceau du vitrail de l'${CONFIG.orgName}. Chaque don devient un morceau de verre.`
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
          <b>{own ? 'Partager mon morceau' : 'Partager ce morceau'}</b>
          <button className="muted px-2 text-xl leading-none" aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted text-sm">{text}</p>
        {canNative && (
          <button className="btn" onClick={() => void navigator.share({ title: CONFIG.appName, text, url: link }).catch(() => {})}>
            Partager…
          </button>
        )}
        <button className="btn btn-ghost" onClick={copy}>
          {copied ? 'Lien copié' : 'Copier le lien'}
        </button>
        <div className="flex gap-2">
          <a className="btn btn-ghost !py-3 text-sm" target="_blank" rel="noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`}>
            Facebook
          </a>
          <a className="btn btn-ghost !py-3 text-sm" href={`mailto:?subject=${encodeURIComponent(CONFIG.appName)}&body=${encodeURIComponent(`${text}\n\n${link}`)}`}>
            Courriel
          </a>
        </div>
      </div>
    </div>
  )
}

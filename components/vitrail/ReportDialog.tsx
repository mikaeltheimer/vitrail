'use client'

// Signaler un morceau (nom, message ou photo inappropriés) : l'équipe le voit dans la console.

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export function ReportDialog({ donorId, onClose }: { donorId: string; onClose: () => void }) {
  const t = useTranslations('vitrail.signalement')
  const tc = useTranslations('commun')
  const [reason, setReason] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle')

  const send = async () => {
    setState('busy')
    const res = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ donorId, reason }) }).catch(() => null)
    setState(res?.ok ? 'sent' : 'error')
  }

  return (
    <div className="fixed inset-0 z-[900] flex items-end justify-center p-3 sm:items-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="card w-full max-w-sm space-y-3" style={{ background: '#121019' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <b>{t('titre')}</b>
          <button className="muted px-2 text-xl leading-none" aria-label={tc('fermer')} onClick={onClose}>
            ×
          </button>
        </div>
        {state === 'sent' ? (
          <>
            <p className="text-sm">{t('merci')}</p>
            <button className="btn btn-ghost" onClick={onClose}>
              {tc('fermer')}
            </button>
          </>
        ) : (
          <>
            <p className="muted text-sm">{t('invite')}</p>
            <textarea className="field" rows={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder={t('motif')} />
            {state === 'error' && <p className="text-sm" style={{ color: '#f87171' }}>{t('erreur')}</p>}
            <button className="btn" disabled={state === 'busy'} onClick={send}>
              {state === 'busy' ? t('envoi') : t('envoyer')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

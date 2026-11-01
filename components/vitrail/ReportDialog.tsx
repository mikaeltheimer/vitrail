'use client'

// Signaler un morceau (nom, message ou photo inappropriés) : l'équipe le voit dans la console.

import { useState } from 'react'

export function ReportDialog({ donorId, onClose }: { donorId: string; onClose: () => void }) {
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
          <b>Signaler ce morceau</b>
          <button className="muted px-2 text-xl leading-none" aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </div>
        {state === 'sent' ? (
          <>
            <p className="text-sm">Merci. L&apos;équipe de l&apos;école va le regarder rapidement.</p>
            <button className="btn btn-ghost" onClick={onClose}>
              Fermer
            </button>
          </>
        ) : (
          <>
            <p className="muted text-sm">Un nom, un message ou une photo inappropriés? Dites-nous ce qui ne va pas (facultatif).</p>
            <textarea className="field" rows={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="Motif" />
            {state === 'error' && <p className="text-sm" style={{ color: '#f87171' }}>Le signalement n&apos;a pas pu être envoyé. Réessayez.</p>}
            <button className="btn" disabled={state === 'busy'} onClick={send}>
              {state === 'busy' ? 'Envoi…' : 'Envoyer le signalement'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

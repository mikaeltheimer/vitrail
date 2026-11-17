'use client'

// Fenêtre de confirmation de Donivers, à la place de window.confirm() (Mika, 17 nov. 2026 : celle du navigateur
// détonne et ne dit pas d'où elle vient). Usage :
//   const [dialog, confirm] = useConfirm()
//   if (!(await confirm({ title, text, confirmLabel, cancelLabel }))) return
//   …et rendre {dialog} quelque part dans le composant.
// Échap ou un clic à côté : annuler. Le bouton de confirmation prend le focus (Entrée confirme).

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ConfirmOptions {
  title: string
  text?: string
  confirmLabel: string
  cancelLabel: string
  /** Geste destructif (perte de changements, suppression) : bouton rouge plutôt que doré. */
  danger?: boolean
}

export function useConfirm(): [React.ReactNode, (o: ConfirmOptions) => Promise<boolean>] {
  const [open, setOpen] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)
  const ask = useCallback((o: ConfirmOptions) => {
    resolver.current?.(false)
    setOpen(o)
    return new Promise<boolean>(resolve => {
      resolver.current = resolve
    })
  }, [])
  const close = useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOpen(null)
  }, [])
  return [open ? <ConfirmDialog options={open} onClose={close} /> : null, ask]
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-[2000] grid place-items-center p-4"
      style={{ background: 'rgba(6,6,10,0.66)', backdropFilter: 'blur(3px)' }}
      onClick={e => e.target === e.currentTarget && onClose(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-titre"
        aria-describedby={options.text ? 'confirm-texte' : undefined}
        className="w-full max-w-[420px] space-y-3 rounded-2xl p-5"
        style={{ background: '#14121D', border: '1px solid rgba(240,178,74,0.4)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', color: '#F4EFE6', fontFamily: "'DM Sans', sans-serif" }}
      >
        <h2 id="confirm-titre" className="m-0 text-lg font-semibold leading-snug">
          {options.title}
        </h2>
        {options.text && (
          <p id="confirm-texte" className="m-0 text-[15px] leading-relaxed" style={{ color: 'rgba(244,239,230,0.82)' }}>
            {options.text}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button type="button" className="chip !px-4 !py-2 text-[14px]" onClick={() => onClose(false)}>
            {options.cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="btn !w-auto !px-4 !py-2 !text-[14px]"
            style={options.danger ? { background: '#E5534B', color: '#fff' } : undefined}
            onClick={() => onClose(true)}
          >
            {options.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

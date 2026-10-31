'use client'

import { useEffect, useRef, useState } from 'react'
import { squareJpeg, uploadPhoto } from '@/lib/photoClient'

export interface PhotoValue {
  /** Aperçu immédiat (blob local) ou adresse de la photo déjà enregistrée. */
  src: string | null
  /** Chemin renvoyé par /api/photo pour une nouvelle photo ; null = pas de nouvelle photo. */
  path: string | null
}

/** Choix d'une photo : recadrage carré et envoi immédiats, pour que le don lui-même soit instantané. */
export default function PhotoField({ value, onChange, onBusyChange }: { value: PhotoValue; onChange: (v: PhotoValue) => void; onBusyChange?: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blobUrl = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current)
    },
    [],
  )

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    onBusyChange?.(true)
    try {
      const blob = await squareJpeg(file)
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current)
      blobUrl.current = URL.createObjectURL(blob)
      onChange({ src: blobUrl.current, path: null }) // l'aperçu apparaît tout de suite
      const path = await uploadPhoto(blob)
      onChange({ src: blobUrl.current, path })
    } catch (e) {
      setError((e as Error).message)
      onChange({ src: null, path: null })
    } finally {
      setBusy(false)
      onBusyChange?.(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        {value.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.src} alt="Votre photo" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px dashed var(--line)' }} aria-hidden>
            +
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="chip !px-4 text-sm" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? 'Envoi…' : value.src ? 'Changer la photo' : 'Ajouter une photo'}
          </button>
          {value.src && !busy && (
            <button type="button" className="muted text-sm underline" onClick={() => onChange({ src: null, path: null })}>
              Retirer
            </button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={e => void pick(e.target.files?.[0])} />
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: '#f87171' }}>{error}</p>}
      <p className="muted mt-2 text-xs">Votre photo sera visible par tous sur l&apos;écran de l&apos;école. Elle est recadrée en carré.</p>
    </div>
  )
}

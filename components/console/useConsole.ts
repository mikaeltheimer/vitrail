'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ConsoleData } from './types'

/** Charge la console et la tient à jour (toutes les 5 s) ; `act` envoie une action puis recharge. */
export function useConsole() {
  const t = useTranslations('console')
  const [data, setData] = useState<ConsoleData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)
  // Décisions de modération : le donateur reçoit un courriel, sauf si l'équipe décoche (pourriel, abus)
  const [notifyDonor, setNotifyDonor] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin', { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) {
        window.location.reload()
        return
      }
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        setLoadError(b.error ?? res.statusText)
        return
      }
      setLoadError(null)
      setData(await res.json())
    } catch {
      setLoadError(t('erreurReseau'))
    }
  }, [t])

  useEffect(() => {
    const first = setTimeout(() => void load(), 0)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 5000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [load])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(id)
  }, [toast])

  const act = useCallback(
    async (payload: Record<string, unknown>, okText?: string) => {
      const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, notify: notifyDonor }) })
      const body = (await res.json().catch(() => ({}))) as { error?: string; url?: string }
      setToast(res.ok ? { ok: true, text: okText ?? t('fait') } : { ok: false, text: body.error || t('erreur') })
      if (res.ok) await load()
      return res.ok
    },
    [load, notifyDonor, t],
  )

  /** Actions qui renvoient une adresse à ouvrir (Stripe). */
  const open = useCallback(
    async (action: string, sameTab = false) => {
      const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const body = (await res.json().catch(() => ({}))) as { error?: string; url?: string }
      if (res.ok && body.url) {
        if (sameTab) window.location.href = body.url
        else window.open(body.url, '_blank', 'noopener')
      } else setToast({ ok: false, text: body.error || t('erreur') })
    },
    [t],
  )

  return { data, loadError, toast, setToast, act, open, load, notifyDonor, setNotifyDonor }
}

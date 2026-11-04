'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CONFIG } from '@/lib/config'

export default function AdminLogin() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
    if (res.ok) {
      router.refresh()
      return
    }
    setError((await res.json().catch(() => ({}))).error || 'Erreur.')
    setBusy(false)
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">Console</h1>
      <p className="muted mt-1 text-sm">{CONFIG.brand.name} — réservé à l&apos;équipe.</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input className="field" type="password" autoComplete="current-password" placeholder="Code d'accès" value={code} onChange={e => setCode(e.target.value)} autoFocus />
        {error && <p role="alert" className="text-sm" style={{ color: '#f87171' }}>{error}</p>}
        <button className="btn" disabled={busy || !code}>
          Entrer
        </button>
      </form>
    </main>
  )
}

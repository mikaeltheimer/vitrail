'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ConsoleData } from './types'
import { GREEN, RED, Section, Sheet } from './ui'

// Réglages › Adresse et site web (propriétaire, organisme réel). Règles : lib/org-address.ts. Le nombre de changements
// restants est rappelé juste avant de valider (décision du 12 novembre 2026).

type Address = NonNullable<ConsoleData['address']>
type State = 'idle' | 'busy' | 'disponible' | 'retour' | 'meme' | 'pris' | 'forme' | 'reserve'

async function post(payload: Record<string, unknown>) {
  const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  return { ok: res.ok, b: (await res.json().catch(() => ({}))) as { state?: State; url?: string; error?: string } }
}

export default function Adresse({ address, onError }: { address: Address; onError: (text: string) => void }) {
  const t = useTranslations('console.adresse')
  const tc = useTranslations('console')
  const [open, setOpen] = useState(false)
  const canChange = address.changesLeft !== 0 || address.previous.length > 0
  return (
    <Section title={t('titre')}>
      <div className="card space-y-3 text-sm">
        <p>
          {t('actuelle')}{' '}
          <b className="break-all">
            {address.current}
            <span className="muted font-normal">.{address.domain}</span>
          </b>
        </p>
        <p className="muted text-xs">{address.draft ? t('brouillon') : address.changesLeft ? t('restants', { count: address.changesLeft, max: address.max }) : t('aucunRestant', { max: address.max })}</p>
        {!address.draft && address.changesLeft === 0 && address.previous.length > 0 && <p className="muted text-xs">{t('retourSeul')}</p>}
        {address.previous.length > 0 && <p className="muted text-xs">{t('anciennes', { list: address.previous.join(', ') })}</p>}
        {canChange && (
          <button className="btn btn-ghost" onClick={() => setOpen(true)}>
            {t('changer')}
          </button>
        )}
      </div>
      {open && <ChangeSheet address={address} onClose={() => setOpen(false)} onError={onError} closeLabel={tc('fermer')} />}
    </Section>
  )
}

function ChangeSheet({ address, onClose, onError, closeLabel }: { address: Address; onClose: () => void; onError: (text: string) => void; closeLabel: string }) {
  const t = useTranslations('console.adresse')
  const tc = useTranslations('console')
  const [slug, setSlug] = useState('')
  const [state, setState] = useState<State>('idle')
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)

  const check = (value: string) => {
    if (timer.current) clearTimeout(timer.current)
    if (!value) return setState('idle')
    setState('busy')
    const mine = ++seq.current
    timer.current = setTimeout(async () => {
      const { ok, b } = await post({ action: 'checkAddress', slug: value })
      if (mine === seq.current) setState(ok && b.state ? b.state : 'idle')
    }, 350)
  }

  const isNew = state === 'disponible'
  const blocked = isNew && address.changesLeft === 0
  const ready = (state === 'disponible' || state === 'retour') && !blocked
  const good = state === 'disponible' || state === 'retour'

  return (
    <Sheet title={t('titre')} onClose={onClose} closeLabel={closeLabel}>
      <form
        className="space-y-5 text-sm"
        onSubmit={async e => {
          e.preventDefault()
          if (!ready || busy) return
          setBusy(true)
          const { ok, b } = await post({ action: 'changeAddress', slug })
          if (ok && b.url) {
            // La console continue à la nouvelle adresse (la session vaut pour toute la plateforme)
            window.location.href = b.url
            return
          }
          setBusy(false)
          onError(b.error || tc('erreur'))
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nouvelle-adresse">{t('nouvelle')}</label>
          <div className="field flex items-stretch !p-0" style={{ borderColor: good && !blocked ? 'rgba(61,181,166,0.6)' : state === 'idle' || state === 'busy' ? undefined : 'rgba(245,143,163,0.7)' }}>
            <input
              id="nouvelle-adresse"
              className="min-w-0 flex-1 bg-transparent py-3 pl-3.5 outline-none"
              value={slug}
              maxLength={33}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              placeholder={address.current}
              onChange={e => {
                const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                setSlug(v)
                check(v)
              }}
              aria-describedby="nouvelle-adresse-etat nouvelle-adresse-aide"
            />
            <span className="muted flex items-center whitespace-nowrap px-3 text-[13px]">.{address.domain}</span>
          </div>
          <span id="nouvelle-adresse-etat" aria-live="polite" className="text-[13px]" style={{ color: good && !blocked ? GREEN : state === 'busy' || state === 'idle' ? 'var(--muted)' : RED }}>
            {state === 'busy' && t('verification')}
            {state === 'disponible' && (blocked ? t('limite') : t('disponible'))}
            {state === 'retour' && t('retour')}
            {state === 'meme' && t('meme')}
            {state === 'pris' && t('pris')}
            {state === 'reserve' && t('reserve')}
            {state === 'forme' && t('forme')}
          </span>
          <span id="nouvelle-adresse-aide" className="muted text-[13px]">
            {t('aide')}
          </span>
        </div>

        <div className="card space-y-2">
          <p className="font-bold">{t('suiteTitre')}</p>
          {address.draft ? (
            <p className="muted">{t('suiteBrouillon')}</p>
          ) : (
            <>
              <p className="muted">{t('suiteEnLigne')}</p>
              <p className="muted">{t('suiteFacebook')}</p>
            </>
          )}
        </div>

        {/* Le rappel du nombre de changements, juste avant le bouton */}
        {!address.draft && state === 'retour' && <p>{t('retourGratuit')}</p>}
        {!address.draft && isNew && !blocked && (
          <p className="font-bold" style={{ color: address.changesLeft === 1 ? 'var(--accent)' : undefined }}>
            {address.changesLeft === 1 ? t('dernier') : t('apres', { count: (address.changesLeft ?? 1) - 1 })}
          </p>
        )}

        <button className="btn w-full" disabled={!ready || busy}>
          {busy ? t('enCours') : t('confirmer', { adresse: ready ? `${slug}.${address.domain}` : '…' })}
        </button>
      </form>
    </Sheet>
  )
}

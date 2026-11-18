'use client'

/* eslint-disable @next/next/no-img-element -- logos servis par le bucket public de la plateforme */
import { useCallback, useEffect, useState } from 'react'
import { squareJpeg } from '@/lib/photoClient'
import { askConfirm } from '@/components/ConfirmDialog'

// Démonstrations par projet (section Studio, en français) : un vitrail de démonstration au nom d'un organisme précis,
// pour une rencontre de vente ou d'accueil. Voir lib/demo-projets.ts et app/api/studio/demos.

type Lang = 'fr' | 'en'
type Field = 'name' | 'vitrailTitle' | 'why' | 'about'
type Texts = Partial<Record<Lang, Partial<Record<Field, string>>>>

interface Demo {
  id: string
  slug: string
  name: string
  locales: Lang[]
  texts: Texts
  logoUrl: string | null
  iconUrl: string | null
  createdAt: string
  donors: number
  totalCents: number
  photos: number
  namedWithoutPhoto: number
  links: { vitrail: string; ecran: string; screen: string }
}
interface Data {
  max: number
  demos: Demo[]
}
interface Form {
  id: string | null
  slug: string
  slugTouched: boolean
  langs: 'fr' | 'en' | 'fr+en' | 'en+fr'
  texts: Texts
}

const LANGS: Record<Form['langs'], { label: string; locales: Lang[] }> = {
  fr: { label: 'Français', locales: ['fr'] },
  'fr+en': { label: 'Français, puis anglais', locales: ['fr', 'en'] },
  'en+fr': { label: 'Anglais, puis français', locales: ['en', 'fr'] },
  en: { label: 'Anglais', locales: ['en'] },
}
const LANG_NAME: Record<Lang, string> = { fr: 'français', en: 'anglais' }
const FIELDS: { key: Field; label: string; max: number; rows?: number; hint?: string }[] = [
  { key: 'name', label: 'Nom de l’organisme', max: 80 },
  { key: 'vitrailTitle', label: 'Titre du vitrail (facultatif)', max: 60, hint: 'Vide : « Notre communauté, enfin visible ».' },
  { key: 'why', label: 'Pourquoi donner (facultatif)', max: 400, rows: 3, hint: 'Vide : le texte neutre de la plateforme, au nom de l’organisme.' },
  { key: 'about', label: 'Présentation (facultatif)', max: 1200, rows: 4, hint: 'Vide : la section ne s’affiche pas.' },
]
const blank: Form = { id: null, slug: '', slugTouched: false, langs: 'fr', texts: {} }

/** « École d’art de Sutton » → « ecole-d-art-de-sutton » (33 caractères au plus : place pour le suffixe de l'atelier). */
const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 33)
    .replace(/-+$/, '')

const langsOf = (locales: Lang[]): Form['langs'] => (locales.length === 2 ? (locales[0] === 'en' ? 'en+fr' : 'fr+en') : locales[0] === 'en' ? 'en' : 'fr')

/** Réduit l'image dans le navigateur (et rastérise un SVG), en PNG : la transparence est gardée. Comme dans l'atelier. */
async function toPng(file: File, maxW: number, maxH: number): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const w0 = img.naturalWidth || maxW
    const h0 = img.naturalHeight || maxH
    for (const shrink of [1, 0.75, 0.5]) {
      const k = Math.min(1, maxW / w0, maxH / h0) * shrink
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(w0 * k))
      canvas.height = Math.max(1, Math.round(h0 * k))
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
      if (blob && blob.size <= 600_000) return blob
    }
    throw new Error('trop lourde')
  } finally {
    URL.revokeObjectURL(url)
  }
}

const money = (c: number) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(c / 100)
const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })

export default function DemosProjet() {
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null)

  const call = useCallback(async (init?: RequestInit): Promise<boolean> => {
    const res = await fetch('/api/studio/demos', { cache: 'no-store', ...init })
    const b = (await res.json().catch(() => ({}))) as Data & { error?: string }
    if (res.ok) {
      setData(b)
      setError(null)
      return true
    }
    setError(b.error || 'Erreur.')
    return false
  }, [])
  useEffect(() => {
    const id = setTimeout(() => void call(), 0)
    return () => clearTimeout(id)
  }, [call])

  const post = async (body: Record<string, unknown>, label: string): Promise<boolean> => {
    setBusy(label)
    const ok = await call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(null)
    return ok
  }

  const sendImage = async (d: Demo, type: 'logo' | 'icon', file: File) => {
    setBusy(type === 'logo' ? 'Logo…' : 'Icône…')
    try {
      const png = type === 'logo' ? await toPng(file, 800, 300) : await toPng(file, 256, 256)
      const res = await fetch(`/api/studio/demos/image?id=${encodeURIComponent(d.id)}&type=${type}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png })
      if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Image refusée.')
    } catch {
      setError('Image illisible ou trop lourde.')
    }
    setBusy(null)
    await call()
  }
  const removeImage = async (d: Demo, type: 'logo' | 'icon') => {
    setBusy('Retrait…')
    await fetch(`/api/studio/demos/image?id=${encodeURIComponent(d.id)}&type=${type}`, { method: 'DELETE' })
    setBusy(null)
    await call()
  }
  const sendPhotos = async (d: Demo, files: FileList) => {
    let done = 0
    let failed = 0
    for (const f of Array.from(files)) {
      setBusy(`Photos : ${done + failed + 1} sur ${files.length}…`)
      try {
        const blob = await squareJpeg(f)
        const res = await fetch(`/api/studio/demos/photo?id=${encodeURIComponent(d.id)}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
        if (res.ok) done++
        else {
          failed++
          if (res.status === 409) break
        }
      } catch {
        failed++
      }
    }
    setBusy(null)
    await call()
    if (failed) setError(`${done} photo(s) ajoutée(s), ${failed} refusée(s).`)
  }

  const full = !!data && data.demos.length >= data.max

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Démonstrations par projet</h2>
        {!form && (
          <button className="btn btn-ghost !w-auto !rounded-full !px-4 !py-2 !text-sm" disabled={!data || full || !!busy} onClick={() => setForm(blank)}>
            Nouvelle démonstration
          </button>
        )}
      </div>
      <div className="card space-y-3 text-sm">
        <p className="muted">
          Un vitrail de démonstration au nom d’un organisme précis, pour une rencontre : son nom, son logo, ses textes, sa propre adresse. Les donateurs et les dons sont fictifs, et la page le dit en
          tout temps. Lecture seule : aucun don, aucun signalement, rien dans les chiffres.
        </p>
        <p className="muted text-xs">
          Avant d’utiliser le nom et le logo d’un organisme, assurez-vous qu’il est d’accord (ou gardez le lien pour la rencontre). Supprimez la démonstration quand elle ne sert plus : l’adresse
          redevient libre pour le vrai vitrail.
        </p>
        {error && <p style={{ color: '#F58FA3' }}>{error}</p>}
        {busy && <p role="status">{busy}</p>}
        {data && !data.demos.length && !form && <p>Aucune démonstration par projet pour l’instant.</p>}
        {full && <p className="muted">Limite atteinte ({data!.max}) : supprimez une démonstration qui ne sert plus.</p>}
      </div>

      {form && (
        <DemoForm
          form={form}
          setForm={setForm}
          busy={!!busy}
          onSubmit={async () => {
            const locales = LANGS[form.langs].locales
            const texts: Texts = {}
            for (const l of locales) texts[l] = form.texts[l] ?? {}
            const ok = form.id
              ? await post({ action: 'update', id: form.id, locales, texts }, 'Enregistrement et régénération…')
              : await post({ action: 'create', slug: form.slug, locales, texts }, 'Création…')
            if (ok) setForm(null)
          }}
        />
      )}

      {data?.demos.map(d => (
        <div key={d.id} className="card space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            {d.logoUrl ? (
              <img src={d.logoUrl} alt="" style={{ height: 36, width: 'auto', maxWidth: 160, objectFit: 'contain' }} />
            ) : (
              <span className="muted text-xs" style={{ border: '1px dashed rgba(255,255,255,0.25)', borderRadius: 8, padding: '8px 10px' }}>Sans logo</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-bold">{d.name}</div>
              <div className="muted text-xs">
                {d.slug} · {d.locales.map(l => LANG_NAME[l]).join(', ')} · créée le {jour(d.createdAt)}
              </div>
            </div>
          </div>
          <p>
            <b>{d.donors}</b> donateurs fictifs · <b>{money(d.totalCents)}</b> · <b>{d.photos}</b> photo(s), {d.namedWithoutPhoto} fragment(s) nommé(s) sans photo
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <a className="underline" href={d.links.vitrail} target="_blank" rel="noreferrer">Vitrail</a>
            {d.locales.includes('fr') && <a className="underline" href={d.links.ecran} target="_blank" rel="noreferrer">Écran (FR)</a>}
            {d.locales.includes('en') && <a className="underline" href={d.links.screen} target="_blank" rel="noreferrer">Écran (EN)</a>}
            <button className="underline" onClick={() => void navigator.clipboard?.writeText(d.links.vitrail)}>Copier le lien</button>
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="btn btn-ghost !w-auto cursor-pointer">
              {d.logoUrl ? 'Changer le logo…' : 'Ajouter le logo…'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" disabled={!!busy} onChange={e => { if (e.target.files?.[0]) void sendImage(d, 'logo', e.target.files[0]); e.target.value = '' }} />
            </label>
            <label className="btn btn-ghost !w-auto cursor-pointer">
              {d.iconUrl ? 'Changer l’icône…' : 'Ajouter l’icône…'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" disabled={!!busy} onChange={e => { if (e.target.files?.[0]) void sendImage(d, 'icon', e.target.files[0]); e.target.value = '' }} />
            </label>
            <label className="btn btn-ghost !w-auto cursor-pointer">
              Ajouter des photos…
              <input type="file" accept="image/*" multiple className="sr-only" disabled={!!busy} onChange={e => { if (e.target.files?.length) void sendPhotos(d, e.target.files); e.target.value = '' }} />
            </label>
            <button className="btn btn-ghost !w-auto" disabled={!!busy} onClick={() => setForm({ id: d.id, slug: d.slug, slugTouched: true, langs: langsOf(d.locales), texts: d.texts })}>
              Modifier les textes
            </button>
            <button
              className="btn btn-ghost !w-auto"
              disabled={!!busy}
              onClick={() =>
                void askConfirm({ title: `Régénérer les donateurs de ${d.name} ?`, text: 'Les dates sont replacées à aujourd’hui ; les photos sont gardées et redistribuées.', confirmLabel: 'Régénérer', cancelLabel: 'Annuler' }).then(
                  ok => ok && post({ action: 'regenerate', id: d.id }, 'Génération…'),
                )
              }
            >
              Régénérer
            </button>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {d.logoUrl && <button className="muted underline" disabled={!!busy} onClick={() => void removeImage(d, 'logo')}>Retirer le logo</button>}
            {d.iconUrl && <button className="muted underline" disabled={!!busy} onClick={() => void removeImage(d, 'icon')}>Retirer l’icône</button>}
            {!!d.photos && (
              <button
                className="muted underline"
                disabled={!!busy}
                onClick={() =>
                  void askConfirm({ title: `Retirer les ${d.photos} photo(s) de ${d.name} ?`, text: 'Les fichiers sont effacés.', confirmLabel: 'Retirer', cancelLabel: 'Annuler', danger: true }).then(
                    ok => ok && post({ action: 'removePhotos', id: d.id }, 'Retrait…'),
                  )
                }
              >
                Retirer les photos
              </button>
            )}
            <button
              className="underline"
              style={{ color: '#F58FA3' }}
              disabled={!!busy}
              onClick={() =>
                void askConfirm({
                  title: `Supprimer la démonstration de ${d.name} ?`,
                  text: `Le vitrail, ses donateurs fictifs, son logo et ses photos sont effacés. L’adresse « ${d.slug} » redevient libre.`,
                  confirmLabel: 'Supprimer',
                  cancelLabel: 'Garder',
                  danger: true,
                }).then(ok => ok && post({ action: 'delete', id: d.id }, 'Suppression…'))
              }
            >
              Supprimer la démonstration
            </button>
          </p>
        </div>
      ))}
      <p className="muted text-xs">Photos : seulement celles que Studio a le droit de montrer ; jamais de banque d’images de visages.</p>
    </section>
  )
}

function DemoForm({ form, setForm, busy, onSubmit }: { form: Form; setForm: (f: Form | null) => void; busy: boolean; onSubmit: () => Promise<void> }) {
  const locales = LANGS[form.langs].locales
  const set = (l: Lang, key: Field, value: string) => {
    const texts = { ...form.texts, [l]: { ...(form.texts[l] ?? {}), [key]: value } }
    // L'adresse suit le nom (langue principale) tant qu'on ne l'a pas écrite soi-même
    const follow = !form.id && !form.slugTouched && key === 'name' && l === locales[0]
    setForm({ ...form, texts, ...(follow ? { slug: slugify(value) } : {}) })
  }
  return (
    <form
      className="card space-y-4 text-sm"
      onSubmit={e => {
        e.preventDefault()
        void onSubmit()
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">{form.id ? 'Modifier la démonstration' : 'Nouvelle démonstration'}</h3>
        <button type="button" className="muted underline" onClick={() => setForm(null)}>Fermer</button>
      </div>
      <label className="flex flex-col gap-1.5">
        Langues du vitrail
        <select className="field" value={form.langs} onChange={e => setForm({ ...form, langs: e.target.value as Form['langs'] })}>
          {(Object.keys(LANGS) as Form['langs'][]).map(k => (
            <option key={k} value={k}>{LANGS[k].label}</option>
          ))}
        </select>
      </label>
      {locales.map((l, i) => (
        <fieldset key={l} className="grid gap-3">
          <legend className="pb-1 font-bold">{locales.length > 1 ? `Textes en ${LANG_NAME[l]}${i === 0 ? ' (langue principale)' : ' (vides : ceux de la langue principale)'}` : 'Textes'}</legend>
          {FIELDS.map(f => (
            <label key={f.key} className="flex flex-col gap-1.5">
              {f.label}
              {f.rows ? (
                <textarea className="field" rows={f.rows} maxLength={f.max} value={form.texts[l]?.[f.key] ?? ''} onChange={e => set(l, f.key, e.target.value)} />
              ) : (
                <input className="field" maxLength={f.max} required={f.key === 'name' && i === 0} minLength={f.key === 'name' && i === 0 ? 2 : undefined} value={form.texts[l]?.[f.key] ?? ''} onChange={e => set(l, f.key, e.target.value)} />
              )}
              {f.hint && <span className="muted text-xs">{f.hint}</span>}
            </label>
          ))}
        </fieldset>
      ))}
      {!form.id && (
        <label className="flex flex-col gap-1.5">
          Adresse du vitrail
          <input
            className="field"
            required
            minLength={3}
            maxLength={33}
            pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
            value={form.slug}
            onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''), slugTouched: true })}
          />
          <span className="muted text-xs">Le sous-domaine : lettres minuscules, chiffres et tirets. Ne se change pas ensuite (supprimer puis recréer).</span>
        </label>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="muted text-xs">{form.id ? 'Les donateurs fictifs sont régénérés ; le logo et les photos restent.' : 'Le logo et les photos s’ajoutent juste après.'}</span>
        <button className="btn !w-auto" disabled={busy}>{form.id ? 'Enregistrer' : 'Créer la démonstration'}</button>
      </div>
    </form>
  )
}

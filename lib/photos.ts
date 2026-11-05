import { randomUUID } from 'node:crypto'
import { getDb } from './db'
import { requireEnv } from './env'
import type { Result } from './validate'
import { err } from './errors'

// Photos des donateurs : le navigateur recadre en carré et réduit (JPEG), le serveur vérifie et range dans le bucket
// public « photos ». Une photo n'est affichée que si le donateur a consenti à l'affichage de son nom.

export const PHOTO_BUCKET = 'photos'
export const PHOTO_MAX_BYTES = 700_000
const PATH_RE = /^u\/[0-9a-f-]{36}\.jpg$/

function prefix(): string {
  return `${requireEnv('SUPABASE_URL').replace(/\/$/, '')}/storage/v1/object/public/${PHOTO_BUCKET}/`
}

export function publicPhotoUrl(path: string): string {
  return prefix() + path
}

/** Chemin dans le bucket, si l'adresse est bien une photo de NOTRE bucket (jamais une adresse extérieure). */
export function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(prefix())) return null
  const path = url.slice(prefix().length)
  return PATH_RE.test(path) ? path : null
}

/** Valide le chemin renvoyé par /api/photo et en tire l'adresse publique. Vide = pas de photo. */
export function validatePhotoPath(input: unknown): Result<string | null> {
  if (input == null || input === '') return { ok: true, value: null }
  if (typeof input !== 'string' || !PATH_RE.test(input)) return { ok: false, error: err('photoInvalide') }
  return { ok: true, value: publicPhotoUrl(input) }
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

export async function uploadPhoto(bytes: Buffer): Promise<string> {
  const path = `u/${randomUUID()}.jpg`
  const { error } = await getDb().storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
  if (error) throw error
  return path
}

/** Supprime le fichier d'une photo remplacée ou retirée. Sans gravité si ça échoue. */
export async function removePhotoFile(url: string | null | undefined): Promise<void> {
  const path = pathFromPublicUrl(url)
  if (!path) return
  const { error } = await getDb().storage.from(PHOTO_BUCKET).remove([path])
  if (error) console.error('Suppression de la photo échouée (sans gravité) :', error.message)
}

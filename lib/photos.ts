import { randomUUID } from 'node:crypto'
import { getDb } from './db'
import { requireEnv } from './env'
import type { Result } from './validate'
import { err } from './errors'

// Photos des donateurs : le navigateur recadre en carré et réduit (JPEG), le serveur vérifie et range dans le bucket
// public « photos ». Une photo n'est affichée que si le donateur a consenti à l'affichage de son nom.

export const PHOTO_BUCKET = 'photos'
export const PHOTO_MAX_BYTES = 700_000

// Rangement : chaque organisme a son dossier, org/<organisme>/ (logos et icônes de l'atelier y sont déjà) ; les photos
// des donateurs dans org/<organisme>/d/<uuid>.jpg. Avant l'étape A, elles étaient toutes dans u/<uuid>.jpg, sans
// organisme : ces anciens chemins sont encore reconnus pour les EFFACER et les ranger (lib/photo-migration.ts),
// jamais pour attacher une photo à un nouveau don.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const ORG_ID = '[0-9a-z-]{1,40}'
const DONOR_PATH_RE = new RegExp(`^org/(${ORG_ID})/d/${UUID}\\.jpg$`)
export const LEGACY_PATH_RE = new RegExp(`^u/(${UUID})\\.jpg$`)

/** Dossier des photos des donateurs d'un organisme (avec la barre finale). */
export const donorPhotoDir = (orgId: string): string => `org/${orgId}/d/`

/** Organisme d'un chemin de photo de donateur, ou null (ancien chemin u/ ou chemin inconnu). */
export function orgOfPhotoPath(path: string): string | null {
  return DONOR_PATH_RE.exec(path)?.[1] ?? null
}

function prefix(): string {
  return `${requireEnv('SUPABASE_URL').replace(/\/$/, '')}/storage/v1/object/public/${PHOTO_BUCKET}/`
}

export function publicPhotoUrl(path: string): string {
  return prefix() + path
}

/**
 * Chemin dans le bucket, si l'adresse est bien une photo de donateur de NOTRE bucket (jamais une adresse extérieure).
 * Avec un organisme : seulement une photo rangée chez lui, ou un ancien chemin u/ (à effacer ou à ranger).
 */
export function pathFromPublicUrl(url: string | null | undefined, orgId?: string): string | null {
  if (!url || !url.startsWith(prefix())) return null
  const path = url.slice(prefix().length)
  if (LEGACY_PATH_RE.test(path)) return path
  const owner = orgOfPhotoPath(path)
  return owner && (!orgId || owner === orgId) ? path : null
}

/** Vrai si l'adresse est une photo rangée chez CET organisme : la seule qu'on accepte d'attacher à un de ses donateurs. */
export function isOrgPhotoUrl(url: string | null | undefined, orgId: string): boolean {
  if (!url || !url.startsWith(prefix())) return false
  return orgOfPhotoPath(url.slice(prefix().length)) === orgId
}

/** Valide le chemin renvoyé par /api/photo (rangé chez CET organisme) et en tire l'adresse publique. Vide = pas de photo. */
export function validatePhotoPath(input: unknown, orgId: string): Result<string | null> {
  if (input == null || input === '') return { ok: true, value: null }
  if (typeof input !== 'string' || orgOfPhotoPath(input) !== orgId) return { ok: false, error: err('photoInvalide') }
  return { ok: true, value: publicPhotoUrl(input) }
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

export async function uploadPhoto(orgId: string, bytes: Buffer): Promise<string> {
  const path = `${donorPhotoDir(orgId)}${randomUUID()}.jpg`
  const { error } = await getDb().storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
  if (error) throw error
  return path
}

/** Supprime le fichier d'une photo remplacée ou retirée (de cet organisme, ou ancien chemin). Sans gravité si ça échoue. */
export async function removePhotoFile(url: string | null | undefined, orgId?: string): Promise<void> {
  const path = pathFromPublicUrl(url, orgId)
  if (!path) return
  const { error } = await getDb().storage.from(PHOTO_BUCKET).remove([path])
  if (error) console.error('Suppression de la photo échouée (sans gravité) :', error.message)
}

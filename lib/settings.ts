import { getDb } from './db'

// Réglages modifiables depuis la console, gardés en base (table settings) avec un court cache en mémoire.

export type PhotoModeration = 'live' | 'moderation'

let cache: { value: PhotoModeration; at: number } | null = null

/** « live » : les photos sont publiées tout de suite ; « moderation » : chaque nouvelle photo attend une approbation. */
export async function getPhotoModeration(): Promise<PhotoModeration> {
  if (cache && Date.now() - cache.at < 5000) return cache.value
  const { data, error } = await getDb().from('settings').select('value').eq('key', 'photo_moderation').maybeSingle()
  if (error) throw error
  const value: PhotoModeration = data?.value === 'moderation' ? 'moderation' : 'live'
  cache = { value, at: Date.now() }
  return value
}

export async function setPhotoModeration(value: PhotoModeration): Promise<void> {
  const { error } = await getDb()
    .from('settings')
    .upsert({ key: 'photo_moderation', value, updated_at: new Date().toISOString() })
  if (error) throw error
  cache = { value, at: Date.now() }
}

/** Statut d'une photo qu'on vient de recevoir, selon le mode en cours. */
export async function newPhotoStatus(): Promise<'approved' | 'pending'> {
  return (await getPhotoModeration()) === 'moderation' ? 'pending' : 'approved'
}

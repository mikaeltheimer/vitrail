import { getDb } from './db'
import { forgetTenantCache, getOrg } from './tenant'

// Réglage de modération des photos et témoignages : un par organisme (organizations.photo_moderation).

export type PhotoModeration = 'live' | 'moderation'

/** « live » : publiés tout de suite ; « moderation » : chaque nouveauté attend une approbation. */
export async function getPhotoModeration(orgId: string): Promise<PhotoModeration> {
  const org = await getOrg(orgId)
  return org?.photoModeration === 'moderation' ? 'moderation' : 'live'
}

export async function setPhotoModeration(orgId: string, value: PhotoModeration): Promise<void> {
  const { error } = await getDb().from('organizations').update({ photo_moderation: value }).eq('id', orgId)
  if (error) throw error
  forgetTenantCache()
}

/** Statut d'une photo ou d'un témoignage qu'on vient de recevoir, selon le mode de l'organisme. */
export async function newPhotoStatus(orgId: string): Promise<'approved' | 'pending'> {
  return (await getPhotoModeration(orgId)) === 'moderation' ? 'pending' : 'approved'
}

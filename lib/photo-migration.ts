import { getDb } from './db'
import { LEGACY_PATH_RE, PHOTO_BUCKET, donorPhotoDir, pathFromPublicUrl, publicPhotoUrl } from './photos'

// Rangement des anciennes photos (étape A) : u/<uuid>.jpg → org/<organisme>/d/<uuid>.jpg, une seule fois par base.
// Lancé depuis la section Studio (essai à blanc d'abord). Idempotent : on peut le relancer après une erreur.
//
// Copier PUIS effacer (pas « déplacer ») : l'ancien code laissait attacher le même fichier u/ à des donateurs de deux
// organismes ; chacun reçoit sa copie, et l'original n'est effacé que quand plus aucune fiche n'y renvoie.
//
// Les fichiers u/ que plus aucune fiche ne cite (photo envoyée puis don abandonné, ou fiche déjà rangée) sont des
// photos sans consentement : effacées si `purgeOrphans`, et seulement après 24 h (un don peut être en cours).

export interface PhotoMigrationReport {
  apply: boolean
  /** Fiches qui citent encore une ancienne photo. */
  legacyDonors: number
  /** Fiches rangées pendant ce passage (ou qui le seraient, à blanc). */
  moved: number
  /** Fiches dont le fichier u/ n'existe plus : laissées telles quelles, à regarder. */
  missing: number
  /** Fichiers u/ cités par aucune fiche. */
  orphans: number
  /** Dont ceux de plus de 24 h, effaçables. */
  orphansOld: number
  /** Fichiers u/ effacés pendant ce passage. */
  removed: number
  errors: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const PAGE = 1000

interface StorageFile { name: string; created_at?: string | null }

async function listLegacyFiles(): Promise<StorageFile[]> {
  const out: StorageFile[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await getDb().storage.from(PHOTO_BUCKET).list('u', { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw error
    const page = (data ?? []) as StorageFile[]
    out.push(...page.filter(f => f.name.endsWith('.jpg')).map(f => ({ name: `u/${f.name}`, created_at: f.created_at })))
    if (page.length < PAGE) return out
  }
}

export async function migrateLegacyPhotos(opts: { apply: boolean; purgeOrphans: boolean; now?: number }): Promise<PhotoMigrationReport> {
  const db = getDb()
  const storage = db.storage.from(PHOTO_BUCKET)
  const now = opts.now ?? Date.now()
  const report: PhotoMigrationReport = { apply: opts.apply, legacyDonors: 0, moved: 0, missing: 0, orphans: 0, orphansOld: 0, removed: 0, errors: [] }

  const { data: rows, error } = await db.from('donors').select('id,organization_id,photo_url').like('photo_url', '%/photos/u/%')
  if (error) throw error
  const files = await listLegacyFiles()
  const existing = new Set(files.map(f => f.name))

  // Fiches regroupées par fichier u/
  const byPath = new Map<string, { id: string; orgId: string; url: string }[]>()
  for (const r of (rows ?? []) as { id: string; organization_id: string; photo_url: string }[]) {
    const path = pathFromPublicUrl(r.photo_url)
    if (!path || !LEGACY_PATH_RE.test(path)) continue
    report.legacyDonors++
    if (!byPath.has(path)) byPath.set(path, [])
    byPath.get(path)!.push({ id: r.id, orgId: r.organization_id, url: r.photo_url })
  }

  const stillCited = new Set<string>()
  for (const [path, donors] of byPath) {
    const uuid = LEGACY_PATH_RE.exec(path)![1]
    if (!existing.has(path)) {
      report.missing += donors.length
      report.errors.push(`Fichier absent : ${path} (${donors.length} fiche(s))`) // i18n-ok : rapport Studio (FR)
      continue
    }
    let allDone = true
    for (const d of donors) {
      if (!opts.apply) { report.moved++; continue }
      const dest = `${donorPhotoDir(d.orgId)}${uuid}.jpg`
      const copy = await storage.copy(path, dest)
      // Déjà copié par un passage précédent interrompu : la destination existe, on continue
      if (copy.error && !/exist|duplicate/i.test(copy.error.message)) {
        allDone = false
        report.errors.push(`Copie impossible ${path} → ${dest} : ${copy.error.message}`) // i18n-ok : rapport Studio (FR)
        continue
      }
      // Seulement si la fiche cite toujours l'ancienne photo (le donateur a pu la changer entre-temps)
      const upd = await db.from('donors').update({ photo_url: publicPhotoUrl(dest) }).eq('id', d.id).eq('organization_id', d.orgId).eq('photo_url', d.url)
      if (upd.error) {
        allDone = false
        report.errors.push(`Fiche ${d.id} non mise à jour : ${upd.error.message}`) // i18n-ok : rapport Studio (FR)
        continue
      }
      report.moved++
    }
    if (!opts.apply || !allDone) { stillCited.add(path); continue }
    const rm = await storage.remove([path])
    if (rm.error) report.errors.push(`Original non effacé ${path} : ${rm.error.message}`) // i18n-ok : rapport Studio (FR)
    else report.removed++
  }

  // Orphelins : fichiers u/ qu'aucune fiche ne cite
  const orphans = files.filter(f => !byPath.has(f.name) && !stillCited.has(f.name))
  report.orphans = orphans.length
  const old = orphans.filter(f => f.created_at && now - new Date(f.created_at).getTime() > DAY_MS)
  report.orphansOld = old.length
  if (opts.apply && opts.purgeOrphans && old.length) {
    for (let i = 0; i < old.length; i += 100) {
      const batch = old.slice(i, i + 100).map(f => f.name)
      const rm = await storage.remove(batch)
      if (rm.error) report.errors.push(`Orphelins non effacés : ${rm.error.message}`) // i18n-ok : rapport Studio (FR)
      else report.removed += batch.length
    }
  }
  return report
}

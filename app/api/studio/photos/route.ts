import { NextRequest, NextResponse } from 'next/server'
import { currentAccount } from '@/lib/auth'
import { migrateLegacyPhotos } from '@/lib/photo-migration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Entretien (comptes is_studio) : ranger les anciennes photos u/ dans le dossier de leur organisme. Ne renvoie que des
// nombres et des chemins de fichiers : jamais de nom, de courriel ni de contenu de donateur.

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status }) // i18n-ok : section Studio (FR)

async function studio(request: NextRequest) {
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin')
    const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim().toLowerCase()
    if (origin && new URL(origin).host.toLowerCase() !== host) return null
  }
  const me = await currentAccount()
  return me?.isStudio ? me : null
}

/** État, à blanc : rien n'est modifié. */
export async function GET(request: NextRequest) {
  if (!(await studio(request))) return fail('Réservé à Studio Existence.', 403) // i18n-ok : section Studio (FR)
  try {
    return NextResponse.json(await migrateLegacyPhotos({ apply: false, purgeOrphans: false }))
  } catch (e) {
    return fail((e as Error).message, 500)
  }
}

/** Rangement réel ; `purgeOrphans` efface aussi les photos de plus de 24 h qu'aucune fiche ne cite. */
export async function POST(request: NextRequest) {
  if (!(await studio(request))) return fail('Réservé à Studio Existence.', 403) // i18n-ok : section Studio (FR)
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  try {
    return NextResponse.json(await migrateLegacyPhotos({ apply: true, purgeOrphans: b.purgeOrphans === true }))
  } catch (e) {
    return fail((e as Error).message, 500)
  }
}

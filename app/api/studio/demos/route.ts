import { NextRequest, NextResponse } from 'next/server'
import { studioAccount } from '@/lib/studio'
import { removeDemoPhotos } from '@/lib/demo'
import { PROJECT_DEMO_MAX, createProjectDemo, deleteProjectDemo, listProjectDemos, projectDemoId, regenerateProjectDemo, updateProjectDemo, type ProjectDemoError } from '@/lib/demo-projets'
import { orgUrl } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Démonstrations par projet (comptes is_studio) : un vitrail de démonstration au nom d'un organisme précis, pour une
// rencontre de vente ou d'accueil (lib/demo-projets.ts). Donateurs et dons fictifs, lecture seule, aucune migration.
//   GET  : la liste
//   POST { action: 'create', slug, locales, texts } | { action: 'update', id, locales, texts }
//        | { action: 'regenerate', id } | { action: 'removePhotos', id } | { action: 'delete', id }
// Section Studio : en français seulement.

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

const MESSAGES: Record<ProjectDemoError, string> = {
  nom: 'Le nom de l’organisme est requis (2 caractères au moins), dans la langue principale.',
  langues: 'Choisissez une ou deux langues.',
  textes: 'Un des textes est trop long ou invalide.',
  forme: 'Adresse invalide : 3 à 33 caractères, lettres minuscules, chiffres et tirets.',
  reserve: 'Cette adresse est réservée.',
  pris: 'Cette adresse est déjà prise.',
  limite: `Limite atteinte (${PROJECT_DEMO_MAX} démonstrations) : supprimez-en une qui ne sert plus.`,
  introuvable: 'Cette démonstration n’existe pas (ou n’est pas une démonstration par projet).',
  image: 'Image refusée.',
}
const refuse = (e: ProjectDemoError) => fail(MESSAGES[e], e === 'introuvable' ? 404 : e === 'pris' || e === 'limite' ? 409 : 400)

async function list(request: NextRequest) {
  const demos = await listProjectDemos()
  return NextResponse.json(
    {
      max: PROJECT_DEMO_MAX,
      demos: demos.map(d => ({ ...d, links: { vitrail: orgUrl(d.slug, '/vitrail', request), ecran: orgUrl(d.slug, '/ecran', request), screen: orgUrl(d.slug, '/screen', request) } })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function GET(request: NextRequest) {
  if (!(await studioAccount(request))) return fail('Réservé à Studio Existence.', 403)
  try {
    return await list(request)
  } catch (e) {
    console.error('Démonstrations par projet :', e)
    return fail((e as Error).message, 500)
  }
}

export async function POST(request: NextRequest) {
  if (!(await studioAccount(request))) return fail('Réservé à Studio Existence.', 403)
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  try {
    if (b.action === 'create') {
      const r = await createProjectDemo({ slug: b.slug, locales: b.locales, texts: b.texts })
      return r.ok ? list(request) : refuse(r.error)
    }
    if (b.action === 'update') {
      const r = await updateProjectDemo(b.id, { locales: b.locales, texts: b.texts })
      return r.ok ? list(request) : refuse(r.error)
    }
    if (b.action === 'regenerate') {
      const r = await regenerateProjectDemo(b.id)
      return r.ok ? list(request) : refuse(r.error)
    }
    if (b.action === 'removePhotos') {
      const id = await projectDemoId(b.id)
      if (!id) return refuse('introuvable')
      await removeDemoPhotos(id)
      return list(request)
    }
    if (b.action === 'delete') {
      const r = await deleteProjectDemo(b.id)
      return r.ok ? list(request) : refuse(r.error)
    }
    return fail('Action inconnue.')
  } catch (e) {
    console.error('Démonstrations par projet :', e)
    return fail((e as Error).message, 500)
  }
}

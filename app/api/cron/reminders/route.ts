import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { runReminders } from '@/lib/reminders'
import { isAdmin } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Rappel du lendemain (voir lib/reminders.ts). Appelé chaque jour par Vercel Cron, qui envoie « Authorization: Bearer <CRON_SECRET> ».
// Un administrateur connecté peut aussi l'ouvrir dans son navigateur : c'est alors un essai à blanc (rien n'est envoyé),
// sauf avec ?send=1. REMINDERS_ENABLED=0 coupe les rappels.

function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const given = request.headers.get('authorization') ?? ''
  if (!secret) return false
  const a = Buffer.from(given)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: NextRequest) {
  const byCron = cronAuthorized(request)
  const byAdmin = !byCron && (await isAdmin())
  if (!byCron && !byAdmin) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) // i18n-ok : appel de la plateforme, pas du visiteur
  if (process.env.REMINDERS_ENABLED === '0') return NextResponse.json({ enabled: false })

  const params = request.nextUrl.searchParams
  const dry = params.get('dry') === '1' || (byAdmin && params.get('send') !== '1')
  try {
    const result = await runReminders({ dry })
    return NextResponse.json({ enabled: true, dry, ...result })
  } catch (e) {
    console.error('Rappels : passage échoué :', e)
    return NextResponse.json({ error: 'Passage échoué' }, { status: 500 }) // i18n-ok : appel de la plateforme, pas du visiteur
  }
}

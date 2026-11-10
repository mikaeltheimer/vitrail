import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { NextRequest } from 'next/server'
import { brandFor, CONFIG } from '@/lib/config'
import { getIdentity } from '@/lib/identity'
import { clampLocale } from '@/lib/identity-shared'
import { getSnapshot } from '@/lib/donations'
import { formatMoney } from '@/lib/format'
import { translatorFor } from '@/lib/i18n'
import { resolveLocale } from '@/i18n/config'
import { platformUrl, requireTenant } from '@/lib/tenant'
import { demoForVitrine } from '@/lib/demo'
import { shareImage } from '@/lib/shareImage'
import type { SvgPiece } from '@/lib/glassSvg'

// Image d'aperçu des liens partagés (Facebook, messageries), dans la langue du lien (/api/og?lang=fr|en) : les robots
// de partage n'envoient pas de cookie, la langue vient de l'adresse seulement. Dessin : lib/shareImage.tsx.
// - Organisme : son logo ou son nom, l'appel, le total, son vrai vitrail ; Donivers signe en bas.
// - Vitrine (?plateforme) : le logo de Donivers, le titre et le descripteur, le vitrail de la démo.
export const runtime = 'nodejs'

const toSvg = (pieces: { id: string; color: string; amountCents: number }[]): SvgPiece[] => pieces.map(p => ({ id: p.id, color: p.color, amountCents: p.amountCents }))

export async function GET(request: NextRequest) {
  let locale = resolveLocale({ param: request.nextUrl.searchParams.get('lang') })

  if (request.nextUrl.searchParams.has('plateforme')) {
    const t = translatorFor(locale)
    const brand = brandFor(locale)
    const demo = await demoForVitrine(request).catch(() => null)
    return shareImage({
      kind: 'platform',
      titre: t('plateforme.hero.titre'),
      descriptor: brand.descriptor,
      slogan: brand.slogan,
      host: platformUrl(request).replace(/^https?:\/\//, ''),
      pieces: toSvg(demo?.snapshot.pieces ?? []),
    })
  }

  let name: string = CONFIG.brand.name
  let logo: { src: string; w: number; h: number } | null = null
  let total = ''
  let pieces: SvgPiece[] = []
  try {
    const tenant = await requireTenant(request)
    if ('response' in tenant) throw new Error('organisme introuvable')
    const identity = await getIdentity(tenant.tenant.org)
    if (identity) {
      locale = clampLocale(identity.locales, locale)
      name = identity.texts[locale].name
      logo = await logoFor(identity.logoUrl, identity.logoSize)
    }
    const s = await getSnapshot(tenant.tenant)
    pieces = toSvg(s.pieces)
    if (s.pieces.length) total = translatorFor(locale)('meta.ogTotal', { montant: formatMoney(s.totalCents, locale), count: s.pieces.length })
  } catch {}
  const t = translatorFor(locale)
  return shareImage({
    kind: 'org',
    name,
    logo,
    surtitre: t('ecran.ctaSurtitre'),
    titre: t('ecran.ctaTitre'),
    total,
    poweredBy: t('commun.propulsePar'),
    pieces,
  })
}

/** Le logo en données (PNG ou JPEG), réduit pour tenir dans 360 × 110. Null s'il n'y en a pas ou s'il est illisible. */
async function logoFor(url: string | null, size: [number, number] | null): Promise<{ src: string; w: number; h: number } | null> {
  if (!url) return null
  try {
    let bytes: Buffer
    if (url.startsWith('/')) bytes = await readFile(path.join(process.cwd(), 'public', path.normalize(url).replace(/^([/\\])+/, '')))
    else {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (!res.ok) return null
      bytes = Buffer.from(await res.arrayBuffer())
    }
    const png = bytes[0] === 0x89 && bytes[1] === 0x50
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8
    if (!png && !jpeg) return null
    const [w0, h0] = size ?? [360, 110]
    const k = Math.min(360 / w0, 110 / h0)
    return { src: `data:image/${png ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`, w: Math.round(w0 * k), h: Math.round(h0 * k) }
  } catch {
    return null
  }
}

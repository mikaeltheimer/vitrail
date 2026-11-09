import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { brandFor, CONFIG } from '@/lib/config'
import { getIdentity } from '@/lib/identity'
import { clampLocale } from '@/lib/identity-shared'
import { getSnapshot } from '@/lib/donations'
import { formatMoney } from '@/lib/format'
import { translatorFor } from '@/lib/i18n'
import { resolveLocale } from '@/i18n/config'
import { requireTenant } from '@/lib/tenant'

// Image d'aperçu des liens partagés (Facebook, messageries) : le logo, l'appel et le total amassé, dans la langue du lien
// (/api/og?lang=fr|en). Les robots de partage n'envoient pas de cookie : la langue vient de l'adresse seulement.
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  let locale = resolveLocale({ param: request.nextUrl.searchParams.get('lang') })
  // La vitrine de la plateforme : un message pour les organismes (pas l'appel au don d'un organisme)
  const platform = request.nextUrl.searchParams.has('plateforme')
  let name: string = CONFIG.brand.name
  let logo: { src: string; w: number; h: number } | null = null
  let total = ''
  if (!platform) try {
    const tenant = await requireTenant(request)
    if ('response' in tenant) throw new Error('organisme introuvable')
    const identity = await getIdentity(tenant.tenant.org)
    if (identity) {
      locale = clampLocale(identity.locales, locale)
      name = identity.texts[locale].name
      logo = await logoFor(identity.logoUrl, identity.logoSize)
    }
    const s = await getSnapshot(tenant.tenant)
    total = translatorFor(locale)('meta.ogTotal', { montant: formatMoney(s.totalCents, locale), count: s.pieces.length })
  } catch {}
  const t = translatorFor(locale)
  const brand = brandFor(locale)
  const colors = ['#F0B24A', '#E0657F', '#3DB5A6', '#6A78E6', '#A56BD9']
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#0B0A12', color: '#F4EFE6', padding: 64, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo.src} width={logo.w} height={logo.h} alt="" /> : <div style={{ fontSize: 44, fontWeight: 700, maxWidth: 620 }}>{name}</div>}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, color: '#F0B24A', letterSpacing: 4, textTransform: 'uppercase' }}>{platform ? t('plateforme.hero.beta') : t('ecran.ctaSurtitre')}</div>
            <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05, marginTop: 12, maxWidth: 620 }}>{platform ? t('plateforme.hero.titre') : t('ecran.ctaTitre')}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 30, color: 'rgba(244,239,230,0.75)' }}>{platform ? t('plateforme.ogSousTitre') : total || name}</div>
            <div style={{ fontSize: 22, color: 'rgba(244,239,230,0.5)', marginTop: 10 }}>{`${CONFIG.brand.name} · ${brand.slogan}`}</div>
          </div>
        </div>
        <div style={{ width: 440, height: 440, alignSelf: 'center', borderRadius: 999, border: '10px solid #050408', display: 'flex', flexWrap: 'wrap', overflow: 'hidden' }}>
          {Array.from({ length: 30 }, (_, i) => (
            <div key={i} style={{ width: i % 7 === 0 ? 168 : 84, height: 84, background: colors[(i * 7) % colors.length], border: '4px solid #050408' }} />
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600' } },
  )
}

/** Le logo en données (PNG ou JPEG), réduit pour tenir dans 360 × 120. Null s'il n'y en a pas ou s'il est illisible. */
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
    const [w0, h0] = size ?? [360, 120]
    const k = Math.min(360 / w0, 120 / h0)
    return { src: `data:image/${png ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`, w: Math.round(w0 * k), h: Math.round(h0 * k) }
  } catch {
    return null
  }
}

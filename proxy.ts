import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { FIXED_LOCALE_PATHS, LOCALE_COOKIE, LOCALE_HEADER, englishEnabled, isLocale, resolveLocale } from '@/i18n/config'
import { PREVIEW_ORG_COOKIE, SLUG_RE, SURFACE_HEADER, isPlatformHost, isPreviewEnv, legacyRedirect, surfaceOf } from '@/lib/hosts'

// Pages d'un organisme : sur le domaine nu de la plateforme, elles renvoient à la vitrine
const ORG_PAGES = new Set(['/vitrail', '/don', '/ecran', '/screen', '/admin', '/merci', '/affiche'])

// 1. Ancien domaine de la plateforme → redirection permanente vers le domaine actuel (les codes QR imprimés restent bons).
// 2. Domaine nu de la plateforme : « / » est la vitrine (/plateforme). Sur un organisme : « / » est son vitrail.
// 3. Prévisualisation et développement seulement : ?org=<slug> choisit l'organisme (témoin), ?org= vide l'oublie. Sans
//    ?org, « / » y est la vitrine, comme sur le domaine nu. Avec ?embed (écran intégré dans la vitrine), le choix vaut
//    pour la requête seulement : le témoin du visiteur n'est pas touché.
// 4. Langue de chaque requête (pages et API), transmise au rendu par un en-tête interne.
export function proxy(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const path = request.nextUrl.pathname.replace(/\/+$/, '') || '/'

  const legacy = legacyRedirect(host, `${request.nextUrl.pathname}${request.nextUrl.search}`)
  if (legacy) return NextResponse.redirect(legacy, 308)

  const platform = isPlatformHost(host)
  if (platform && ORG_PAGES.has(path)) return NextResponse.redirect(new URL('/', request.url))

  // En prévisualisation, « / » sans ?org est la vitrine (comme le domaine nu en production) ; avec ?org, le vitrail
  const previewHome = path === '/' && !platform && isPreviewEnv() && !request.nextUrl.searchParams.has('org')
  if (path === '/' && !platform && !previewHome) {
    // L'accueil d'un organisme est son vitrail ; les anciens liens (?t= lien magique, ?annule= retour d'annulation) vont sur /don
    const url = request.nextUrl.clone()
    const sp = request.nextUrl.searchParams
    url.pathname = sp.has('t') || sp.has('annule') ? '/don' : '/vitrail'
    return NextResponse.redirect(url)
  }

  // /screen (anglais) n'existe que lorsque l'anglais est activé : sinon, l'écran français
  if (path === '/screen' && !englishEnabled()) {
    const url = request.nextUrl.clone()
    url.pathname = '/ecran'
    return NextResponse.redirect(url)
  }

  const fixed = FIXED_LOCALE_PATHS[path]
  const param = request.nextUrl.searchParams.get('lang')
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value
  const locale = fixed ?? resolveLocale({ param, cookie, acceptLanguage: request.headers.get('accept-language') })

  // L'en-tête est toujours réécrit ici : une valeur envoyée par le client n'arrive jamais jusqu'au rendu.
  const headers = new Headers(request.headers)
  headers.set(LOCALE_HEADER, locale)
  headers.set(SURFACE_HEADER, previewHome ? 'platform' : surfaceOf(host, path))
  const orgParam = isPreviewEnv() ? request.nextUrl.searchParams.get('org') : null
  if (orgParam !== null) {
    // Le rendu de CETTE requête voit déjà le nouveau choix
    const others = (request.headers.get('cookie') ?? '').split(/;\s*/).filter(c => c && !c.startsWith(`${PREVIEW_ORG_COOKIE}=`))
    if (SLUG_RE.test(orgParam)) others.push(`${PREVIEW_ORG_COOKIE}=${orgParam}`)
    headers.set('cookie', others.join('; '))
  }
  const response =
    (platform || previewHome) && path === '/'
      ? NextResponse.rewrite(new URL(`/plateforme${request.nextUrl.search}`, request.url), { request: { headers } })
      : NextResponse.next({ request: { headers } })

  // Les écrans à langue fixe ne touchent pas au cookie du visiteur
  if (!fixed && isLocale(param) && locale === param && cookie !== param) {
    response.cookies.set(LOCALE_COOKIE, param, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  }
  if (orgParam !== null && !request.nextUrl.searchParams.has('embed')) {
    if (SLUG_RE.test(orgParam)) response.cookies.set(PREVIEW_ORG_COOKIE, orgParam, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 })
    else response.cookies.delete(PREVIEW_ORG_COOKIE)
  }
  return response
}

export const config = {
  // Tout sauf les fichiers statiques (avec extension) et les ressources internes de Next
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { FIXED_LOCALE_PATHS, LOCALE_COOKIE, LOCALE_HEADER, englishEnabled, isLocale, resolveLocale } from '@/i18n/config'

// Résout la langue de chaque requête (pages et API) et la transmet au rendu par un en-tête interne.
// Pas de préfixe /en dans l'adresse : ?lang=fr|en pose le cookie, que le sélecteur de langue pose aussi.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/+$/, '') || '/'
  const fixed = FIXED_LOCALE_PATHS[path]

  // /screen (anglais) n'existe que lorsque l'anglais est activé : sinon, l'écran français
  if (path === '/screen' && !englishEnabled()) {
    const url = request.nextUrl.clone()
    url.pathname = '/ecran'
    return NextResponse.redirect(url)
  }

  const param = request.nextUrl.searchParams.get('lang')
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value
  const locale = fixed ?? resolveLocale({ param, cookie, acceptLanguage: request.headers.get('accept-language') })

  // L'en-tête est toujours réécrit ici : une valeur envoyée par le client n'arrive jamais jusqu'au rendu.
  const headers = new Headers(request.headers)
  headers.set(LOCALE_HEADER, locale)
  const response = NextResponse.next({ request: { headers } })

  // Les écrans à langue fixe ne touchent pas au cookie du visiteur
  if (!fixed && isLocale(param) && locale === param && cookie !== param) {
    response.cookies.set(LOCALE_COOKIE, param, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  }
  return response
}

export const config = {
  // Tout sauf les fichiers statiques (avec extension) et les ressources internes de Next
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
}

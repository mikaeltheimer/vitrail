import { currentAccount, type Account } from './auth'

/**
 * Pour les routes de la section Studio : le compte connecté s'il est `is_studio`, sinon null. Une requête qui modifie
 * quelque chose doit venir de la même adresse (en-tête Origin) : pas de formulaire d'un autre site.
 */
export async function studioAccount(request: Request): Promise<Account | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin')
    const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim().toLowerCase()
    if (origin) {
      let originHost = ''
      try {
        originHost = new URL(origin).host.toLowerCase()
      } catch {
        return null
      }
      if (originHost !== host) return null
    }
  }
  const me = await currentAccount()
  return me?.isStudio ? me : null
}

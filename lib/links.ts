import { PREVIEW_ORG_COOKIE } from './hosts'

/**
 * Côté navigateur : adresse publique d'une page de l'organisme affiché (QR codes, liens à partager).
 * L'organisme est dans l'adresse elle-même (son sous-domaine) ; en prévisualisation, il vient du témoin posé par ?org=,
 * qu'on remet dans le lien pour que la personne qui scanne arrive au bon endroit. Jamais d'adresse fixe dans la configuration :
 * chaque organisme a la sienne.
 */
export function publicLink(path: string, base?: string | null): string {
  const origin = (base || window.location.origin).replace(/\/$/, '')
  const m = base ? null : document.cookie.match(new RegExp(`(?:^|;\\s*)${PREVIEW_ORG_COOKIE}=([^;]+)`))
  if (!m) return `${origin}${path}`
  return `${origin}${path}${path.includes('?') ? '&' : '?'}org=${m[1]}`
}

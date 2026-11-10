import { CONFIG } from '@/lib/config'

/**
 * Logo de la plateforme : le disque de verre et le mot « donivers » (fichiers générés par scripts/logo.py).
 * `size` : taille du texte voisin, en px ; le logo prend une hauteur en proportion. Version crème, pour les fonds sombres ;
 * petit symbole (4 pièces) sous 42 px de haut, où les 7 pièces deviennent illisibles.
 */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG statique, déjà à la bonne taille
    <img src={size >= 28 ? '/brand/donivers-logo-creme.svg' : '/brand/donivers-logo-creme-petit.svg'} alt={CONFIG.brand.name} height={Math.round(size * 1.5)} style={{ height: Math.round(size * 1.5), width: 'auto', display: 'block' }} />
  )
}

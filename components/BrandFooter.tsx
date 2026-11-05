// Mention fixe de la plateforme, en pied de page : discrète, le message de l'organisme passe toujours avant.
// Porte aussi le sélecteur de langue (visible seulement quand l'anglais est activé).

import { useBrand } from '@/lib/useOrg'
import LanguageSwitch from './LanguageSwitch'

export default function BrandFooter({ style, className }: { style?: React.CSSProperties; className?: string }) {
  const brand = useBrand()
  return (
    <p className={className} style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)', ...style }}>
      {brand.poweredBy} · <span className="slogan">{brand.slogan}</span>
      <LanguageSwitch prefix=" · " style={{ textDecoration: 'underline' }} />
    </p>
  )
}

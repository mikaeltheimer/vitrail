// Signature de la plateforme, en pied de page : discrète, le message de l'organisme passe toujours avant.
// Porte aussi le sélecteur de langue (visible sauf si l'anglais est coupé (NEXT_PUBLIC_ENGLISH=0)).

import { useBrand } from '@/lib/useOrg'
import LanguageSwitch from './LanguageSwitch'
import Signature from './Signature'

export default function BrandFooter({ style, className }: { style?: React.CSSProperties; className?: string }) {
  const brand = useBrand()
  return (
    <div className={className} style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)', display: 'grid', justifyItems: className?.includes('text-center') ? 'center' : 'start', gap: 6, ...style }}>
      <Signature height={16} />
      <p style={{ margin: 0 }}>
        <span className="slogan">{brand.slogan}</span>
        <LanguageSwitch prefix=" · " style={{ textDecoration: 'underline' }} />
      </p>
    </div>
  )
}

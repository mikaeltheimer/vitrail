// Mention fixe de la plateforme, en pied de page : discrète, le message de l'organisme passe toujours avant.

import { CONFIG } from '@/lib/config'

export default function BrandFooter({ style, className }: { style?: React.CSSProperties; className?: string }) {
  return (
    <p className={className} style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)', ...style }}>
      {CONFIG.brand.poweredBy} · <span className="slogan">{CONFIG.brand.slogan}</span>
    </p>
  )
}

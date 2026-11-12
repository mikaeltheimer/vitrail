import { DEFAULT_GLASSES } from '@/lib/theme'

// Passage de la nuit au papier : la lumière du vitrail traverse et se pose sur la page, comme sur l'affiche.
// Une bande qui passe en douceur de la nuit au papier, puis des rayons aux couleurs des cinq verres qui naissent dans
// la nuit et s'étalent sur le papier, derrière le contenu de la section suivante. Fixes : un éclairage, pas une animation.

const RAYS = [
  { x: 9, top: 2.2, bottom: 15, glass: 'violet', o: 0.3 },
  { x: 22, top: 2.8, bottom: 19, glass: 'ciel', o: 0.34 },
  { x: 35, top: 1.8, bottom: 12, glass: 'ambre', o: 0.4 },
  { x: 49, top: 3, bottom: 21, glass: 'rose', o: 0.32 },
  { x: 62, top: 2, bottom: 14, glass: 'jade', o: 0.3 },
  { x: 75, top: 2.6, bottom: 18, glass: 'ambre', o: 0.36 },
  { x: 89, top: 2.2, bottom: 15, glass: 'ciel', o: 0.3 },
] as const

/** Hauteur de la bande de passage ; les rayons continuent dessous, sur le papier. */
const BAND = 'h-[120px] md:h-[170px]'

export default function LightSpill() {
  const color = (id: string) => DEFAULT_GLASSES.find(g => g.id === id)?.value ?? '#F0B24A'
  return (
    <div aria-hidden="true" className={`pointer-events-none relative z-0 ${BAND}`} style={{ background: 'linear-gradient(to bottom, #0B0A12 0%, #0B0A12 12%, #3a3540 45%, #b9b2aa 75%, #FBF8F1 100%)' }}>
      <svg className="absolute left-0 top-0 h-[520px] w-full md:h-[680px]" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          {RAYS.map((r, i) => (
            <linearGradient key={i} id={`rayon-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color(r.glass)} stopOpacity="0" />
              <stop offset="0.12" stopColor={color(r.glass)} stopOpacity={r.o * 1.6} />
              <stop offset="0.35" stopColor={color(r.glass)} stopOpacity={r.o} />
              <stop offset="1" stopColor={color(r.glass)} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {RAYS.map((r, i) => {
          // Légèrement inclinés, comme une lumière haute venue de la gauche
          const t0 = r.x + 5 - r.top / 2
          const t1 = r.x + 5 + r.top / 2
          const b0 = r.x - 3 - r.bottom / 2
          const b1 = r.x - 3 + r.bottom / 2
          // Sur téléphone, un rayon sur deux : sinon des rayures plutôt que de la lumière
          return <polygon key={i} className={i % 2 ? 'hidden md:inline' : undefined} points={`${t0},0 ${t1},0 ${b1},100 ${b0},100`} fill={`url(#rayon-${i})`} />
        })}
      </svg>
    </div>
  )
}

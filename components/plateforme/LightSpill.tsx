import { DEFAULT_GLASSES } from '@/lib/theme'
import { glassScene, lightRays, type SvgPiece } from '@/lib/glassSvg'

// Passage de la nuit au papier : la lumière d'un vitrail rond tombe sur la page, comme sur l'affiche « La place libre ».
// Même forme et même style que ses rayons (lightRays, lib/glassSvg.ts) : sept rayons partis du bas du disque, qui
// s'élargissent en s'éloignant ; dégradé du bord du vitrail vers rien. Avec `pieces` : le vrai vitrail (celui de la
// démo) est dessiné, posé dans la nuit au-dessus du papier ; sans : seuls les rayons, la source hors champ.

const LENGTH = 3.2
const RAY_GLASSES = ['violet', 'ciel', 'ambre', 'rose', 'jade', 'ambre', 'ciel'] as const

export default function LightSpill({ pieces }: { pieces?: SvgPiece[] | null }) {
  const color = (id: string) => DEFAULT_GLASSES.find(g => g.id === id)?.value ?? '#F0B24A'
  // Une scène de référence pour la géométrie ; le vrai pavage seulement s'il y a des morceaux à montrer
  const scene = pieces?.length ? glassScene(pieces, 600) : null
  const geo = scene ?? glassScene(DEFAULT_GLASSES.map((g, i) => ({ id: `rayon-${i}`, color: g.value, amountCents: 1 })), 600)!
  const R = geo.radius
  const rays = lightRays(geo, LENGTH).map((r, i) => (scene ? r : { ...r, color: color(RAY_GLASSES[i]) }))
  // Cadre : avec le vitrail, depuis le haut du disque ; sans, depuis juste au-dessus du bas du disque
  const X0 = -2.2 * R
  const Y0 = scene ? -geo.view * 1.04 : 0.35 * R
  const W = 4.4 * R
  const H = (LENGTH + 0.75) * R - Y0
  return (
    <div aria-hidden="true" className={`pointer-events-none relative z-0 ${scene ? 'h-[250px] md:h-[380px]' : 'h-[150px] md:h-[200px]'}`} style={{ background: `linear-gradient(to bottom, #0B0A12 0%, #0B0A12 ${scene ? 45 : 30}%, #FBF8F1 100%)` }}>
      {/* Plus large que l'écran sur téléphone : on n'y voit que les rayons du milieu */}
      <div className={`absolute left-1/2 top-0 -translate-x-1/2 ${scene ? 'w-[120%] max-w-[760px] md:w-[54%]' : 'w-[190%] max-w-[1180px] md:w-[86%]'}`}>
        <svg
          viewBox={`${X0} ${Y0} ${W} ${H}`}
          className="block h-auto w-full"
          // Sans le vitrail, le haut des rayons se fond dans la nuit au lieu d'y être coupé net
          style={scene ? undefined : { maskImage: 'linear-gradient(to bottom, transparent 0%, #000 38%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 38%)' }}
        >
          <defs>
            {rays.map((r, i) => (
              <linearGradient key={i} id={`rayon-${i}`} gradientUnits="userSpaceOnUse" x1={r.from[0]} y1={r.from[1]} x2={r.to[0]} y2={r.to[1]}>
                <stop offset="0" stopColor={r.color} stopOpacity="0.26" />
                <stop offset="0.45" stopColor={r.color} stopOpacity="0.1" />
                <stop offset="1" stopColor={r.color} stopOpacity="0" />
              </linearGradient>
            ))}
            {scene?.tiles.map((t, i) =>
              t.shaded ? (
                <radialGradient key={t.id} id={`passage-g${i}`} gradientUnits="userSpaceOnUse" cx={t.glow[0]} cy={t.glow[1]} r={t.glow[2]}>
                  <stop offset="0" stopColor={t.core} stopOpacity="0.9" />
                  <stop offset="0.55" stopColor={t.mid} />
                  <stop offset="1" stopColor={t.mid} stopOpacity="0" />
                </radialGradient>
              ) : null,
            )}
          </defs>
          {rays.map((r, i) => (
            <polygon key={i} points={r.points} fill={`url(#rayon-${i})`} />
          ))}
          {scene && (
            <g>
              <circle r={R} fill="#050408" />
              {scene.tiles.map((t, i) => (
                <g key={t.id}>
                  <polygon points={t.points} fill={t.shaded ? t.base : t.mid} />
                  {t.shaded && <polygon points={t.points} fill={`url(#passage-g${i})`} />}
                  <polygon points={t.points} fill="none" stroke="#050408" strokeWidth={t.lead} strokeLinejoin="round" />
                </g>
              ))}
              <circle r={R + scene.ring / 2} fill="none" stroke="#050408" strokeWidth={scene.ring} />
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}

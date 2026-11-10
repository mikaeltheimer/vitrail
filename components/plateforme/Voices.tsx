import type { Piece } from '@/lib/types'

/**
 * « Les gens derrière les dons » (vitrine) : trois morceaux de la démo, avec leur nom, leur photo et leur mot, comme sur
 * l'écran de projection. La preuve du titre « Votre communauté, enfin visible ». Donateurs fictifs : c'est dit sous les
 * cartes. Rien n'est affiché s'il n'y a pas trois témoignages nommés dans la langue de la page.
 */
export function pickVoices(pieces: Piece[], messages: readonly string[]): Piece[] {
  const inLanguage = new Set(messages)
  const named = pieces.filter(p => p.name && p.message && inLanguage.has(p.message) && p.message.length <= 140)
  // Les plus parlants d'abord : avec photo, puis le mot le plus long ; ordre stable d'une visite à l'autre
  const ranked = [...named].sort((a, b) => Number(!!b.photoUrl) - Number(!!a.photoUrl) || b.message!.length - a.message!.length || a.id.localeCompare(b.id))
  return ranked.length >= 3 ? ranked.slice(0, 3) : []
}

export default function Voices({ voices, quotes }: { voices: Piece[]; quotes: { open: string; close: string } }) {
  return (
    <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
      {voices.map(p => (
        <figure key={p.id} className="m-0 flex flex-col gap-4 rounded-[20px] p-6" style={{ background: 'rgba(11,10,18,0.94)', border: `1px solid ${p.color}55`, borderLeft: `4px solid ${p.color}`, boxShadow: `0 0 3em ${p.color}1f` }}>
          <blockquote className="m-0 text-[19px] leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
            {quotes.open}
            {p.message}
            {quotes.close}
          </blockquote>
          <figcaption className="mt-auto flex items-center gap-3">
            {p.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- photo de la démo, déjà recadrée en carré
              <img src={p.photoUrl} alt="" width={48} height={48} className="rounded-full object-cover" style={{ width: 48, height: 48, boxShadow: `0 0 0 2px ${p.color}` }} />
            ) : (
              <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full font-bold" style={{ background: p.color, color: '#0B0A12' }}>
                {p.name!.slice(0, 1)}
              </span>
            )}
            <span className="font-bold">{p.name}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

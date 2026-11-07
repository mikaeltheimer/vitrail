import { CONFIG } from '@/lib/config'

/** Marque de la plateforme : cinq verres et le nom. */
export function Mark({ size = 22 }: { size?: number }) {
  const colors = ['#F0B24A', '#E0657F', '#3DB5A6', '#6A78E6', '#A56BD9']
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden="true" className="inline-flex gap-[3px]">
        {colors.map(c => (
          <span key={c} style={{ width: size * 0.27, height: size, borderRadius: 2, background: c }} />
        ))}
      </span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: size, fontWeight: 500 }}>{CONFIG.brand.name}</span>
    </span>
  )
}

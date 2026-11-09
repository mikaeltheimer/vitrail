import { getLocale, getTranslations } from 'next-intl/server'
import { CONFIG } from '@/lib/config'
import { formatMoney } from '@/lib/format'
import { DEFAULT_FEE_SCHEDULE } from '@/lib/platform-fee'
import { TERMS_VERSION } from '@/lib/signup'
import type { Locale } from '@/i18n/config'
import fr from '@/messages/fr.json'
import en from '@/messages/en.json'

// Textes juridiques de la plateforme (messages : legalPlateforme.*). Ils sont lus tels quels : sections, puis
// paragraphes ; un paragraphe qui commence par « • » est un élément de liste. Les variables entre accolades sont
// remplacées ici, avec les vraies valeurs (raison sociale, commission, version des conditions).

/** Date d'entrée en vigueur des textes de la plateforme (à changer avec eux, comme TERMS_VERSION). */
export const LEGAL_EFFECTIVE_DATE = '2026-11-08'

interface Doc {
  titre: string
  maj: string
  sections: { titre: string; blocs: string[] }[]
}

export default async function LegalDoc({ doc }: { doc: 'confidentialite' | 'conditions' }) {
  const tp = await getTranslations('plateforme')
  const locale = (await getLocale()) as Locale
  // Lus tels quels dans les messages (pas de format ICU : ce sont des textes longs, avec leurs propres variables)
  const d = (locale === 'en' ? en : fr).legalPlateforme[doc] as Doc
  const s = CONFIG.brand.studioLegal
  const fee = DEFAULT_FEE_SCHEDULE
  const pct = (r: number) => new Intl.NumberFormat(locale === 'en' ? 'en-CA' : 'fr-CA', { style: 'percent', maximumFractionDigits: 1 }).format(r)
  const date = new Intl.DateTimeFormat(locale === 'en' ? 'en-CA' : 'fr-CA', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${LEGAL_EFFECTIVE_DATE}T12:00:00Z`))
  const vars: Record<string, string> = {
    brand: CONFIG.brand.name,
    studio: s.name,
    neq: s.neq,
    address: s.address,
    email: s.email,
    taux: pct(fee.rate),
    palier: pct(fee.tierRate),
    seuil: formatMoney(fee.tierAfterCents, locale),
    version: TERMS_VERSION,
    date,
  }
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)

  return (
    <main className="mx-auto max-w-[760px] px-6 pb-20 pt-6 leading-relaxed">
      <h1 className="m-0 text-[36px] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
        {fill(d.titre)}
      </h1>
      <p className="muted mt-2 text-sm">{fill(d.maj)}</p>
      <p className="card mt-5 text-sm" style={{ borderColor: 'rgba(240,178,74,0.45)' }}>
        {tp('provisoire')}
      </p>
      {d.sections.map(sec => (
        <section key={sec.titre} className="mt-8">
          <h2 className="m-0 mb-3 text-[20px] font-semibold">{fill(sec.titre)}</h2>
          {group(sec.blocs).map((g, i) =>
            Array.isArray(g) ? (
              <ul key={i} className="my-3 space-y-2 pl-5" style={{ listStyle: 'disc' }}>
                {g.map(item => (
                  <li key={item}>{fill(item.slice(2))}</li>
                ))}
              </ul>
            ) : (
              <p key={i} className="my-3">
                {fill(g)}
              </p>
            ),
          )}
        </section>
      ))}
    </main>
  )
}

/** Regroupe les paragraphes « • … » qui se suivent en une liste. */
function group(blocs: string[]): (string | string[])[] {
  const out: (string | string[])[] = []
  for (const b of blocs) {
    if (b.startsWith('• ')) {
      const last = out[out.length - 1]
      if (Array.isArray(last)) last.push(b)
      else out.push([b])
    } else out.push(b)
  }
  return out
}

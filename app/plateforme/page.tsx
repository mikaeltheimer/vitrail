import type { Metadata } from 'next'
import { DEFAULT_GLASSES } from '@/lib/theme'
import { getLocale, getTranslations } from 'next-intl/server'
import PlatformShell from '@/components/plateforme/PlatformShell'
import { headers } from 'next/headers'
import HeroGlass, { type HeroDemo } from '@/components/plateforme/HeroGlass'
import { demoForVitrine } from '@/lib/demo'
import { DEMO_TEXTS, TESTIMONIALS_EN, TESTIMONIALS_FR } from '@/lib/demo-data'
import Voices, { pickVoices } from '@/components/plateforme/Voices'
import { QUOTES } from '@/i18n/config'
import RequestForm from '@/components/plateforme/RequestForm'
import { CONFIG } from '@/lib/config'
import { formatMoney } from '@/lib/format'
import { DEFAULT_FEE_SCHEDULE } from '@/lib/platform-fee'
import type { Locale } from '@/i18n/config'

// Vitrine de la plateforme : sur le domaine nu (proxy.ts réécrit « / » vers ici), et à /plateforme partout ailleurs.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('plateforme')
  const locale = (await getLocale()) as Locale
  const title = t('metaTitre', { brand: CONFIG.brand.name })
  const description = t('metaDescription')
  return {
    title,
    description,
    robots: { index: true },
    // Aperçu des liens : celui de la plateforme, pas l'appel au don d'un organisme
    openGraph: { title, description, type: 'website', images: [{ url: `/api/og?plateforme&lang=${locale}`, width: 1200, height: 630, alt: title }] },
  }
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="m-0 text-[clamp(30px,4vw,40px)] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
      {children}
    </h2>
  )
}

const pct = (r: number, locale: Locale) => new Intl.NumberFormat(locale === 'en' ? 'en-CA' : 'fr-CA', { style: 'percent', maximumFractionDigits: 1 }).format(r)

export default async function PlateformePage() {
  const t = await getTranslations('plateforme')
  const locale = (await getLocale()) as Locale
  const brand = CONFIG.brand.name
  const fee = DEFAULT_FEE_SCHEDULE
  const money = (c: number) => formatMoney(c, locale)
  // 5 000 $ de commissions ≈ dons reçus, arrondis à 500 $ près vers le bas
  const donsSeuil = Math.floor(fee.tierAfterCents / fee.rate / 50_000) * 50_000
  const exemple = 10_000
  const exCommission = Math.round(exemple * fee.rate)
  const exStripe = Math.round(exemple * CONFIG.feePercent) + CONFIG.feeFixedCents
  const dot = (c: string) => <span aria-hidden="true" className="mt-[10px] h-2 w-2 flex-none rounded-full" style={{ background: c }} />
  const band = 'border-y'
  const bandStyle = { background: '#110F19', borderColor: 'rgba(244,239,230,0.08)' }

  // La démo (Fondation Pleine Lumière), si elle existe sur cette base : vitrail de l'accueil et section « Essayez-le »
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost'
  const demo = await demoForVitrine(new Request(`https://${host}/plateforme`, { headers: h }))
  const demoName = DEMO_TEXTS[locale]?.name ?? DEMO_TEXTS.fr!.name!
  const heroDemo: HeroDemo | null = demo
    ? {
        pieces: demo.snapshot.pieces,
        // Les derniers dons, du plus ancien au plus récent, un seul par donateur
        replay: [...new Set([...demo.snapshot.recent].reverse().map(d => d.donorId))].slice(-10),
        url: demo.links.vitrail,
        screenUrl: locale === 'en' ? demo.links.screen : demo.links.ecran,
        name: demoName,
      }
    : null
  // « Les gens derrière les dons » : trois témoignages nommés de la démo, dans la langue de la page
  const voices = demo ? pickVoices(demo.snapshot.pieces, locale === 'en' ? TESTIMONIALS_EN : TESTIMONIALS_FR) : []

  return (
    <PlatformShell>
      <main>
        <section className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-16 px-6 pb-24 pt-12">
          <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-6">
            <span className="self-start rounded-full border px-3 py-1 text-[13px] font-bold uppercase tracking-wider" style={{ color: '#3DB5A6', borderColor: 'rgba(61,181,166,0.5)' }}>
              {t('hero.beta')}
            </span>
            <h1 className="m-0 text-[clamp(40px,5vw,64px)] leading-[1.05]" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
              {t('hero.titre')}
            </h1>
            <p className="m-0 max-w-[34em] text-[20px]" style={{ color: '#D9D3E3' }}>
              {t('hero.texte', { brand })}
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#invitation" className="btn !w-auto !rounded-full !px-6 no-underline">
                {t('hero.demander')}
              </a>
              <a href={demo ? '#essai' : '#comment'} className="btn btn-ghost !w-auto !rounded-full !px-6 no-underline">
                {demo ? t('hero.essayer') : t('hero.voir')}
              </a>
            </div>
            <p className="muted m-0 text-sm">{t('hero.pour')}</p>
          </div>
          <div className="flex min-w-0 flex-[1_1_380px] justify-center">
            <HeroGlass demo={heroDemo} />
          </div>
        </section>

        {voices.length > 0 && (
          <section id="voix" className="mx-auto flex max-w-[1160px] flex-col gap-8 px-6 pb-20">
            <div className="flex max-w-[720px] flex-col gap-3">
              <H2>{t('voix.titre')}</H2>
              <p className="m-0 text-[19px]" style={{ color: '#D9D3E3' }}>
                {t('voix.intro')}
              </p>
            </div>
            <Voices voices={voices} quotes={{ open: QUOTES[locale][0], close: QUOTES[locale][1] }} />
            <p className="muted m-0 text-sm">{t('voix.note', { org: demoName })}</p>
          </section>
        )}

        {demo && (
          <section id="essai" className="mx-auto flex max-w-[1160px] flex-col gap-8 px-6 pb-20">
            <div className="flex max-w-[720px] flex-col gap-3">
              <H2>{t('essai.titre')}</H2>
              <p className="m-0 text-[19px]" style={{ color: '#D9D3E3' }}>
                {t('essai.intro', { org: demoName })}
              </p>
            </div>
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
              <article className="card flex flex-col gap-3 !rounded-[20px] !p-7" style={{ borderColor: 'rgba(240,178,74,0.45)' }}>
                <h3 className="m-0 text-[22px]">{t('essai.vitrailTitre')}</h3>
                <p className="muted m-0 flex-1">{t('essai.vitrailTexte')}</p>
                <a href={demo.links.vitrail} target="_blank" rel="noreferrer" className="btn !w-auto self-start !rounded-full !px-6 no-underline">
                  {t('essai.vitrailBouton')}
                </a>
              </article>
              <article className="card flex flex-col gap-3 !rounded-[20px] !p-7">
                <h3 className="m-0 text-[22px]">{t('essai.ecranTitre')}</h3>
                <p className="muted m-0 flex-1">{t('essai.ecranTexte')}</p>
                <div className="flex flex-wrap gap-2">
                  <a href={demo.links.ecran} target="_blank" rel="noreferrer" lang="fr" className="btn btn-ghost !w-auto !rounded-full !px-6 no-underline">
                    {t('essai.ecranFr')}
                  </a>
                  <a href={demo.links.screen} target="_blank" rel="noreferrer" lang="en" className="btn btn-ghost !w-auto !rounded-full !px-6 no-underline">
                    {t('essai.ecranEn')}
                  </a>
                </div>
              </article>
            </div>
          </section>
        )}

        <section id="comment" className={band} style={bandStyle}>
          <div className="mx-auto flex max-w-[1160px] flex-col gap-10 px-6 py-20">
            <H2>{t('comment.titre')}</H2>
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
              {(
                [
                  [1, DEFAULT_GLASSES[0].value, 'e1'],
                  [2, DEFAULT_GLASSES[4].value, 'e2'],
                  [3, DEFAULT_GLASSES[1].value, 'e3'],
                ] as const
              ).map(([n, c, k]) => (
                <article key={k} className="card flex flex-col gap-3 !rounded-[20px] !p-7">
                  <span className="text-[36px] leading-none" style={{ fontFamily: 'var(--font-display)', color: c }}>
                    {n}
                  </span>
                  <h3 className="m-0 text-[20px]">{t(`comment.${k}Titre`)}</h3>
                  <p className="muted m-0">{t(`comment.${k}`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1160px] gap-12 px-6 py-20 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
          <div className="flex flex-col gap-4">
            <h2 className="m-0 text-[32px]" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
              {t('donateurs.titre')}
            </h2>
            <p className="muted m-0">{t('donateurs.intro')}</p>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {(['l1', 'l2', 'l3', 'l4', 'l5'] as const).map(k => (
                <li key={k} className="flex gap-3">
                  {dot('#F0B24A')}
                  {t(`donateurs.${k}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="m-0 text-[32px]" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
              {t('equipe.titre')}
            </h2>
            <p className="muted m-0">{t('equipe.intro')}</p>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {(['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'] as const).map(k => (
                <li key={k} className="flex gap-3">
                  {dot('#3DB5A6')}
                  {t(`equipe.${k}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="tarifs" className={band} style={bandStyle}>
          <div className="mx-auto flex max-w-[1160px] flex-col gap-8 px-6 py-20">
            <div className="flex max-w-[720px] flex-col gap-3">
              <H2>{t('tarifs.titre')}</H2>
              <p className="m-0 text-[20px]" style={{ color: '#D9D3E3' }}>
                {t('tarifs.intro')}
              </p>
            </div>
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
              <div className="card flex flex-col gap-2.5 !rounded-[20px] !p-7" style={{ borderColor: 'rgba(240,178,74,0.45)' }}>
                <span className="muted text-sm">{t('tarifs.commission', { brand })}</span>
                <span className="text-[56px] leading-none" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                  {pct(fee.rate, locale)}
                </span>
                <span>{t('tarifs.deChaque')}</span>
                <span className="mt-2 border-t pt-3.5" style={{ borderColor: 'var(--line)' }}>
                  {t.rich('tarifs.palier', {
                    taux: pct(fee.tierRate, locale),
                    seuil: money(fee.tierAfterCents),
                    dons: money(donsSeuil),
                    b: chunks => <b style={{ color: '#F0B24A' }}>{chunks}</b>,
                  })}
                </span>
              </div>
              <div className="card flex flex-col gap-2.5 !rounded-[20px] !p-7">
                <span className="muted text-sm">{t('tarifs.stripeTitre')}</span>
                <span className="text-[40px] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                  Stripe
                </span>
                <span>{t('tarifs.stripe', { pct: pct(CONFIG.feePercent, locale), fixe: money(CONFIG.feeFixedCents) })}</span>
                <span className="muted">{t('tarifs.couvrir')}</span>
              </div>
              <div className="card flex flex-col gap-2.5 !rounded-[20px] !p-7">
                <span className="muted text-sm">{t('tarifs.exemple', { montant: money(exemple) })}</span>
                <dl className="m-0 mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5">
                  <dt>{t('tarifs.exCommission', { brand })}</dt>
                  <dd className="m-0 text-right">{money(exCommission)}</dd>
                  <dt>{t('tarifs.exStripe')}</dt>
                  <dd className="m-0 text-right">{money(exStripe)}</dd>
                  <dt className="border-t pt-2.5 font-bold" style={{ borderColor: 'var(--line)' }}>
                    {t('tarifs.exRecu')}
                  </dt>
                  <dd className="m-0 border-t pt-2.5 text-right font-bold" style={{ borderColor: 'var(--line)' }}>
                    {money(exemple - exCommission - exStripe)}
                  </dd>
                </dl>
              </div>
            </div>
            <ul className="m-0 grid list-none gap-x-8 gap-y-3 p-0 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]" style={{ color: '#D9D3E3' }}>
              <li>{t('tarifs.direct', { brand })}</li>
              <li>{t('tarifs.rembourse')}</li>
            </ul>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1160px] gap-8 px-6 py-20 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {(['quebec', 'loi', 'stripe', 'langues'] as const).map(k => (
            <div key={k} className="flex flex-col gap-2">
              <h3 className="m-0 text-[18px]">{t(`garanties.${k}Titre`)}</h3>
              <p className="muted m-0">{t(`garanties.${k}`, { brand })}</p>
            </div>
          ))}
        </section>

        <section id="questions" className={band} style={bandStyle}>
          <div className="mx-auto flex max-w-[820px] flex-col gap-4 px-6 py-20">
            <div className="mb-4">
              <H2>{t('faq.titre')}</H2>
            </div>
            {([1, 2, 3, 4, 5, 6] as const).map(n => (
              <details key={n} className="card !rounded-2xl !px-[22px] !py-[18px]" open={n === 1}>
                <summary className="cursor-pointer font-bold">{t(`faq.q${n}`)}</summary>
                <p className="muted mb-0 mt-3">{t(`faq.r${n}`, { brand })}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="invitation" className="mx-auto flex max-w-[1160px] flex-wrap gap-12 px-6 py-20">
          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
            <H2>{t('demande.titre')}</H2>
            <p className="m-0 text-[19px]" style={{ color: '#D9D3E3' }}>
              {t('demande.intro')}
            </p>
            <p className="muted m-0">{t('demande.deja')}</p>
          </div>
          <div className="relative min-w-0 flex-[1_1_460px]">
            <RequestForm />
          </div>
        </section>
      </main>
    </PlatformShell>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { CONFIG } from '@/lib/config'
import BrandFooter from '@/components/BrandFooter'

// Politique de confidentialité (Loi 25, Québec). Les passages entre crochets [À COMPLÉTER] sont à remplir par l'école
// avant la mise en ligne publique. Ce texte est un point de départ, pas un avis juridique.

export const metadata: Metadata = {
  title: `Politique de confidentialité — ${CONFIG.brand.name}`,
}

const TODO = ({ children }: { children: React.ReactNode }) => (
  <mark style={{ background: 'rgba(240,178,74,0.25)', color: 'inherit', padding: '0 0.2em', borderRadius: '0.2em' }}>[À COMPLÉTER : {children}]</mark>
)

export default function ConfidentialitePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-8 text-[0.95rem] leading-relaxed">
      <Link href="/vitrail" className="muted text-sm underline">
        ← Retour au vitrail
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Politique de confidentialité</h1>
      <p className="muted mt-1 text-sm">
        Le {CONFIG.brand.name} de l&apos;{CONFIG.orgName} · Dernière mise à jour : <TODO>date</TODO>
      </p>

      <Section title="Qui sommes-nous">
        <p>
          Le {CONFIG.brand.name} de l&apos;{CONFIG.orgName} est la collecte de dons de l&apos;{CONFIG.orgName} (<TODO>raison sociale exacte, numéro d&apos;entreprise du Québec (NEQ)</TODO>),
          située au <TODO>adresse postale</TODO>. Chaque don devient un morceau de verre affiché sur un vitrail numérique, sur place et en ligne.
        </p>
      </Section>

      <Section title="Responsable de la protection des renseignements personnels">
        <p>
          <TODO>Nom et titre de la personne responsable</TODO>
          <br />
          Courriel : <TODO>adresse courriel</TODO> · Téléphone : <TODO>numéro</TODO>
        </p>
        <p className="mt-2">C&apos;est à cette personne que vous pouvez adresser toute question, demande ou plainte au sujet de vos renseignements.</p>
      </Section>

      <Section title="Les renseignements que nous recueillons">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Votre courriel</b> : pour confirmer votre don, vous reconnaître si vous donnez de nouveau (votre morceau grandit), et vous envoyer un lien pour
            modifier votre morceau. Il n&apos;est jamais affiché.
          </li>
          <li>
            <b>Le montant et la date de votre don</b> : pour tenir les comptes de la collecte et dimensionner votre morceau de verre.
          </li>
          <li>
            <b>Seulement si vous les fournissez</b> : le nom que vous choisissez, votre témoignage et votre photo, affichés sur l&apos;écran de
            l&apos;école et sur la page publique du vitrail. Le nom est facultatif : sans lui, votre morceau apparaît comme « Anonyme », avec votre
            témoignage et votre photo si vous en avez ajouté.
          </li>
          <li>
            <b>Votre consentement à être cité</b>, si vous cochez la case prévue : l&apos;{CONFIG.orgName} peut alors reprendre votre témoignage
            dans ses communications (site, réseaux sociaux, rapport annuel). Sans cette case, il reste uniquement sur le vitrail. Vous pouvez retirer
            ce consentement en tout temps avec votre lien de modification.
          </li>
          <li>
            <b>Vos informations de paiement</b> sont saisies directement chez notre fournisseur de paiement, Stripe. Nous ne voyons jamais votre numéro de
            carte.
          </li>
          <li>
            <b>La provenance de votre visite</b> (par exemple : l&apos;affiche du café), sans aucune donnée qui vous identifie, pour savoir quels emplacements
            font connaître la collecte.
          </li>
        </ul>
      </Section>

      <Section title="Témoins et traceurs">
        <p>
          Ce site n&apos;utilise aucun témoin publicitaire ni outil de suivi tiers. Votre navigateur garde seulement, le temps de votre visite, la provenance
          de celle-ci. Les membres de l&apos;équipe qui gèrent la collecte utilisent un témoin de connexion à la console d&apos;administration.
        </p>
      </Section>

      <Section title="Qui a accès à vos renseignements">
        <p>
          Seules les personnes de l&apos;{CONFIG.orgName} chargées de la collecte y ont accès. Nous ne vendons ni ne louons aucun renseignement. Nous faisons
          appel à des fournisseurs qui les traitent pour notre compte :
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            {CONFIG.brand.studio}, qui conçoit et exploite la plateforme {CONFIG.brand.name} ;
          </li>
          <li>Stripe (paiements) ;</li>
          <li>Supabase (hébergement de la base de données et des photos) ;</li>
          <li>
            <TODO>hébergeur du site, p. ex. Vercel</TODO> ;
          </li>
          <li>
            <TODO>service de courriel, le cas échéant</TODO>.
          </li>
        </ul>
        <p className="mt-2">
          Certains de ces fournisseurs peuvent conserver des renseignements à l&apos;extérieur du Québec. <TODO>régions d&apos;hébergement retenues et
          confirmation de l&apos;évaluation des facteurs relatifs à la vie privée exigée par la Loi 25 pour une communication hors Québec</TODO>
        </p>
      </Section>

      <Section title="Combien de temps nous les gardons">
        <p>
          <TODO>durée de conservation, p. ex. : les renseignements liés aux dons sont conservés X ans pour la comptabilité de l&apos;école ; les noms,
          messages et photos sont retirés de l&apos;affichage à la fin de la collecte ou à votre demande</TODO>
        </p>
      </Section>

      <Section title="Vos droits">
        <p>Vous pouvez en tout temps :</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>modifier ou retirer votre nom, votre témoignage ou votre photo, avec le lien reçu après votre don (ou en demandant un nouveau lien sur la page de don) ;</li>
          <li>demander l&apos;accès aux renseignements que nous détenons sur vous, leur rectification ou leur suppression ;</li>
          <li>retirer votre consentement à l&apos;affichage de votre nom et de votre photo.</li>
        </ul>
        <p className="mt-2">
          Écrivez à la personne responsable (ci-dessus). Nous répondons dans un délai de 30 jours. Si vous n&apos;êtes pas satisfait de notre réponse, vous pouvez
          vous adresser à la Commission d&apos;accès à l&apos;information du Québec.
        </p>
      </Section>

      <Section title="Sécurité">
        <p>
          Les échanges avec le site sont chiffrés. L&apos;accès aux renseignements est limité à l&apos;équipe de la collecte et protégé par un code. Les photos
          proposées peuvent être vérifiées par l&apos;équipe avant leur affichage.
        </p>
      </Section>

      <Section title="Reçus fiscaux">
        <p>
          L&apos;{CONFIG.orgName} n&apos;est pas encore un organisme de bienfaisance enregistré : aucun reçu fiscal n&apos;est émis pour le moment.{' '}
          <TODO>à mettre à jour si la situation change</TODO>
        </p>
      </Section>

      <Section title="Modifications">
        <p>Nous publierons ici toute modification de cette politique, avec sa date de mise à jour.</p>
      </Section>
      <BrandFooter className="mt-10 text-center" />
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

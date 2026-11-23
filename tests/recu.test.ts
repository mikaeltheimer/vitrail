import { check, done } from './helpers'
import { buildReceipt } from '../lib/email'
import { renderEmail } from '../lib/emailTemplate'
import { identityFromRow } from '../lib/identity'

// Reçu de don : récapitulatif, mention fiscale selon le numéro, témoignage déjà écrit, invitation Donivers au pied.
const id = identityFromRow({ id: 'o', name_fr: 'Club Test', website_url: '', texts: {}, legal: {}, theme: null, logo_path: null, icon_path: null, locales: ['fr', 'en'], sender_name: null, reply_to: null, showcase: false, draft: null, published_at: null } as never)
const base = { amountCents: 2500, token: 'T', baseUrl: 'https://club.donivers.com', org: id.texts.fr, locale: 'fr' as const }
const header = { name: 'Club Test', logoUrl: null, logoSize: null }

{
  const b = buildReceipt({ ...base, contributionCents: 375 })
  const rows = b.content.summary!.rows
  check('récapitulatif : don, contribution, total', rows.length === 3 && rows[2].total === true && rows[2].value.startsWith('28,75'))
  check('sans numéro : aucun reçu fiscal', /n’est pas un organisme de bienfaisance enregistré|n'est pas un organisme de bienfaisance enregistré/.test(b.content.summary!.note!))
  check('sans numéro : jamais « pas encore »', !JSON.stringify(b.content).includes('pas encore'))
  check('sans témoignage : la question de l’organisme et « Ajouter mon témoignage »', b.content.prompt!.title === id.texts.fr.testimonial.question && b.content.button!.label === 'Ajouter mon témoignage')
  check('numéros de taxes de Studio Existence au pied', b.content.footer[0].includes('TPS'))
  const { html, text } = renderEmail(b.content, 'fr', header)
  check('logo Donivers au pied avec l’invitation', html.includes('donivers-courriel.png') && html.includes('Créez votre vitrail'))
  check('texte : total et invitation', text.includes('Total payé') && text.includes('Créez votre vitrail'))
}
{
  const b = buildReceipt({ ...base })
  check('sans contribution : une seule ligne, pas de taxes', b.content.summary!.rows.length === 1 && !b.content.footer[0].includes('TPS'))
}
{
  const b = buildReceipt({ ...base, charityNumber: '123456789 RR 0001' })
  check('avec numéro : reçu émis par l’organisme', b.content.summary!.note!.includes('123456789 RR 0001') && b.content.summary!.note!.includes('Club Test'))
}
{
  const b = buildReceipt({ ...base, hasTestimonial: true })
  check('témoignage déjà écrit : remercie, ne redemande pas', b.content.prompt!.title.startsWith('Merci aussi') && b.content.button!.label === 'Voir ou modifier mon fragment')
}
{
  const b = buildReceipt({ ...base, locale: 'en', org: id.texts.en, contributionCents: 100, hasTestimonial: true })
  check('anglais', b.content.summary!.rows[2].label === 'Total paid' && b.content.button!.label === 'View or edit my fragment')
}
{
  const b = buildReceipt({ ...base, name: 'Marie', color: '#5CC0F5' })
  check('nom dans le titre', b.content.heading === 'Merci, Marie\u00a0!')
  const { html, text } = renderEmail(b.content, 'fr', header)
  check('pastille de la couleur du fragment', html.includes('bgcolor="#5CC0F5"') && text.includes('votre fragment'))
  check('anonyme : « Merci ! » seul', buildReceipt({ ...base, name: 'Anonyme' }).content.heading === 'Merci\u00a0!' && buildReceipt({ ...base, name: '  ' }).content.heading === 'Merci\u00a0!')
  const bad = renderEmail(buildReceipt({ ...base, color: 'red;background:url(x)' }).content, 'fr', header).html
  check('couleur non hexadécimale : pas de pastille', !bad.includes('url(x)'))
  check('anglais : nom dans le titre', buildReceipt({ ...base, locale: 'en', org: id.texts.en, name: 'Sam' }).content.heading === 'Thank you, Sam!')
}
{
  // Les autres courriels d'organisme n'ont ni invitation ni logo Donivers
  const { html } = renderEmail({ heading: 'H', paragraphs: ['p'], footer: ['f'] }, 'fr', header)
  check('pas de logo Donivers sans invitation', !html.includes('donivers-courriel.png'))
}
done()

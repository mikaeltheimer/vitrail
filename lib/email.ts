import { CONFIG } from './config'
import { siteUrl } from './env'
import { formatMoney } from './format'

// Courriels transactionnels via l'API REST de Resend (aucune dépendance).
// Sans RESEND_API_KEY (développement), le courriel est simplement écrit dans la console du serveur.

async function send(to: string, subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.log(`\n[courriel non envoyé — pas de RESEND_API_KEY]\nÀ : ${to}\nObjet : ${subject}\n${text}\n`)
    return
  }
  const from = process.env.EMAIL_FROM || `${CONFIG.orgName} <onboarding@resend.dev>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  })
  if (!res.ok) console.error('Envoi du courriel échoué :', res.status, await res.text())
}

export function manageLink(token: string): string {
  return `${siteUrl()}/m/${token}`
}

export async function sendReceipt(to: string, amountCents: number, token: string): Promise<void> {
  await send(
    to,
    `Merci pour votre don — ${CONFIG.orgName}`,
    [
      `Merci! Votre don de ${formatMoney(amountCents)} est enregistré et votre morceau s'ajoute au vitrail de l'${CONFIG.orgName}.`,
      '',
      `${CONFIG.testimonial.question} ${CONFIG.testimonial.cta} ${CONFIG.testimonial.lead}`,
      'Ajoutez votre témoignage, ou modifiez votre morceau (nom, photo) :',
      manageLink(token),
      '',
      "Ce courriel confirme votre don. L'école n'est pas encore un organisme de bienfaisance enregistré : aucun reçu fiscal n'est émis pour le moment.",
    ].join('\n'),
  )
}

export async function sendMagicLink(to: string, token: string): Promise<void> {
  await send(
    to,
    `Votre lien — vitrail de l'${CONFIG.orgName}`,
    ['Voici votre lien pour modifier votre morceau ou l\'agrandir (valide 30 jours) :', manageLink(token)].join('\n'),
  )
}

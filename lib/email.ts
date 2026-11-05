import { orgFor } from './config'
import { siteUrl } from './env'
import { formatMoney } from './format'
import { translatorFor } from './i18n'
import type { Locale } from '@/i18n/config'

// Courriels transactionnels via l'API REST de Resend (aucune dépendance).
// Sans RESEND_API_KEY (développement), le courriel est simplement écrit dans la console du serveur.

async function send(to: string, subject: string, text: string, locale: Locale): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.log(`\n[courriel non envoyé — pas de RESEND_API_KEY]\nÀ : ${to}\nObjet : ${subject}\n${text}\n`)
    return
  }
  const from = process.env.EMAIL_FROM || `${orgFor(locale).name} <onboarding@resend.dev>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  })
  if (!res.ok) console.error('Envoi du courriel échoué :', res.status, await res.text())
}

/** Lien vers la page du donateur ; ?lang= pour qu'elle s'ouvre dans la langue du courriel. */
export function manageLink(token: string, locale: Locale): string {
  return `${siteUrl()}/m/${token}?lang=${locale}`
}

// Les courriels partent dans la langue du donateur (celle de son don, ou celle de sa demande de lien).
export async function sendReceipt(to: string, amountCents: number, token: string, locale: Locale): Promise<void> {
  const t = translatorFor(locale)
  const org = orgFor(locale)
  await send(
    to,
    t('courriel.recuObjet', { org: org.name }),
    [
      t('courriel.recuConfirmation', { montant: formatMoney(amountCents, locale) }),
      '',
      `${org.testimonial.question} ${org.testimonial.cta} ${org.testimonial.lead}`,
      t('courriel.recuInvite'),
      manageLink(token, locale),
      '',
      t('courriel.recuPied'),
    ].join('\n'),
    locale,
  )
}

export async function sendMagicLink(to: string, token: string, locale: Locale): Promise<void> {
  const t = translatorFor(locale)
  await send(to, t('courriel.lienObjet', { org: orgFor(locale).name }), [t('courriel.lienCorps'), manageLink(token, locale)].join('\n'), locale)
}

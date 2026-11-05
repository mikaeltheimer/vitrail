import { CONFIG, brandFor, orgFor } from './config'
import { getDb } from './db'
import { siteUrl } from './env'
import { renderEmail, type EmailContent } from './emailTemplate'
import { formatMoney } from './format'
import { translatorFor } from './i18n'
import { hasEmailLog } from './schema'
import type { Locale } from '@/i18n/config'

// Courriels transactionnels via l'API REST de Resend (aucune dépendance), en HTML et en texte, dans la langue du donateur.
// Règle d'or : un courriel est un confort, jamais une condition. Aucune fonction d'ici ne lève d'erreur : un échec
// (Resend en panne, journal absent) est écrit dans la console et le journal, et le don ou la demande suit son cours.
// Sans RESEND_API_KEY (développement), le courriel est simplement écrit dans la console du serveur.

export type EmailKind = 'receipt' | 'magic_link' | 'reminder' | 'moderation'

export type EmailStatus = 'queued' | 'sent' | 'delivered' | 'delayed' | 'bounced' | 'complained' | 'failed' | 'skipped'

/** Un statut « plus avancé » n'est jamais remplacé par un plus ancien (les événements du fournisseur arrivent parfois dans le désordre). */
export const STATUS_RANK: Record<EmailStatus, number> = { queued: 0, skipped: 0, failed: 1, sent: 2, delayed: 3, delivered: 4, bounced: 5, complained: 6 }

const SEND_TIMEOUT_MS = 8000

/**
 * Expéditeur : le nom de l'organisme, sur l'adresse d'envoi de la plateforme (domaine vérifié chez Resend).
 * EMAIL_FROM (« Nom <adresse> ») prend le dessus ; sinon EMAIL_FROM_ADDRESS ; sinon l'adresse d'essai de Resend.
 */
export function fromFor(locale: Locale): string {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM
  const address = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev'
  return `"${orgFor(locale).name.replace(/"/g, '')}" <${address}>`
}

/** Adresse à laquelle répondent les donateurs : celle de l'organisme, à défaut celle de la plateforme. */
export function replyToFor(): string {
  return CONFIG.legal.officerEmail || CONFIG.brand.studioLegal.email
}

interface Outgoing {
  kind: EmailKind
  to: string
  locale: Locale
  donorId?: string | null
  subject: string
  content: EmailContent
}

/** Écrit une ligne du journal ; renvoie son identifiant, ou null (journal absent ou en erreur). Ne lève jamais d'erreur. */
async function logCreate(o: Outgoing): Promise<string | null> {
  try {
    if (!(await hasEmailLog())) return null
    const { data, error } = await getDb()
      .from('email_log')
      .insert({ donor_id: o.donorId ?? null, to_email: o.to, kind: o.kind, locale: o.locale, subject: o.subject })
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  } catch (e) {
    console.error('Journal des courriels : écriture impossible :', e)
    return null
  }
}

async function logUpdate(id: string | null, patch: { status: EmailStatus; provider_id?: string; error?: string | null }): Promise<void> {
  if (!id) return
  try {
    const { error } = await getDb()
      .from('email_log')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  } catch (e) {
    console.error('Journal des courriels : mise à jour impossible :', e)
  }
}

/** Envoie un courriel (HTML + texte) et le consigne. Ne lève jamais d'erreur ; renvoie true si Resend l'a accepté. */
export async function sendEmail(o: Outgoing): Promise<boolean> {
  const logId = await logCreate(o)
  try {
    const { html, text } = renderEmail(o.content, o.locale)
    const key = process.env.RESEND_API_KEY
    if (!key) {
      console.log(`\n[courriel non envoyé — pas de RESEND_API_KEY]\nÀ : ${o.to}\nObjet : ${o.subject}\n\n${text}\n`)
      await logUpdate(logId, { status: 'skipped' })
      return false
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromFor(o.locale),
        to: o.to,
        reply_to: replyToFor(),
        subject: o.subject,
        html,
        text,
        tags: [{ name: 'kind', value: o.kind }],
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500)
      console.error('Envoi du courriel échoué :', res.status, body)
      await logUpdate(logId, { status: 'failed', error: `${res.status} ${body}` })
      return false
    }
    const { id } = (await res.json().catch(() => ({}))) as { id?: string }
    await logUpdate(logId, { status: 'sent', ...(id ? { provider_id: id } : {}) })
    return true
  } catch (e) {
    console.error('Envoi du courriel échoué :', e)
    await logUpdate(logId, { status: 'failed', error: String((e as Error)?.message ?? e).slice(0, 500) })
    return false
  }
}

/**
 * Lien vers la page du donateur ; ?lang= pour qu'elle s'ouvre dans la langue du courriel.
 * `baseUrl` : adresse de l'organisme (sous-domaine) ; par défaut, celle du site.
 */
export function manageLink(token: string, locale: Locale, baseUrl: string = siteUrl()): string {
  return `${baseUrl.replace(/\/$/, '')}/m/${token}?lang=${locale}`
}

/** Pied commun : pourquoi ce courriel, comment répondre, qui propulse la plateforme. */
function footerFor(locale: Locale): string[] {
  const t = translatorFor(locale)
  const brand = brandFor(locale)
  return [
    t('courriel.piedExpediteur', { brand: CONFIG.brand.name, org: orgFor(locale).name }),
    t('courriel.piedRepondre'),
    `${brand.poweredBy} · ${CONFIG.brand.studioLegal.name}`,
  ]
}

export interface Built {
  subject: string
  content: EmailContent
}

export interface ReceiptInput {
  to: string
  amountCents: number
  token: string
  locale: Locale
  donorId?: string | null
  baseUrl?: string
}

// Les courriels partent dans la langue du donateur (celle de son don, ou celle de sa demande de lien).
// Chaque courriel a une fonction « build » (contenu seul, sans envoi) : l'envoi et l'aperçu de la console partagent le même code.
export function buildReceipt(i: Pick<ReceiptInput, 'amountCents' | 'token' | 'locale' | 'baseUrl'>): Built {
  const t = translatorFor(i.locale)
  const org = orgFor(i.locale)
  return {
    subject: t('courriel.recuObjet', { org: org.name }),
    content: {
      preheader: t('courriel.recuPreheader'),
      heading: t('courriel.recuTitre'),
      paragraphs: [
        t('courriel.recuConfirmation', { montant: formatMoney(i.amountCents, i.locale) }),
        `${org.testimonial.question} ${org.testimonial.cta} ${org.testimonial.lead}`,
      ],
      button: { label: t('courriel.recuBouton'), url: manageLink(i.token, i.locale, i.baseUrl) },
      note: t('courriel.recuLienNote'),
      linkHelp: t('courriel.lienAlt'),
      footer: [t('courriel.recuPied'), ...footerFor(i.locale)],
    },
  }
}

export async function sendReceipt(i: ReceiptInput): Promise<boolean> {
  return sendEmail({ kind: 'receipt', to: i.to, locale: i.locale, donorId: i.donorId, ...buildReceipt(i) })
}

export interface MagicLinkInput {
  to: string
  token: string
  locale: Locale
  donorId?: string | null
  baseUrl?: string
}

export function buildMagicLink(i: Pick<MagicLinkInput, 'token' | 'locale' | 'baseUrl'>): Built {
  const t = translatorFor(i.locale)
  return {
    subject: t('courriel.lienObjet', { org: orgFor(i.locale).name }),
    content: {
      preheader: t('courriel.lienPreheader'),
      heading: t('courriel.lienTitre'),
      paragraphs: [t('courriel.lienCorps'), t('courriel.lienIgnorer')],
      button: { label: t('courriel.lienBouton'), url: manageLink(i.token, i.locale, i.baseUrl) },
      linkHelp: t('courriel.lienAlt'),
      footer: footerFor(i.locale),
    },
  }
}

export async function sendMagicLink(i: MagicLinkInput): Promise<boolean> {
  return sendEmail({ kind: 'magic_link', to: i.to, locale: i.locale, donorId: i.donorId, ...buildMagicLink(i) })
}

export interface ReminderInput {
  to: string
  token: string
  locale: Locale
  donorId: string
  baseUrl?: string
}

/** Rappel unique, le lendemain d'un don : invite à ajouter un témoignage (voir lib/reminders.ts). */
export function buildReminder(i: Pick<ReminderInput, 'token' | 'locale' | 'baseUrl'>): Built {
  const t = translatorFor(i.locale)
  const org = orgFor(i.locale)
  return {
    subject: t('courriel.rappelObjet', { org: org.name }),
    content: {
      preheader: t('courriel.rappelPreheader'),
      heading: t('courriel.rappelTitre'),
      paragraphs: [t('courriel.rappelCorps'), `${org.testimonial.question} ${org.testimonial.cta} ${org.testimonial.lead}`],
      button: { label: t('courriel.recuBouton'), url: manageLink(i.token, i.locale, i.baseUrl) },
      note: t('courriel.recuLienNote'),
      linkHelp: t('courriel.lienAlt'),
      footer: [t('courriel.rappelPied'), ...footerFor(i.locale)],
    },
  }
}

export async function sendReminder(i: ReminderInput): Promise<boolean> {
  return sendEmail({ kind: 'reminder', to: i.to, locale: i.locale, donorId: i.donorId, ...buildReminder(i) })
}

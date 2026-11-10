import { CONFIG, brandFor } from './config'
import { clampLocale, identityOrNeutral, type Identity, type OrgTexts } from './identity'
import { getDb } from './db'
import { isErasedEmail } from './erase'
import { siteUrl } from './env'
import { renderEmail, type EmailContent, type EmailHeader } from './emailTemplate'
import { formatMoney } from './format'
import { translatorFor } from './i18n'
import { hasEmailLog } from './schema'
import type { Locale } from '@/i18n/config'

// Courriels transactionnels via l'API REST de Resend (aucune dépendance), en HTML et en texte, dans la langue du donateur.
// Règle d'or : un courriel est un confort, jamais une condition. Aucune fonction d'ici ne lève d'erreur : un échec
// (Resend en panne, journal absent) est écrit dans la console et le journal, et le don ou la demande suit son cours.
// Sans RESEND_API_KEY (développement), le courriel est simplement écrit dans la console du serveur.

export type EmailKind = 'receipt' | 'magic_link' | 'reminder' | 'moderation' | 'invitation' | 'password_reset' | 'signup_code' | 'access_request'

export type EmailStatus = 'queued' | 'sent' | 'delivered' | 'delayed' | 'bounced' | 'complained' | 'failed' | 'skipped'

/** Un statut « plus avancé » n'est jamais remplacé par un plus ancien (les événements du fournisseur arrivent parfois dans le désordre). */
export const STATUS_RANK: Record<EmailStatus, number> = { queued: 0, skipped: 0, failed: 1, sent: 2, delayed: 3, delivered: 4, bounced: 5, complained: 6 }

const SEND_TIMEOUT_MS = 8000

/**
 * Expéditeur : un nom (l'organisme, ou la plateforme pour ses propres courriels) sur l'adresse d'envoi de la plateforme
 * (domaine vérifié chez Resend). EMAIL_FROM (« Nom <adresse> ») prend le dessus ; sinon EMAIL_FROM_ADDRESS ; sinon l'adresse d'essai de Resend.
 */
export function fromFor(name: string = CONFIG.brand.name): string {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM
  const address = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev'
  return `"${name.replace(/["\r\n]/g, '')}" <${address}>`
}

interface Outgoing {
  kind: EmailKind
  to: string
  locale: Locale
  donorId?: string | null
  /** Organisme du courriel (journal) ; absent, on le lit sur le donateur. */
  organizationId?: string | null
  subject: string
  content: EmailContent
  /** Nom de l'expéditeur ; par défaut, la plateforme. */
  fromName?: string
  /** Adresse de réponse ; par défaut, celle de la plateforme. */
  replyTo?: string | null
  /** En-tête de l'organisme (logo ou nom) ; absent : courriel de la plateforme. */
  header?: EmailHeader | null
}

/** Écrit une ligne du journal ; renvoie son identifiant, ou null (journal absent ou en erreur). Ne lève jamais d'erreur. */
async function logCreate(o: Outgoing): Promise<string | null> {
  try {
    if (!(await hasEmailLog())) return null
    const db = getDb()
    // Le journal est rattaché à l'organisme du donateur (clé composite) : on le lit si l'appelant ne l'a pas donné
    let organizationId = o.organizationId ?? null
    if (!organizationId && o.donorId) {
      const { data: d } = await db.from('donors').select('organization_id').eq('id', o.donorId).maybeSingle()
      organizationId = (d?.organization_id as string | undefined) ?? null
    }
    const { data, error } = await db
      .from('email_log')
      // Toujours explicite : null = courriel de la plateforme (invitation à créer un organisme, demande d'accès, code
      // d'inscription…), qui n'apparaît dans le journal d'AUCUN organisme
      .insert({ organization_id: organizationId, donor_id: o.donorId ?? null, to_email: o.to, kind: o.kind, locale: o.locale, subject: o.subject })
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
/**
 * Organisme d'ENTRAÎNEMENT : ses courriels ne partent qu'aux membres de l'équipe de l'organisme réel. Sinon, n'importe
 * qui trouvant son adresse pourrait faire envoyer nos courriels à n'importe qui. Renvoie true si l'envoi est bloqué.
 */
async function practiceBlocked(o: Outgoing): Promise<boolean> {
  const db = getDb()
  let orgId = o.organizationId ?? null
  if (!orgId && o.donorId) {
    const { data } = await db.from('donors').select('organization_id').eq('id', o.donorId).maybeSingle()
    orgId = (data?.organization_id as string | undefined) ?? null
  }
  if (!orgId) return false
  const { data: org } = await db.from('organizations').select('practice_of').eq('id', orgId).maybeSingle()
  const parent = (org?.practice_of as string | null | undefined) ?? null
  if (!parent) return false
  const { data: acc } = await db.from('accounts').select('id').eq('email', o.to.trim().toLowerCase()).maybeSingle()
  if (!acc) return true
  const { data: m } = await db.from('memberships').select('role').eq('account_id', acc.id).eq('organization_id', parent).maybeSingle()
  return !m
}

export async function sendEmail(o: Outgoing): Promise<boolean> {
  // Fiche supprimée (Loi 25) : rien ne part, et rien n'est consigné (le journal garderait une trace de la personne)
  if (isErasedEmail(o.to)) return false
  const logId = await logCreate(o)
  try {
    if (await practiceBlocked(o)) {
      await logUpdate(logId, { status: 'skipped', error: 'Entraînement : envoyé seulement aux membres de l’équipe.' }) // i18n-ok : journal (FR)
      return false
    }
    const { html, text } = renderEmail(o.content, o.locale, o.header)
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
        from: fromFor(o.fromName),
        to: o.to,
        reply_to: o.replyTo || CONFIG.brand.studioLegal.email,
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
function footerFor(locale: Locale, orgName: string): string[] {
  const t = translatorFor(locale)
  const brand = brandFor(locale)
  return [
    t('courriel.piedExpediteur', { brand: CONFIG.brand.name, org: orgName }),
    t('courriel.piedRepondre'),
    `${brand.poweredBy} · ${CONFIG.brand.studioLegal.name}`,
  ]
}

/** Pour un courriel à un donateur : la langue (limitée à celles de l'organisme), ses textes et son expéditeur. */
export function emailIdentity(identity: Identity, locale: Locale) {
  const l = clampLocale(identity.locales, locale)
  return { locale: l, build: { locale: l, org: identity.texts[l] }, from: { fromName: identity.senderName, replyTo: identity.replyTo, header: emailHeader(identity, l) } }
}

/** En-tête des courriels d'un organisme ; null pour l'identité neutre (organisme inconnu : courriel de la plateforme). */
export function emailHeader(identity: Identity, locale: Locale): EmailHeader | null {
  if (!identity.orgId) return null
  const logo = identity.logoUrl
  // Un logo en chemin relatif (fichier du site) doit devenir une adresse complète : un courriel n'a pas d'adresse de base
  const logoUrl = !logo ? null : logo.startsWith('/') ? `${siteUrl().replace(/\/+$/, '')}${logo}` : logo
  return { name: identity.texts[locale]?.name || identity.texts[identity.locales[0]].name, logoUrl, logoSize: identity.logoSize }
}

async function orgEmail(organizationId: string | null | undefined, locale: Locale) {
  return emailIdentity(await identityOrNeutral(organizationId), locale)
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
  organizationId?: string | null
  baseUrl?: string
}

// Les courriels partent dans la langue du donateur (celle de son don, ou celle de sa demande de lien).
// Chaque courriel a une fonction « build » (contenu seul, sans envoi) : l'envoi et l'aperçu de la console partagent le même code.
export function buildReceipt(i: Pick<ReceiptInput, 'amountCents' | 'token' | 'locale' | 'baseUrl'> & { org: OrgTexts }): Built {
  const t = translatorFor(i.locale)
  const org = i.org
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
      footer: [t('courriel.recuPied'), ...footerFor(i.locale, i.org.name)],
    },
  }
}

export async function sendReceipt(i: ReceiptInput): Promise<boolean> {
  const o = await orgEmail(i.organizationId, i.locale)
  return sendEmail({ kind: 'receipt', to: i.to, locale: o.locale, donorId: i.donorId, organizationId: i.organizationId, ...o.from, ...buildReceipt({ ...i, ...o.build }) })
}

export interface MagicLinkInput {
  to: string
  token: string
  locale: Locale
  donorId?: string | null
  organizationId?: string | null
  baseUrl?: string
}

export function buildMagicLink(i: Pick<MagicLinkInput, 'token' | 'locale' | 'baseUrl'> & { org: OrgTexts }): Built {
  const t = translatorFor(i.locale)
  return {
    subject: t('courriel.lienObjet', { org: i.org.name }),
    content: {
      preheader: t('courriel.lienPreheader'),
      heading: t('courriel.lienTitre'),
      paragraphs: [t('courriel.lienCorps'), t('courriel.lienIgnorer')],
      button: { label: t('courriel.lienBouton'), url: manageLink(i.token, i.locale, i.baseUrl) },
      linkHelp: t('courriel.lienAlt'),
      footer: footerFor(i.locale, i.org.name),
    },
  }
}

export async function sendMagicLink(i: MagicLinkInput): Promise<boolean> {
  const o = await orgEmail(i.organizationId, i.locale)
  return sendEmail({ kind: 'magic_link', to: i.to, locale: o.locale, donorId: i.donorId, organizationId: i.organizationId, ...o.from, ...buildMagicLink({ ...i, ...o.build }) })
}

export interface ReminderInput {
  to: string
  token: string
  locale: Locale
  donorId: string
  organizationId?: string | null
  baseUrl?: string
}

/** Rappel unique, le lendemain d'un don : invite à ajouter un témoignage (voir lib/reminders.ts). */
export function buildReminder(i: Pick<ReminderInput, 'token' | 'locale' | 'baseUrl'> & { org: OrgTexts }): Built {
  const t = translatorFor(i.locale)
  const org = i.org
  return {
    subject: t('courriel.rappelObjet', { org: org.name }),
    content: {
      preheader: t('courriel.rappelPreheader'),
      heading: t('courriel.rappelTitre'),
      paragraphs: [t('courriel.rappelCorps'), `${org.testimonial.question} ${org.testimonial.cta} ${org.testimonial.lead}`],
      button: { label: t('courriel.recuBouton'), url: manageLink(i.token, i.locale, i.baseUrl) },
      note: t('courriel.recuLienNote'),
      linkHelp: t('courriel.lienAlt'),
      footer: [t('courriel.rappelPied'), ...footerFor(i.locale, i.org.name)],
    },
  }
}

export async function sendReminder(i: ReminderInput): Promise<boolean> {
  const o = await orgEmail(i.organizationId, i.locale)
  return sendEmail({ kind: 'reminder', to: i.to, locale: o.locale, donorId: i.donorId, organizationId: i.organizationId, ...o.from, ...buildReminder({ ...i, ...o.build }) })
}

/** Ce que l'équipe a fait : publier ou retirer le témoignage ou la photo, ou effacer le nom, le témoignage et la photo d'un coup. */
export type ModerationEvent = 'message_approved' | 'message_removed' | 'photo_approved' | 'photo_removed' | 'content_removed'

export interface ModerationInput {
  to: string
  event: ModerationEvent
  locale: Locale
  donorId?: string | null
  organizationId?: string | null
  baseUrl?: string
}

const MODERATION_KEYS: Record<ModerationEvent, string> = {
  message_approved: 'modMessageApprouve',
  message_removed: 'modMessageRetire',
  photo_approved: 'modPhotoApprouvee',
  photo_removed: 'modPhotoRetiree',
  content_removed: 'modContenuRetire',
}

/** Avis de modération : publié (bouton vers le vitrail) ou retiré parce qu'il enfreint les règles (bouton vers les conditions, et la voie pour répondre). */
export function buildModeration(i: Pick<ModerationInput, 'event' | 'locale' | 'baseUrl'> & { org: OrgTexts }): Built {
  const t = translatorFor(i.locale) as unknown as (key: string, values?: Record<string, unknown>) => string // clés composées : courriel.mod…
  const k = MODERATION_KEYS[i.event]
  const approved = i.event === 'message_approved' || i.event === 'photo_approved'
  const base = (i.baseUrl ?? siteUrl()).replace(/\/$/, '')
  return {
    subject: t('courriel.modObjet', { org: i.org.name }),
    content: {
      preheader: t(`courriel.${k}Preheader`),
      heading: t(`courriel.${k}Titre`),
      paragraphs: approved ? [t(`courriel.${k}Corps`)] : [t(`courriel.${k}Corps`), t('courriel.modRepondre')],
      button: approved
        ? { label: t('courriel.modBouton'), url: `${base}/vitrail?lang=${i.locale}` }
        : { label: t('courriel.modBoutonRegles'), url: `${base}/conditions?lang=${i.locale}` },
      footer: footerFor(i.locale, i.org.name),
    },
  }
}

export async function sendModeration(i: ModerationInput): Promise<boolean> {
  const o = await orgEmail(i.organizationId, i.locale)
  return sendEmail({ kind: 'moderation', to: i.to, locale: o.locale, donorId: i.donorId, organizationId: i.organizationId, ...o.from, ...buildModeration({ ...i, ...o.build }) })
}

// ── Comptes de la console (administrateurs) ────────────────────────────────────

/**
 * Un chemin sur une adresse de base qui peut porter des paramètres (en prévisualisation : https://x.vercel.app?org=slug).
 * linkTo('https://x?org=a', '/admin?jeton=1') → 'https://x/admin?jeton=1&org=a'
 */
export function linkTo(base: string, path: string): string {
  const [root, query] = base.split('?')
  const url = `${root.replace(/\/$/, '')}${path}`
  return query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url
}

export interface InvitationEmailInput {
  to: string
  token: string
  locale: Locale
  orgName: string
  organizationId: string
  role: 'owner' | 'volunteer'
  inviterName?: string | null
  /** Adresse de l'organisme : le lien ouvre sa console. */
  baseUrl: string
}

export function buildInvitation(i: Omit<InvitationEmailInput, 'to' | 'organizationId'>): Built {
  const t = translatorFor(i.locale)
  const url = linkTo(i.baseUrl, `/admin/invitation?jeton=${encodeURIComponent(i.token)}&lang=${i.locale}`)
  const role = i.role === 'owner' ? t('courriel.roleProprietaire') : t('courriel.roleBenevole')
  return {
    subject: t('courriel.invitationObjet', { org: i.orgName }),
    content: {
      preheader: t('courriel.invitationPreheader'),
      heading: t('courriel.invitationTitre'),
      paragraphs: [i.inviterName ? t('courriel.invitationCorps', { inviter: i.inviterName, org: i.orgName, role }) : t('courriel.invitationCorpsSansAuteur', { org: i.orgName, role })],
      button: { label: t('courriel.invitationBouton'), url },
      note: t('courriel.invitationNote'),
      linkHelp: t('courriel.lienAlt'),
      footer: [`${brandFor(i.locale).poweredBy} · ${CONFIG.brand.studioLegal.name}`],
    },
  }
}

export async function sendInvitation(i: InvitationEmailInput): Promise<boolean> {
  return sendEmail({ kind: 'invitation', to: i.to, locale: i.locale, organizationId: i.organizationId, fromName: i.orgName, ...buildInvitation(i) })
}

export function buildPasswordReset(i: { token: string; locale: Locale; baseUrl: string }): Built {
  const t = translatorFor(i.locale)
  const url = linkTo(i.baseUrl, `/admin/reinitialiser?jeton=${encodeURIComponent(i.token)}&lang=${i.locale}`)
  return {
    subject: t('courriel.reinitObjet'),
    content: {
      preheader: t('courriel.reinitPreheader'),
      heading: t('courriel.reinitTitre'),
      paragraphs: [t('courriel.reinitCorps', { brand: CONFIG.brand.name }), t('courriel.reinitIgnorer')],
      button: { label: t('courriel.reinitBouton'), url },
      linkHelp: t('courriel.lienAlt'),
      footer: [`${brandFor(i.locale).poweredBy} · ${CONFIG.brand.studioLegal.name}`],
    },
  }
}

export async function sendPasswordReset(i: { to: string; token: string; locale: Locale; baseUrl: string; organizationId?: string | null }): Promise<boolean> {
  return sendEmail({ kind: 'password_reset', to: i.to, locale: i.locale, organizationId: i.organizationId ?? null, ...buildPasswordReset(i) })
}

// ── Inscription des organismes (plateforme) ────────────────────────────────────

/** Invitation de Studio à CRÉER un organisme : le lien mène à /inscription sur le site de la plateforme. */
export function buildOrgInvitation(i: { token: string; locale: Locale; orgName?: string | null; message?: string | null; baseUrl: string }): Built {
  const t = translatorFor(i.locale)
  const url = linkTo(i.baseUrl, `/inscription?jeton=${encodeURIComponent(i.token)}&lang=${i.locale}`)
  const brand = CONFIG.brand.name
  return {
    subject: i.orgName ? t('courriel.creationObjet', { org: i.orgName }) : t('courriel.creationObjetSansNom'),
    content: {
      preheader: t('courriel.creationPreheader', { brand }),
      heading: t('courriel.creationTitre'),
      paragraphs: [t('courriel.creationCorps', { brand }), ...(i.message ? [t('courriel.creationMot', { message: i.message })] : [])],
      button: { label: t('courriel.creationBouton'), url },
      note: t('courriel.creationNote'),
      linkHelp: t('courriel.lienAlt'),
      footer: [`${brandFor(i.locale).poweredBy} · ${CONFIG.brand.studioLegal.name}`],
    },
  }
}

export async function sendOrgInvitation(i: { to: string; token: string; locale: Locale; orgName?: string | null; message?: string | null; baseUrl: string }): Promise<boolean> {
  return sendEmail({ kind: 'invitation', to: i.to, locale: i.locale, organizationId: null, ...buildOrgInvitation(i) })
}

/** Code à 6 chiffres quand la personne invitée s'inscrit avec une autre adresse que celle de l'invitation. */
export function buildSignupCode(i: { code: string; locale: Locale }): Built {
  const t = translatorFor(i.locale)
  const brand = CONFIG.brand.name
  return {
    subject: t('courriel.codeObjet', { code: i.code }),
    content: {
      preheader: t('courriel.codePreheader'),
      heading: t('courriel.codeTitre'),
      paragraphs: [t('courriel.codeCorps', { brand }), i.code, t('courriel.codeIgnorer')],
      footer: [`${brandFor(i.locale).poweredBy} · ${CONFIG.brand.studioLegal.name}`],
    },
  }
}

export async function sendSignupCode(i: { to: string; code: string; locale: Locale }): Promise<boolean> {
  return sendEmail({ kind: 'signup_code', to: i.to, locale: i.locale, organizationId: null, ...buildSignupCode(i) })
}

/** Adresse qui reçoit les demandes d'invitation (réglage STUDIO_NOTIFY_EMAIL, sinon le courriel de Studio Existence). */
export const studioNotifyEmail = () => (process.env.STUDIO_NOTIFY_EMAIL || CONFIG.brand.studioLegal.email).trim()

/** Avis à Studio : une demande d'invitation est arrivée par la vitrine (en français : c'est pour Studio). */
export async function sendAccessRequestNotice(r: { orgName: string; name: string; email: string; message: string | null; source?: string | null; studioUrl: string }): Promise<boolean> {
  return sendEmail({
    kind: 'access_request',
    to: studioNotifyEmail(),
    locale: 'fr',
    organizationId: null,
    subject: `Demande d’invitation : ${r.orgName}`, // i18n-ok : avis pour Studio (FR)
    content: {
      preheader: `${r.name} (${r.email})`,
      heading: 'Nouvelle demande d’invitation', // i18n-ok : avis pour Studio (FR)
      paragraphs: [`${r.orgName} — ${r.name}, ${r.email}`, ...(r.message ? [`« ${r.message} »`] : []), ...(r.source ? [`Venu du vitrail : ${r.source}`] : [])], // i18n-ok : avis pour Studio (FR)
      button: { label: 'Ouvrir la section Studio', url: r.studioUrl }, // i18n-ok : avis pour Studio (FR)
      footer: [CONFIG.brand.studioLegal.name],
    },
  })
}

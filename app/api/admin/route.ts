import { NextRequest, NextResponse, after } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db'
import { ANON_LABEL } from '@/lib/config'
import { paymentModeFor } from '@/lib/env'
import { requireAdmin, createInvitation, normalizeEmail, organizationsOf, removeMember, revokeInvitation, teamOf, type Role } from '@/lib/auth'
import { sendInvitation, sendMagicLink } from '@/lib/email'
import { createToken } from '@/lib/donations'
import { fetchWhere, recordDonation } from '@/lib/donations'
import { CAMPAIGN_SLUG_RE, RESERVED_CAMPAIGN_SLUGS, forgetTenantCache, getOrg, getVitrail, orgBaseUrl, orgName, orgUrl } from '@/lib/tenant'
import { goLive, practiceOf } from '@/lib/signup'
import { getIdentity, missingForLaunch } from '@/lib/identity'
import { getPhotoModeration, setPhotoModeration } from '@/lib/settings'
import { removePhotoFile } from '@/lib/photos'
import { eraseDonor } from '@/lib/erase'
import { dashboardLink, refreshAccount, startOnboarding } from '@/lib/connect'
import { getStripe } from '@/lib/payments'
import { refundDonationFromConsole } from '@/lib/refunds'
import { baseUrlOf } from '@/lib/tenant'
import { hasEmailLog, hasTestimonialColumns } from '@/lib/schema'
import { defaultColorFor, validateAmountCents, validateColor, validateEmail, validateProfile } from '@/lib/validate'
import { err, failer, internalError, money } from '@/lib/errors'
import { notifyModeration } from '@/lib/moderation'
import type { ModerationEvent } from '@/lib/email'
import { localeOf } from '@/lib/i18n'
import { addressInfo, changeAddress, checkAddress } from '@/lib/org-address'
import { platformDomain } from '@/lib/hosts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


// ── Lecture : tout ce que la console affiche ──────────────────────────────────
export async function GET(request: NextRequest) {
  const a = await requireAdmin(request)
  if ('response' in a) return a.response
  const fail = (where: string, cause: unknown) => internalError(request, where, cause)
  const t = a.ctx
  const orgId = t.tenant.org.id
  const perm = t.tenant.vitrail
  const db = getDb()
  const donorCols: string = `id,email,display_name,show_name,message,photo_url,photo_status,color,hidden,created_at,erased_at${(await hasTestimonialColumns()) ? ',message_status,quote_consent' : ''}`

  const [donorsRes, vitrauxRes, vitrailTotalsRes, donationsRes, moderation, allDonations, visitRows, reportsRes, disputesRes] = await Promise.all([
    db.from('donors').select(donorCols).eq('organization_id', orgId).order('created_at', { ascending: false }).limit(1000),
    db.from('vitraux').select('id,kind,slug,name,state,in_main,goal_cents,starts_on,created_at').eq('organization_id', orgId).order('created_at', { ascending: false }),
    db.from('vitrail_totals').select('vitrail_id,total_cents,donations_count').eq('organization_id', orgId),
    db
      .from('donations')
      .select('id,donor_id,vitrail_id,amount_cents,fee_cents,refunded_cents,dispute_status,dispute_due_by,source,channel,created_at,donors!donations_donor_org_fk(display_name,email,hidden,photo_url,photo_status)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),
    getPhotoModeration(orgId),
    fetchWhere<{ id: string; donor_id: string; channel: string | null; amount_cents: number; refunded_cents: number; source: string; created_at: string }>(
      'donations', 'id,donor_id,channel,amount_cents,refunded_cents,source,created_at', 'organization_id', orgId, 'id'),
    fetchWhere<{ id: string; channel: string }>('visits', 'id,channel', 'organization_id', orgId, 'id'),
    db.from('reports').select('id,donor_id,reason,created_at').eq('organization_id', orgId).eq('resolved', false).order('created_at', { ascending: false }).limit(200),
    // Litiges ouverts : à traiter dans le tableau de bord Stripe avant la date limite (tous, pas seulement les 100 derniers dons)
    db.from('donations').select('id,amount_cents,fee_cents,dispute_due_by,created_at').eq('organization_id', orgId).eq('dispute_status', 'open').order('dispute_due_by', { ascending: true }),
  ])
  for (const r of [donorsRes, vitrauxRes, vitrailTotalsRes, donationsRes]) if (r.error) return fail('Admin GET', r.error)

  // Provenance : visites, dons et montants par emplacement (écran, affiches…)
  const channels = new Map<string, { channel: string; visits: number; donations: number; totalCents: number }>()
  const ch = (name: string | null) => {
    const key = name || 'direct'
    if (!channels.has(key)) channels.set(key, { channel: key, visits: 0, donations: 0, totalCents: 0 })
    return channels.get(key)!
  }
  for (const v of visitRows) ch(v.channel).visits++

  // Total par donateur = tous ses dons à l'organisme (campagnes privées comprises), remboursements déduits
  const totals = new Map<string, { total: number; last: string }>()
  for (const d of allDonations) {
    const net = d.amount_cents - d.refunded_cents
    const cur = totals.get(d.donor_id) ?? { total: 0, last: d.created_at }
    cur.total += net
    if (d.created_at > cur.last) cur.last = d.created_at
    totals.set(d.donor_id, cur)
    if (d.source === 'cash' || d.source === 'seed') continue
    const c = ch(d.channel)
    c.donations++
    c.totalCents += net
  }
  const vitrailTotals = new Map((vitrailTotalsRes.data ?? []).map(x => [x.vitrail_id as string, x]))

  const [team, address, orgs, mailingRows, logRows] = await Promise.all([
    t.role === 'owner' ? teamOf(orgId) : Promise.resolve(null),
    // Adresse du vitrail (Plus) : propriétaire de l'organisme réel seulement
    t.role === 'owner' && !t.tenant.org.practiceOf && !t.tenant.org.showcase ? addressInfo(orgId) : Promise.resolve(null),
    organizationsOf(t.account.id, request),
    fetchWhere<{ id: string; mailing_consent_at: string | null; mailing_withdrawn_at: string | null }>('donors', 'id,mailing_consent_at,mailing_withdrawn_at', 'organization_id', orgId, 'id').catch(() => []),
    (await hasEmailLog())
      ? db.from('email_log').select('donor_id,to_email,status,kind,created_at').eq('organization_id', orgId).in('kind', ['receipt', 'magic_link', 'reminder']).order('created_at', { ascending: false }).limit(2000)
      : Promise.resolve({ data: [] as { donor_id: string | null; to_email: string; status: string; kind: string; created_at: string }[] }),
  ])

  // Rebonds : le DERNIER courriel envoyé à un donateur a rebondi (ou été signalé comme pourriel). Corrigé ou renvoyé avec succès depuis : plus signalé.
  const lastByDonor = new Map<string, { email: string; status: string; at: string }>()
  for (const r of ((logRows as { data: { donor_id: string | null; to_email: string; status: string; created_at: string }[] | null }).data ?? [])) {
    if (r.donor_id && !lastByDonor.has(r.donor_id)) lastByDonor.set(r.donor_id, { email: r.to_email, status: r.status, at: r.created_at })
  }
  const bounces = [...lastByDonor.entries()].filter(([, v]) => v.status === 'bounced' || v.status === 'complained').map(([donorId, v]) => ({ donorId, ...v }))

  // Résumé du vitrail principal : argent net reçu, dons et donateurs (remboursements et litiges perdus déduits)
  const netByDonor = new Map<string, number>()
  let summaryDonations = 0
  for (const d of allDonations) {
    const net = d.amount_cents - d.refunded_cents
    if (net <= 0) continue
    summaryDonations++
    netByDonor.set(d.donor_id, (netByDonor.get(d.donor_id) ?? 0) + net)
  }

  return NextResponse.json({
    org: { name: t.tenant.org.name, slug: t.tenant.org.slug, status: t.tenant.org.status, practice: !!t.tenant.org.practiceOf },
    // Bascule entre l'organisme réel et son entraînement (même équipe)
    switchUrl: await switchUrl(t.tenant.org, request),
    // Le vitrail public de cet organisme (en prévisualisation : avec ?org=)
    vitrailUrl: orgUrl(t.tenant.org.slug, '/vitrail', request),
    // Coordonnées juridiques manquantes (exigées avant la mise en ligne) ; rien pour l'entraînement
    identityMissing: t.tenant.org.practiceOf ? [] : missingForLaunch((await getIdentity(t.tenant.org))?.legal ?? {}),
    // L'atelier (vitrail d'entraînement en mode Modifier) et si une version personnalisée a déjà été publiée
    atelierUrl: await atelierUrl(t.tenant.org, request),
    published: !!(await getDb().from('organizations').select('published_at').eq('id', t.tenant.org.practiceOf ?? t.tenant.org.id).maybeSingle()).data?.published_at,
    summary: {
      totalCents: Number(vitrailTotals.get(perm.id)?.total_cents ?? 0),
      donations: summaryDonations,
      donors: netByDonor.size,
      goalCents: perm.kind === 'campaign' && perm.goalCents > 0 ? perm.goalCents : null,
    },
    bounces,
    mailingCount: (mailingRows as { mailing_consent_at: string | null; mailing_withdrawn_at: string | null }[]).filter(d => d.mailing_consent_at && !d.mailing_withdrawn_at).length,
    me: { name: t.account.name, email: t.account.email, role: t.role, accountId: t.account.id },
    orgs: orgs.filter(o => o.id !== orgId),
    team,
    // Le domaine affiché après l'adresse : celui de la plateforme, sinon (prévisualisation) l'hôte de la requête
    address: address ? { ...address, domain: platformDomain() || (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim().replace(/:\d+$/, '') } : null,
    mode: paymentModeFor(t.tenant.org),
    stripe: { accountId: t.tenant.org.stripeAccountId, ready: t.tenant.org.stripeReady },
    photoModeration: moderation,
    reports: reportsRes.error ? [] : reportsRes.data ?? [],
    disputes: disputesRes.error ? [] : disputesRes.data ?? [],
    channels: [...channels.values()].sort((a, b) => b.totalCents - a.totalCents || b.visits - a.visits),
    donors: ((donorsRes.data ?? []) as unknown as ({ id: string } & Record<string, unknown>)[]).map(d => ({
      ...d,
      totalCents: totals.get(d.id)?.total ?? 0,
      lastDonationAt: totals.get(d.id)?.last ?? null,
    })),
    // Interim : la console parle encore d'« événements ». Un événement = un vitrail ; « en cours » = le permanent.
    events: (vitrauxRes.data ?? []).map(v => ({
      id: v.id,
      kind: v.kind,
      slug: v.slug,
      state: v.state,
      in_main: v.in_main,
      name: v.name,
      starts_on: v.starts_on,
      goal_cents: v.goal_cents,
      is_current: v.id === perm.id,
      created_at: v.created_at,
      totalCents: Number(vitrailTotals.get(v.id)?.total_cents ?? 0),
      donationsCount: Number(vitrailTotals.get(v.id)?.donations_count ?? 0),
    })),
    donations: (donationsRes.data ?? []).map(n => ({ ...n, event_id: n.vitrail_id })),
  })
}

// ── Actions ───────────────────────────────────────────────────────────────────
// Ce que seul le propriétaire peut faire : l'argent, Stripe, les vitraux, l'équipe, les suppressions en masse.
// Le bénévole (téléphone le jour de l'événement) modère et ajoute des dons comptants. Le refus est fait ICI, côté serveur :
// masquer les boutons dans la console ne protège rien.
const OWNER_ONLY = new Set([
  'refundDonation', 'connectStripe', 'stripeDashboard', 'refreshStripe', 'purgeDemo', 'createEvent', 'updateEvent',
  'mergeDonors', 'inviteMember', 'removeMember', 'revokeInvitation', 'changeDonorEmail', 'goLive', 'eraseDonor',
  'checkAddress', 'changeAddress',
])
// Ce qui n'a pas de sens dans l'entraînement : l'argent réel, Stripe, l'équipe (c'est celle de l'organisme réel)
const NOT_IN_PRACTICE = new Set(['refundDonation', 'connectStripe', 'stripeDashboard', 'refreshStripe', 'inviteMember', 'removeMember', 'revokeInvitation', 'goLive', 'checkAddress', 'changeAddress'])

/** Le vitrail de l'atelier, ouvert en mode Modifier. */
async function atelierUrl(org: { id: string; slug: string; practiceOf: string | null }, request: NextRequest): Promise<string | null> {
  if (org.practiceOf) return orgUrl(org.slug, '/vitrail?atelier', request)
  const p = await practiceOf(org.id)
  return p ? orgUrl(p.slug, '/vitrail?atelier', request) : null
}

/** L'adresse de la console de l'autre côté : l'entraînement depuis l'organisme réel, et inversement. */
async function switchUrl(org: { id: string; practiceOf: string | null }, request: NextRequest): Promise<string | null> {
  if (org.practiceOf) {
    const parent = await getOrg(org.practiceOf)
    return parent ? orgUrl(parent.slug, '/admin', request) : null
  }
  const p = await practiceOf(org.id)
  return p ? orgUrl(p.slug, '/admin', request) : null
}

export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const a = await requireAdmin(request, OWNER_ONLY.has(String(b.action)) ? 'owner' : 'volunteer')
  if ('response' in a) return a.response
  const fail = failer(request)
  // Erreur imprévue de la base : détail au journal, message neutre à l'écran
  const oops = (cause: unknown) => internalError(request, `Console, ${String(b.action)}`, cause)
  const t = a.ctx
  const orgId = t.tenant.org.id
  if (t.tenant.org.practiceOf && NOT_IN_PRACTICE.has(String(b.action))) return fail('pasDansAtelier')
  const db = getDb()
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  // Avis au donateur après une décision de modération (sauf si l'équipe décoche « Prévenir le donateur »).
  const tell = (donorId: string, event: ModerationEvent) => {
    if (b.notify !== false) after(() => notifyModeration(donorId, event))
  }
  const before = async (cols: string) => {
    const { data } = await db.from('donors').select(cols).eq('id', str(b.donorId)).eq('organization_id', orgId).maybeSingle()
    return (data ?? {}) as unknown as { display_name?: string; show_name?: boolean; message?: string | null; photo_url?: string | null; photo_status?: string; message_status?: string }
  }

  switch (b.action) {
    // Masquer / réafficher un morceau en direct (le total, lui, garde l'argent reçu)
    case 'hideDonor': {
      const { error } = await db.from('donors').update({ hidden: b.hidden === true, updated_at: new Date().toISOString() }).eq('id', str(b.donorId)).eq('organization_id', orgId)
      return error ? oops(error) : NextResponse.json({ ok: true })
    }

    // Garder le morceau mais effacer le nom, le message et la photo
    case 'scrubDonor': {
      const prev = await before('display_name,show_name,message,photo_url')
      const { error } = await db
        .from('donors')
        .update({ display_name: ANON_LABEL, show_name: false, message: null, photo_url: null, updated_at: new Date().toISOString() })
        .eq('id', str(b.donorId))
        .eq('organization_id', orgId)
      if (!error) {
        await removePhotoFile(prev.photo_url, orgId)
        if (prev.message?.trim() || prev.photo_url || (prev.show_name && prev.display_name && prev.display_name !== ANON_LABEL)) tell(str(b.donorId), 'content_removed')
      }
      return error ? oops(error) : NextResponse.json({ ok: true })
    }

    // Supprimer les renseignements du donateur (Loi 25) : courriel, nom, témoignage, photo, consentement, journal.
    // Ses dons restent (comptabilité), rattachés à une fiche vide. Irréversible : la console demande confirmation.
    case 'eraseDonor': {
      const r = await eraseDonor(orgId, str(b.donorId))
      return r.ok ? NextResponse.json({ ok: true }) : r.status === 404 ? fail('donateurInconnu', 404) : oops(r.error)
    }

    // Mode de publication des photos : « live » (tout de suite) ou « moderation » (après approbation)
    case 'setPhotoModeration': {
      await setPhotoModeration(orgId, b.mode === 'moderation' ? 'moderation' : 'live')
      return NextResponse.json({ ok: true })
    }

    // Approuver une photo en attente : elle apparaît sur l'écran
    case 'approvePhoto': {
      const prev = await before('photo_url,photo_status')
      const { error } = await db.from('donors').update({ photo_status: 'approved', updated_at: new Date().toISOString() }).eq('id', str(b.donorId)).eq('organization_id', orgId)
      if (!error && prev.photo_url && prev.photo_status === 'pending') tell(str(b.donorId), 'photo_approved')
      return error ? oops(error) : NextResponse.json({ ok: true })
    }

    // Témoignage en attente : publié (il apparaît sur l'écran), ou refusé (effacé ; nom et photo restent)
    case 'approveMessage': {
      const prev = (await hasTestimonialColumns()) ? await before('message,message_status') : {}
      const { error } = await db.from('donors').update({ message_status: 'approved', updated_at: new Date().toISOString() }).eq('id', str(b.donorId)).eq('organization_id', orgId)
      if (!error && prev.message?.trim() && prev.message_status === 'pending') tell(str(b.donorId), 'message_approved')
      return error ? oops(error) : NextResponse.json({ ok: true })
    }
    case 'removeMessage': {
      const prev = await before('message')
      const patch: Record<string, unknown> = { message: null, updated_at: new Date().toISOString() }
      if (await hasTestimonialColumns()) Object.assign(patch, { message_status: 'approved', quote_consent: false })
      const { error } = await db.from('donors').update(patch).eq('id', str(b.donorId)).eq('organization_id', orgId)
      if (!error && prev.message?.trim()) tell(str(b.donorId), 'message_removed')
      return error ? oops(error) : NextResponse.json({ ok: true })
    }

    // Signalement traité (ou sans suite) : il quitte la liste
    case 'resolveReports': {
      const { error } = await db.from('reports').update({ resolved: true }).eq('organization_id', orgId).eq('donor_id', str(b.donorId))
      return error ? oops(error) : NextResponse.json({ ok: true })
    }

    // Retirer seulement la photo (nom et message restent)
    case 'removePhoto': {
      const prev = await before('photo_url')
      const { error } = await db.from('donors').update({ photo_url: null, photo_status: 'approved', updated_at: new Date().toISOString() }).eq('id', str(b.donorId)).eq('organization_id', orgId)
      if (!error) {
        await removePhotoFile(prev.photo_url, orgId)
        if (prev.photo_url) tell(str(b.donorId), 'photo_removed')
      }
      return error ? oops(error) : NextResponse.json({ ok: true })
    }

    // Don en argent comptant, ou don d'amorçage (CA, équipe) avant l'ouverture
    case 'addCash': {
      const amount = validateAmountCents(b.amountCents)
      if (!amount.ok) return fail(amount.error)
      const source = b.source === 'seed' ? 'seed' : 'cash'

      let email: string
      if (str(b.email).trim()) {
        const e = validateEmail(b.email)
        if (!e.ok) return fail(e.error)
        email = e.value
      } else {
        email = `${source}+${randomUUID()}@donateur.invalid` // donateur sans courriel : un morceau à lui seul
      }
      const profile = validateProfile({ showName: b.showName === true, name: b.name, message: b.message })
      if (!profile.ok) return fail(profile.error)
      const color = validateColor(b.color)

      // Le vitrail du don : celui choisi (qui doit être à cet organisme), sinon le permanent
      const wanted = str(b.vitrailId) || str(b.eventId)
      const vitrail = wanted ? await getVitrail(orgId, wanted) : t.tenant.vitrail
      if (!vitrail) return fail('vitrailInconnu')

      const result = await recordDonation({
        organizationId: orgId,
        vitrailId: vitrail.id,
        email,
        profile: profile.value,
        color: color.ok ? color.value : defaultColorFor(email),
        amountCents: amount.value,
        source,
        providerRef: null,
      })
      return NextResponse.json({ ok: true, ...result })
    }

    // Courriel mal tapé : on réunit deux morceaux (du même organisme : jamais d'un organisme à l'autre)
    case 'mergeDonors': {
      const from = str(b.fromId)
      const into = str(b.intoId)
      if (!from || !into || from === into) return fail('morceauxDifferents')
      const { data: both, error: findError } = await db.from('donors').select('id,erased_at').eq('organization_id', orgId).in('id', [from, into])
      if (findError) return oops(findError)
      if ((both ?? []).length !== 2) return fail('morceauInconnu')
      // Une fiche supprimée ne se rattache plus à personne (ce serait la réidentifier)
      if ((both ?? []).some(d => d.erased_at)) return fail('fusionSupprime')
      const moved = await db.from('donations').update({ donor_id: into }).eq('organization_id', orgId).eq('donor_id', from)
      if (moved.error) return oops(moved.error)
      const removed = await db.from('donors').delete().eq('id', from).eq('organization_id', orgId)
      return removed.error ? oops(removed.error) : NextResponse.json({ ok: true })
    }

    // Interim : « créer un événement » crée une campagne (un vitrail à elle, adresse /<identifiant>)
    case 'createEvent': {
      const name = str(b.name).trim()
      if (name.length < 2 || name.length > 80) return fail(err('campagneNom', { min: 2, max: 80 }))
      const goal = Math.round(Number(b.goalCents) || 0)
      if (goal < 0) return fail('objectifNegatif')
      const base = slugify(name)
      if (!base) return fail('campagneNomLettres')
      // Identifiant libre dans cet organisme (jamais réutilisé : l'unicité est aussi garantie par la base)
      const { data: taken } = await db.from('vitraux').select('slug').eq('organization_id', orgId).like('slug', `${base}%`)
      const used = new Set((taken ?? []).map(r => r.slug as string))
      let slug = base
      for (let n = 2; used.has(slug) || (RESERVED_CAMPAIGN_SLUGS as readonly string[]).includes(slug); n++) slug = `${base.slice(0, 36)}-${n}`
      const { data, error } = await db
        .from('vitraux')
        .insert({ organization_id: orgId, kind: 'campaign', slug, name, goal_cents: goal, starts_on: str(b.startsOn) || null })
        .select('id')
        .single()
      forgetTenantCache()
      return error ? oops(error) : NextResponse.json({ ok: true, id: data.id, slug })
    }

    case 'updateEvent': {
      const patch: Record<string, unknown> = {}
      if (typeof b.name === 'string' && b.name.trim().length >= 2) patch.name = b.name.trim().slice(0, 80)
      if (b.goalCents !== undefined) patch.goal_cents = Math.max(0, Math.round(Number(b.goalCents) || 0))
      if (b.startsOn !== undefined) patch.starts_on = str(b.startsOn) || null
      // Clore une campagne : elle reste en ligne mais n'accepte plus de dons (le permanent ne se clôt pas : la base refuse)
      if (b.state === 'closed' || b.state === 'active') {
        patch.state = b.state
        patch.closed_at = b.state === 'closed' ? new Date().toISOString() : null
      }
      const { error } = await db.from('vitraux').update(patch).eq('id', str(b.eventId)).eq('organization_id', orgId)
      forgetTenantCache()
      return error ? oops(error) : NextResponse.json({ ok: true })
    }

    // Compte Stripe de l'organisme : créer (si besoin) et ouvrir l'inscription hébergée par Stripe
    case 'connectStripe': {
      if (!process.env.STRIPE_SECRET_KEY) return fail('stripeNonConfigure', 500)
      try {
        const { url } = await startOnboarding(t.tenant.org, baseUrlOf(request))
        return NextResponse.json({ ok: true, url })
      } catch (e) {
        console.error('Inscription Stripe impossible :', e)
        return fail('stripeInscriptionEchec', 502)
      }
    }

    // Ouvrir le tableau de bord Stripe (Express) de l'organisme
    case 'stripeDashboard': {
      const accountId = t.tenant.org.stripeAccountId
      if (!accountId || !t.tenant.org.stripeReady) return fail('stripePasPret')
      try {
        const url = await dashboardLink(accountId)
        return url ? NextResponse.json({ ok: true, url }) : fail('stripeSurSite')
      } catch (e) {
        console.error('Lien du tableau de bord Stripe impossible :', e)
        return fail('stripeTableauEchec', 502)
      }
    }

    // Relire l'état du compte chez Stripe (au retour de l'inscription)
    case 'refreshStripe': {
      const accountId = t.tenant.org.stripeAccountId
      if (!accountId) return fail('stripeAucunCompte')
      try {
        return NextResponse.json({ ok: true, ready: await refreshAccount(orgId, accountId) })
      } catch (e) {
        console.error('Lecture du compte Stripe impossible :', e)
        return fail('stripeLectureEchec', 502)
      }
    }

    // Rembourser un don payé par carte, depuis la console (sur le compte Stripe de l'organisme ; notre commission est rendue au prorata)
    case 'refundDonation': {
      const accountId = t.tenant.org.stripeReady ? t.tenant.org.stripeAccountId : null
      if (!process.env.STRIPE_SECRET_KEY) return fail('stripeNonConfigure', 500)
      // Montant du paiement à rendre, en cents ; absent = tout ce qui reste
      const raw = b.amountCents
      const amount = raw === undefined || raw === null || raw === '' ? null : Math.round(Number(raw))
      if (amount !== null && !Number.isFinite(amount)) return fail('montantInvalide')
      try {
        const r = await refundDonationFromConsole(getStripe(), orgId, accountId, str(b.donationId), amount)
        if (r.ok) return NextResponse.json(r)
        const reasons = {
          unknown: err('donInconnu'),
          not_stripe: err('remboursementPasCarte'),
          no_account: err('stripePasPret'),
          not_found: err('remboursementIntrouvable'),
          disputed: err('remboursementLitige'),
          nothing_left: err('remboursementFait'),
          bad_amount: err('remboursementMontant', { montant: money(r.remainingCents ?? 0) }),
          failed: err('remboursementRefuse'),
        } satisfies Record<typeof r.reason, ReturnType<typeof err>>
        return fail(reasons[r.reason], r.reason === 'unknown' ? 404 : 400)
      } catch (e) {
        // Le détail de Stripe (en anglais) va au journal ; la personne voit quoi faire
        console.error('Remboursement depuis la console impossible :', e)
        return fail('remboursementEchec', 502)
      }
    }

    // Renvoyer au donateur son lien personnel (il l'a perdu, ou son adresse vient d'être corrigée)
    case 'resendLink': {
      const { data: d } = await db.from('donors').select('id,email,locale').eq('id', str(b.donorId)).eq('organization_id', orgId).maybeSingle()
      if (!d) return fail('donateurInconnu', 404)
      if (String(d.email).endsWith('.invalid')) return fail('donateurSansCourriel')
      const org = t.tenant.org
      after(async () => {
        try {
          await sendMagicLink({ to: d.email as string, token: await createToken(d.id as string), locale: d.locale === 'en' ? 'en' : 'fr', donorId: d.id as string, organizationId: org.id, baseUrl: orgBaseUrl(org.slug) })
        } catch (e) {
          console.error('Lien personnel non renvoyé :', e)
        }
      })
      return NextResponse.json({ ok: true })
    }

    // Corriger une adresse mal tapée (reçu en rebond). Si l'adresse correcte a déjà son morceau : il faut fusionner.
    case 'changeDonorEmail': {
      const e = validateEmail(normalizeEmail(b.email))
      if (!e.ok) return fail(e.error)
      const { data: target } = await db.from('donors').select('erased_at').eq('id', str(b.donorId)).eq('organization_id', orgId).maybeSingle()
      if (target?.erased_at) return fail('adresseSupprime')
      const { data: other } = await db.from('donors').select('id').eq('organization_id', orgId).eq('email', e.value).maybeSingle()
      if (other && other.id !== str(b.donorId)) return fail('adresseDejaPrise')
      const { error } = await db.from('donors').update({ email: e.value, updated_at: new Date().toISOString() }).eq('id', str(b.donorId)).eq('organization_id', orgId)
      return error ? oops(error) : NextResponse.json({ ok: true })
    }

    // Équipe : inviter quelqu'un (propriétaire ou bénévole). Le lien part par courriel et vaut 7 jours.
    case 'inviteMember': {
      const email = normalizeEmail(b.email)
      const e = validateEmail(email)
      if (!e.ok) return fail(e.error)
      const role: Role = b.role === 'owner' ? 'owner' : 'volunteer'
      const team = await teamOf(orgId)
      if (team.members.some(m => m.email === e.value)) return fail('dejaDansEquipe')
      // Langue de l'invitation (courriel et page d'acceptation) : choisie dans la console, sinon celle de la console
      const locale = b.locale === 'en' || b.locale === 'fr' ? b.locale : localeOf(request)
      const inv = await createInvitation({ email: e.value, organizationId: orgId, role, invitedBy: t.account.id, locale })
      const org = t.tenant.org
      after(async () => {
        try {
          await sendInvitation({ to: e.value, token: inv.token, locale, orgName: orgName(org, locale), organizationId: org.id, role, inviterName: t.account.name || null, baseUrl: orgUrl(org.slug, '', request) })
        } catch (err) {
          console.error('Invitation non envoyée :', err)
        }
      })
      return NextResponse.json({ ok: true })
    }

    case 'removeMember': {
      const r = await removeMember(orgId, str(b.accountId))
      return r.ok ? NextResponse.json({ ok: true }) : fail(r.error)
    }

    case 'revokeInvitation': {
      await revokeInvitation(orgId, str(b.invitationId))
      return NextResponse.json({ ok: true })
    }

    // Adresse du vitrail : vérification pendant la saisie, puis changement (règles dans lib/org-address.ts)
    case 'checkAddress': {
      if (t.tenant.org.showcase) return fail('impossibleIci')
      return NextResponse.json({ state: await checkAddress(orgId, b.slug) })
    }

    case 'changeAddress': {
      if (t.tenant.org.showcase) return fail('impossibleIci')
      const r = await changeAddress(orgId, b.slug)
      if (!r.ok) {
        const key = ({ forme: 'adresseVitrailForme', reserve: 'adresseVitrailReservee', pris: 'adresseVitrailPrise', meme: 'adresseVitrailMeme', limite: 'adresseVitrailLimite', impossible: 'impossibleIci' } as const)[r.error]
        return fail(key)
      }
      // La console continue à la nouvelle adresse (la session vaut pour toute la plateforme)
      return NextResponse.json({ ok: true, slug: r.slug, url: orgUrl(r.slug, '/admin', request) })
    }

    // Il n'y a plus d'« événement en cours » : le vitrail permanent est toujours celui de l'organisme
    case 'setCurrent':
      return fail('vitrailPermanent')

    // Avant l'événement : retirer tout ce qui a été créé en mode démo (de CET organisme)
    // Mettre en ligne : brouillon → en ligne, quand le compte Stripe est prêt (l'entraînement reste tel quel)
    case 'goLive': {
      const r = await goLive(orgId)
      if (!r.ok) return fail(r.error === 'stripe' ? 'stripePasPret' : r.error === 'juridique' ? 'coordonneesIncompletes' : r.error === 'deja' ? 'dejaEnLigne' : 'impossibleIci')
      return NextResponse.json({ ok: true })
    }

    // Dons de démo ; dans l'entraînement : TOUS ses dons (comptants compris), pour repartir à neuf
    case 'purgeDemo': {
      const purge = db.from('donations').delete().eq('organization_id', orgId)
      const del = await (t.tenant.org.practiceOf ? purge : purge.eq('source', 'demo'))
      if (del.error) return oops(del.error)
      // Les donateurs restés sans aucun don (un don remboursé reste un don : son donateur n'est pas supprimé)
      const [donors, withDonations] = await Promise.all([
        fetchWhere<{ id: string }>('donors', 'id', 'organization_id', orgId, 'id'),
        fetchWhere<{ id: string; donor_id: string }>('donations', 'id,donor_id', 'organization_id', orgId, 'id'),
      ])
      const keep = new Set(withDonations.map(d => d.donor_id))
      const ids = donors.map(d => d.id).filter(id => !keep.has(id))
      for (let i = 0; i < ids.length; i += 100) await db.from('donors').delete().eq('organization_id', orgId).in('id', ids.slice(i, i + 100))
      return NextResponse.json({ ok: true, donorsRemoved: ids.length })
    }
  }
  return fail('actionInconnue')
}

/** « Gala d'hiver 2027 » → « gala-d-hiver-2027 » (accents retirés, 40 caractères au plus). */
function slugify(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return CAMPAIGN_SLUG_RE.test(s) ? s : ''
}

import { NextRequest, NextResponse, after } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db'
import { paymentModeFor } from '@/lib/env'
import { requireAdmin, createInvitation, normalizeEmail, organizationsOf, removeMember, revokeInvitation, teamOf, type Role } from '@/lib/auth'
import { sendInvitation, sendMagicLink } from '@/lib/email'
import { createToken } from '@/lib/donations'
import { fetchWhere, recordDonation } from '@/lib/donations'
import { CAMPAIGN_SLUG_RE, RESERVED_CAMPAIGN_SLUGS, forgetTenantCache, getVitrail, orgBaseUrl } from '@/lib/tenant'
import { getPhotoModeration, setPhotoModeration } from '@/lib/settings'
import { removePhotoFile } from '@/lib/photos'
import { dashboardLink, refreshAccount, startOnboarding } from '@/lib/connect'
import { getStripe } from '@/lib/payments'
import { refundDonationFromConsole } from '@/lib/refunds'
import { formatMoney } from '@/lib/format'
import { baseUrlOf } from '@/lib/tenant'
import { hasEmailLog, hasTestimonialColumns } from '@/lib/schema'
import { defaultColorFor, validateAmountCents, validateColor, validateEmail, validateProfile } from '@/lib/validate'
import { errorMessage } from '@/lib/errors'
import { notifyModeration } from '@/lib/moderation'
import type { ModerationEvent } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

// ── Lecture : tout ce que la console affiche ──────────────────────────────────
export async function GET(request: NextRequest) {
  const a = await requireAdmin(request)
  if ('response' in a) return a.response
  const t = a.ctx
  const orgId = t.tenant.org.id
  const perm = t.tenant.vitrail
  const db = getDb()
  const donorCols: string = `id,email,display_name,show_name,message,photo_url,photo_status,color,hidden,created_at${(await hasTestimonialColumns()) ? ',message_status,quote_consent' : ''}`

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
  for (const r of [donorsRes, vitrauxRes, vitrailTotalsRes, donationsRes]) if (r.error) { console.error('Admin GET :', r.error); return fail(r.error.message, 500) }

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

  const [team, orgs, mailingRows, logRows] = await Promise.all([
    t.role === 'owner' ? teamOf(orgId) : Promise.resolve(null),
    organizationsOf(t.account.id),
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
    org: { name: t.tenant.org.name, slug: t.tenant.org.slug, status: t.tenant.org.status },
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
  'mergeDonors', 'inviteMember', 'removeMember', 'revokeInvitation', 'changeDonorEmail',
])

export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const a = await requireAdmin(request, OWNER_ONLY.has(String(b.action)) ? 'owner' : 'volunteer')
  if ('response' in a) return a.response
  const t = a.ctx
  const orgId = t.tenant.org.id
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
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Garder le morceau mais effacer le nom, le message et la photo
    case 'scrubDonor': {
      const prev = await before('display_name,show_name,message,photo_url')
      const { error } = await db
        .from('donors')
        .update({ display_name: 'Anonyme', show_name: false, message: null, photo_url: null, updated_at: new Date().toISOString() })
        .eq('id', str(b.donorId))
        .eq('organization_id', orgId)
      if (!error) {
        await removePhotoFile(prev.photo_url)
        if (prev.message?.trim() || prev.photo_url || (prev.show_name && prev.display_name && prev.display_name !== 'Anonyme')) tell(str(b.donorId), 'content_removed')
      }
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
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
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Témoignage en attente : publié (il apparaît sur l'écran), ou refusé (effacé ; nom et photo restent)
    case 'approveMessage': {
      const prev = (await hasTestimonialColumns()) ? await before('message,message_status') : {}
      const { error } = await db.from('donors').update({ message_status: 'approved', updated_at: new Date().toISOString() }).eq('id', str(b.donorId)).eq('organization_id', orgId)
      if (!error && prev.message?.trim() && prev.message_status === 'pending') tell(str(b.donorId), 'message_approved')
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }
    case 'removeMessage': {
      const prev = await before('message')
      const patch: Record<string, unknown> = { message: null, updated_at: new Date().toISOString() }
      if (await hasTestimonialColumns()) Object.assign(patch, { message_status: 'approved', quote_consent: false })
      const { error } = await db.from('donors').update(patch).eq('id', str(b.donorId)).eq('organization_id', orgId)
      if (!error && prev.message?.trim()) tell(str(b.donorId), 'message_removed')
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Signalement traité (ou sans suite) : il quitte la liste
    case 'resolveReports': {
      const { error } = await db.from('reports').update({ resolved: true }).eq('organization_id', orgId).eq('donor_id', str(b.donorId))
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Retirer seulement la photo (nom et message restent)
    case 'removePhoto': {
      const prev = await before('photo_url')
      const { error } = await db.from('donors').update({ photo_url: null, photo_status: 'approved', updated_at: new Date().toISOString() }).eq('id', str(b.donorId)).eq('organization_id', orgId)
      if (!error) {
        await removePhotoFile(prev.photo_url)
        if (prev.photo_url) tell(str(b.donorId), 'photo_removed')
      }
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Don en argent comptant, ou don d'amorçage (CA, équipe) avant l'ouverture
    case 'addCash': {
      const amount = validateAmountCents(b.amountCents)
      if (!amount.ok) return fail(errorMessage('fr', amount.error))
      const source = b.source === 'seed' ? 'seed' : 'cash'

      let email: string
      if (str(b.email).trim()) {
        const e = validateEmail(b.email)
        if (!e.ok) return fail(errorMessage('fr', e.error))
        email = e.value
      } else {
        email = `${source}+${randomUUID()}@donateur.invalid` // donateur sans courriel : un morceau à lui seul
      }
      const profile = validateProfile({ showName: b.showName === true, name: b.name, message: b.message })
      if (!profile.ok) return fail(errorMessage('fr', profile.error))
      const color = validateColor(b.color)

      // Le vitrail du don : celui choisi (qui doit être à cet organisme), sinon le permanent
      const wanted = str(b.vitrailId) || str(b.eventId)
      const vitrail = wanted ? await getVitrail(orgId, wanted) : t.tenant.vitrail
      if (!vitrail) return fail('Vitrail inconnu.')

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
      if (!from || !into || from === into) return fail('Choisissez deux morceaux différents.')
      const { data: both, error: findError } = await db.from('donors').select('id').eq('organization_id', orgId).in('id', [from, into])
      if (findError) return fail(findError.message, 500)
      if ((both ?? []).length !== 2) return fail('Morceau inconnu.')
      const moved = await db.from('donations').update({ donor_id: into }).eq('organization_id', orgId).eq('donor_id', from)
      if (moved.error) return fail(moved.error.message, 500)
      const removed = await db.from('donors').delete().eq('id', from).eq('organization_id', orgId)
      return removed.error ? fail(removed.error.message, 500) : NextResponse.json({ ok: true })
    }

    // Interim : « créer un événement » crée une campagne (un vitrail à elle, adresse /<identifiant>)
    case 'createEvent': {
      const name = str(b.name).trim()
      if (name.length < 2 || name.length > 80) return fail('Le nom de la campagne doit compter de 2 à 80 caractères.')
      const goal = Math.round(Number(b.goalCents) || 0)
      if (goal < 0) return fail("L'objectif ne peut pas être négatif.")
      const base = slugify(name)
      if (!base) return fail('Le nom doit contenir des lettres ou des chiffres.')
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
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true, id: data.id, slug })
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
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Compte Stripe de l'organisme : créer (si besoin) et ouvrir l'inscription hébergée par Stripe
    case 'connectStripe': {
      if (!process.env.STRIPE_SECRET_KEY) return fail("Stripe n'est pas configuré (STRIPE_SECRET_KEY).", 500)
      try {
        const { url } = await startOnboarding(t.tenant.org, baseUrlOf(request))
        return NextResponse.json({ ok: true, url })
      } catch (e) {
        console.error('Inscription Stripe impossible :', e)
        return fail("L'inscription Stripe n'a pas pu démarrer.", 502)
      }
    }

    // Ouvrir le tableau de bord Stripe (Express) de l'organisme
    case 'stripeDashboard': {
      const accountId = t.tenant.org.stripeAccountId
      if (!accountId || !t.tenant.org.stripeReady) return fail("Le compte Stripe n'est pas encore prêt.")
      try {
        const url = await dashboardLink(accountId)
        return url ? NextResponse.json({ ok: true, url }) : fail('Ce compte se gère directement sur stripe.com.')
      } catch (e) {
        console.error('Lien du tableau de bord Stripe impossible :', e)
        return fail("Le tableau de bord Stripe n'a pas pu s'ouvrir.", 502)
      }
    }

    // Relire l'état du compte chez Stripe (au retour de l'inscription)
    case 'refreshStripe': {
      const accountId = t.tenant.org.stripeAccountId
      if (!accountId) return fail("Aucun compte Stripe n'est connecté.")
      try {
        return NextResponse.json({ ok: true, ready: await refreshAccount(orgId, accountId) })
      } catch (e) {
        console.error('Lecture du compte Stripe impossible :', e)
        return fail("Le compte Stripe n'a pas pu être lu.", 502)
      }
    }

    // Rembourser un don payé par carte, depuis la console (sur le compte Stripe de l'organisme ; notre commission est rendue au prorata)
    case 'refundDonation': {
      const accountId = t.tenant.org.stripeReady ? t.tenant.org.stripeAccountId : null
      if (!process.env.STRIPE_SECRET_KEY) return fail("Stripe n'est pas configuré (STRIPE_SECRET_KEY).", 500)
      // Montant du paiement à rendre, en cents ; absent = tout ce qui reste
      const raw = b.amountCents
      const amount = raw === undefined || raw === null || raw === '' ? null : Math.round(Number(raw))
      if (amount !== null && !Number.isFinite(amount)) return fail('Montant invalide.')
      try {
        const r = await refundDonationFromConsole(getStripe(), orgId, accountId, str(b.donationId), amount)
        if (r.ok) return NextResponse.json(r)
        const messages: Record<typeof r.reason, string> = {
          unknown: 'Don inconnu.',
          not_stripe: "Ce don n'a pas été payé par carte : il ne se rembourse pas par Stripe.",
          no_account: "Le compte Stripe de l'organisme n'est pas prêt.",
          not_found: 'Paiement introuvable chez Stripe.',
          disputed: 'Ce paiement est contesté par le donateur : le litige se règle dans le tableau de bord Stripe, pas par un remboursement.',
          nothing_left: 'Ce paiement est déjà entièrement remboursé.',
          bad_amount: `Montant invalide : au plus ${formatMoney(r.remainingCents ?? 0)}.`,
          failed: 'Stripe a refusé le remboursement.',
        }
        return fail(messages[r.reason], r.reason === 'unknown' ? 404 : 400)
      } catch (e) {
        console.error('Remboursement depuis la console impossible :', e)
        return fail(`Le remboursement n'a pas pu être fait : ${(e as { message?: string }).message ?? 'erreur Stripe'}`, 502)
      }
    }

    // Renvoyer au donateur son lien personnel (il l'a perdu, ou son adresse vient d'être corrigée)
    case 'resendLink': {
      const { data: d } = await db.from('donors').select('id,email,locale').eq('id', str(b.donorId)).eq('organization_id', orgId).maybeSingle()
      if (!d) return fail('Donateur introuvable.', 404)
      if (String(d.email).endsWith('.invalid')) return fail("Ce donateur n'a pas d'adresse courriel.")
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
      if (!e.ok) return fail(errorMessage('fr', e.error))
      const { data: other } = await db.from('donors').select('id').eq('organization_id', orgId).eq('email', e.value).maybeSingle()
      if (other && other.id !== str(b.donorId)) return fail('Cette adresse a déjà son propre morceau : fusionnez les deux morceaux plutôt.')
      const { error } = await db.from('donors').update({ email: e.value, updated_at: new Date().toISOString() }).eq('id', str(b.donorId)).eq('organization_id', orgId)
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Équipe : inviter quelqu'un (propriétaire ou bénévole). Le lien part par courriel et vaut 7 jours.
    case 'inviteMember': {
      const email = normalizeEmail(b.email)
      const e = validateEmail(email)
      if (!e.ok) return fail(errorMessage('fr', e.error))
      const role: Role = b.role === 'owner' ? 'owner' : 'volunteer'
      const team = await teamOf(orgId)
      if (team.members.some(m => m.email === e.value)) return fail('Cette personne fait déjà partie de l\'équipe.')
      const inv = await createInvitation({ email: e.value, organizationId: orgId, role, invitedBy: t.account.id })
      const org = t.tenant.org
      after(async () => {
        try {
          await sendInvitation({ to: e.value, token: inv.token, locale: 'fr', orgName: org.name, organizationId: org.id, role, inviterName: t.account.name || null, baseUrl: orgBaseUrl(org.slug) })
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

    // Il n'y a plus d'« événement en cours » : le vitrail permanent est toujours celui de l'organisme
    case 'setCurrent':
      return fail("Le vitrail permanent est toujours celui de l'organisme ; chaque campagne a sa propre adresse.")

    // Avant l'événement : retirer tout ce qui a été créé en mode démo (de CET organisme)
    case 'purgeDemo': {
      const del = await db.from('donations').delete().eq('organization_id', orgId).eq('source', 'demo')
      if (del.error) return fail(del.error.message, 500)
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
  return fail('Action inconnue.')
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

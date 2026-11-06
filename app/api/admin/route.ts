import { NextRequest, NextResponse, after } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db'
import { paymentMode } from '@/lib/env'
import { isAdmin } from '@/lib/session'
import { fetchWhere, recordDonation } from '@/lib/donations'
import { CAMPAIGN_SLUG_RE, RESERVED_CAMPAIGN_SLUGS, forgetTenantCache, getVitrail, requireTenant } from '@/lib/tenant'
import { getPhotoModeration, setPhotoModeration } from '@/lib/settings'
import { removePhotoFile } from '@/lib/photos'
import { hasTestimonialColumns } from '@/lib/schema'
import { defaultColorFor, validateAmountCents, validateColor, validateEmail, validateProfile } from '@/lib/validate'
import { errorMessage } from '@/lib/errors'
import { notifyModeration } from '@/lib/moderation'
import type { ModerationEvent } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

// ── Lecture : tout ce que la console affiche ──────────────────────────────────
export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return fail('Non autorisé', 403)
  const t = await requireTenant(request)
  if ('response' in t) return t.response
  const orgId = t.tenant.org.id
  const perm = t.tenant.vitrail
  const db = getDb()
  const donorCols: string = `id,email,display_name,show_name,message,photo_url,photo_status,color,hidden,created_at${(await hasTestimonialColumns()) ? ',message_status,quote_consent' : ''}`

  const [donorsRes, vitrauxRes, vitrailTotalsRes, donationsRes, moderation, allDonations, visitRows, reportsRes] = await Promise.all([
    db.from('donors').select(donorCols).eq('organization_id', orgId).order('created_at', { ascending: false }).limit(1000),
    db.from('vitraux').select('id,kind,slug,name,state,in_main,goal_cents,starts_on,created_at').eq('organization_id', orgId).order('created_at', { ascending: false }),
    db.from('vitrail_totals').select('vitrail_id,total_cents,donations_count').eq('organization_id', orgId),
    db
      .from('donations')
      .select('id,donor_id,vitrail_id,amount_cents,refunded_cents,source,channel,created_at,donors(display_name,email,hidden,photo_url,photo_status)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),
    getPhotoModeration(orgId),
    fetchWhere<{ id: string; donor_id: string; channel: string | null; amount_cents: number; refunded_cents: number; source: string; created_at: string }>(
      'donations', 'id,donor_id,channel,amount_cents,refunded_cents,source,created_at', 'organization_id', orgId, 'id'),
    fetchWhere<{ id: string; channel: string }>('visits', 'id,channel', 'organization_id', orgId, 'id'),
    db.from('reports').select('id,donor_id,reason,created_at').eq('organization_id', orgId).eq('resolved', false).order('created_at', { ascending: false }).limit(200),
  ])
  for (const r of [donorsRes, vitrauxRes, vitrailTotalsRes, donationsRes]) if (r.error) return fail(r.error.message, 500)

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

  return NextResponse.json({
    mode: paymentMode(),
    photoModeration: moderation,
    reports: reportsRes.error ? [] : reportsRes.data ?? [],
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
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return fail('Non autorisé', 403)
  const t = await requireTenant(request)
  if ('response' in t) return t.response
  const orgId = t.tenant.org.id
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
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

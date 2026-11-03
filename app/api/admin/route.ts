import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db'
import { paymentMode } from '@/lib/env'
import { isAdmin } from '@/lib/session'
import { fetchAll, recordDonation } from '@/lib/donations'
import { getPhotoModeration, setPhotoModeration } from '@/lib/settings'
import { removePhotoFile } from '@/lib/photos'
import { hasTestimonialColumns } from '@/lib/schema'
import { defaultColorFor, validateAmountCents, validateColor, validateEmail, validateProfile } from '@/lib/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

// ── Lecture : tout ce que la console affiche ──────────────────────────────────
export async function GET() {
  if (!(await isAdmin())) return fail('Non autorisé', 403)
  const db = getDb()
  const donorCols: string = `id,email,display_name,show_name,message,photo_url,photo_status,color,hidden,created_at${(await hasTestimonialColumns()) ? ',message_status,quote_consent' : ''}`

  const [donorsRes, totalsRes, eventsRes, eventTotalsRes, donationsRes, moderation, channelRows, visitRows, reportsRes] = await Promise.all([
    db.from('donors').select(donorCols).order('created_at', { ascending: false }).limit(1000),
    db.from('donor_totals').select('donor_id,total_cents,last_donation_at').limit(1000),
    db.from('events').select('id,name,starts_on,goal_cents,is_current,created_at').order('created_at', { ascending: false }),
    db.from('event_totals').select('event_id,total_cents,donations_count'),
    db
      .from('donations')
      .select('id,donor_id,event_id,amount_cents,source,channel,created_at,donors(display_name,email,hidden,photo_url,photo_status)')
      .order('created_at', { ascending: false })
      .limit(100),
    getPhotoModeration(),
    fetchAll<{ channel: string | null; amount_cents: number; source: string }>('donations', 'channel,amount_cents,source'),
    fetchAll<{ channel: string }>('visits', 'channel'),
    db.from('reports').select('id,donor_id,reason,created_at').eq('resolved', false).order('created_at', { ascending: false }).limit(200),
  ])
  for (const r of [donorsRes, totalsRes, eventsRes, eventTotalsRes, donationsRes]) if (r.error) return fail(r.error.message, 500)

  // Provenance : visites, dons et montants par emplacement (écran, affiches…)
  const channels = new Map<string, { channel: string; visits: number; donations: number; totalCents: number }>()
  const ch = (name: string | null) => {
    const key = name || 'direct'
    if (!channels.has(key)) channels.set(key, { channel: key, visits: 0, donations: 0, totalCents: 0 })
    return channels.get(key)!
  }
  for (const v of visitRows) ch(v.channel).visits++
  for (const d of channelRows) {
    if (d.source === 'cash' || d.source === 'seed') continue
    const c = ch(d.channel)
    c.donations++
    c.totalCents += d.amount_cents
  }

  const totals = new Map((totalsRes.data ?? []).map(t => [t.donor_id, t]))
  const eventTotals = new Map((eventTotalsRes.data ?? []).map(t => [t.event_id, t]))

  return NextResponse.json({
    mode: paymentMode(),
    photoModeration: moderation,
    reports: reportsRes.error ? [] : reportsRes.data ?? [],
    channels: [...channels.values()].sort((a, b) => b.totalCents - a.totalCents || b.visits - a.visits),
    donors: ((donorsRes.data ?? []) as unknown as ({ id: string } & Record<string, unknown>)[]).map(d => ({
      ...d,
      totalCents: Number(totals.get(d.id)?.total_cents ?? 0),
      lastDonationAt: totals.get(d.id)?.last_donation_at ?? null,
    })),
    events: (eventsRes.data ?? []).map(e => ({
      ...e,
      totalCents: Number(eventTotals.get(e.id)?.total_cents ?? 0),
      donationsCount: Number(eventTotals.get(e.id)?.donations_count ?? 0),
    })),
    donations: donationsRes.data ?? [],
  })
}

// ── Actions ───────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return fail('Non autorisé', 403)
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const db = getDb()
  const str = (v: unknown) => (typeof v === 'string' ? v : '')

  switch (b.action) {
    // Masquer / réafficher un morceau en direct (le total, lui, garde l'argent reçu)
    case 'hideDonor': {
      const { error } = await db.from('donors').update({ hidden: b.hidden === true, updated_at: new Date().toISOString() }).eq('id', str(b.donorId))
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Garder le morceau mais effacer le nom, le message et la photo
    case 'scrubDonor': {
      const { data: before } = await db.from('donors').select('photo_url').eq('id', str(b.donorId)).maybeSingle()
      const { error } = await db
        .from('donors')
        .update({ display_name: 'Anonyme', show_name: false, message: null, photo_url: null, updated_at: new Date().toISOString() })
        .eq('id', str(b.donorId))
      if (!error) await removePhotoFile(before?.photo_url)
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Mode de publication des photos : « live » (tout de suite) ou « moderation » (après approbation)
    case 'setPhotoModeration': {
      await setPhotoModeration(b.mode === 'moderation' ? 'moderation' : 'live')
      return NextResponse.json({ ok: true })
    }

    // Approuver une photo en attente : elle apparaît sur l'écran
    case 'approvePhoto': {
      const { error } = await db.from('donors').update({ photo_status: 'approved', updated_at: new Date().toISOString() }).eq('id', str(b.donorId))
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Témoignage en attente : publié (il apparaît sur l'écran), ou refusé (effacé ; nom et photo restent)
    case 'approveMessage': {
      const { error } = await db.from('donors').update({ message_status: 'approved', updated_at: new Date().toISOString() }).eq('id', str(b.donorId))
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }
    case 'removeMessage': {
      const patch: Record<string, unknown> = { message: null, updated_at: new Date().toISOString() }
      if (await hasTestimonialColumns()) Object.assign(patch, { message_status: 'approved', quote_consent: false })
      const { error } = await db.from('donors').update(patch).eq('id', str(b.donorId))
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Signalement traité (ou sans suite) : il quitte la liste
    case 'resolveReports': {
      const { error } = await db.from('reports').update({ resolved: true }).eq('donor_id', str(b.donorId))
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Retirer seulement la photo (nom et message restent)
    case 'removePhoto': {
      const { data: before } = await db.from('donors').select('photo_url').eq('id', str(b.donorId)).maybeSingle()
      const { error } = await db.from('donors').update({ photo_url: null, photo_status: 'approved', updated_at: new Date().toISOString() }).eq('id', str(b.donorId))
      if (!error) await removePhotoFile(before?.photo_url)
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
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

      const result = await recordDonation({
        email,
        profile: profile.value,
        color: color.ok ? color.value : defaultColorFor(email),
        amountCents: amount.value,
        source,
        providerRef: null,
        eventId: typeof b.eventId === 'string' && b.eventId ? b.eventId : undefined,
      })
      return NextResponse.json({ ok: true, ...result })
    }

    // Courriel mal tapé : on réunit deux morceaux
    case 'mergeDonors': {
      const from = str(b.fromId)
      const into = str(b.intoId)
      if (!from || !into || from === into) return fail('Choisissez deux morceaux différents.')
      const moved = await db.from('donations').update({ donor_id: into }).eq('donor_id', from)
      if (moved.error) return fail(moved.error.message, 500)
      const removed = await db.from('donors').delete().eq('id', from)
      return removed.error ? fail(removed.error.message, 500) : NextResponse.json({ ok: true })
    }

    case 'createEvent': {
      const name = str(b.name).trim()
      if (name.length < 2 || name.length > 80) return fail("Le nom de l'événement doit compter de 2 à 80 caractères.")
      const goal = Math.round(Number(b.goalCents) || 0)
      if (goal < 0) return fail("L'objectif ne peut pas être négatif.")
      if (b.makeCurrent === true) await db.from('events').update({ is_current: false }).eq('is_current', true)
      const { data, error } = await db
        .from('events')
        .insert({ name, goal_cents: goal, starts_on: str(b.startsOn) || null, is_current: b.makeCurrent === true })
        .select('id')
        .single()
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true, id: data.id })
    }

    case 'updateEvent': {
      const patch: Record<string, unknown> = {}
      if (typeof b.name === 'string' && b.name.trim().length >= 2) patch.name = b.name.trim().slice(0, 80)
      if (b.goalCents !== undefined) patch.goal_cents = Math.max(0, Math.round(Number(b.goalCents) || 0))
      if (b.startsOn !== undefined) patch.starts_on = str(b.startsOn) || null
      const { error } = await db.from('events').update(patch).eq('id', str(b.eventId))
      return error ? fail(error.message, 500) : NextResponse.json({ ok: true })
    }

    // Événement en cours (null = aucun)
    case 'setCurrent': {
      const off = await db.from('events').update({ is_current: false }).eq('is_current', true)
      if (off.error) return fail(off.error.message, 500)
      if (b.eventId) {
        const { error } = await db.from('events').update({ is_current: true }).eq('id', str(b.eventId))
        if (error) return fail(error.message, 500)
      }
      return NextResponse.json({ ok: true })
    }

    // Avant l'événement : retirer tout ce qui a été créé en mode démo
    case 'purgeDemo': {
      const del = await db.from('donations').delete().eq('source', 'demo')
      if (del.error) return fail(del.error.message, 500)
      const { data: orphans } = await db.from('donor_totals').select('donor_id').eq('total_cents', 0)
      const ids = (orphans ?? []).map(o => o.donor_id)
      if (ids.length) await db.from('donors').delete().in('id', ids)
      return NextResponse.json({ ok: true, donorsRemoved: ids.length })
    }
  }
  return fail('Action inconnue.')
}

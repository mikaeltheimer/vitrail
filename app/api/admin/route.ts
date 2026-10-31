import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db'
import { paymentMode } from '@/lib/env'
import { isAdmin } from '@/lib/session'
import { recordDonation } from '@/lib/donations'
import { removePhotoFile } from '@/lib/photos'
import { defaultColorFor, validateAmountCents, validateColor, validateEmail, validateProfile } from '@/lib/validate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

// ── Lecture : tout ce que la console affiche ──────────────────────────────────
export async function GET() {
  if (!(await isAdmin())) return fail('Non autorisé', 403)
  const db = getDb()

  const [donorsRes, totalsRes, eventsRes, eventTotalsRes, donationsRes] = await Promise.all([
    db.from('donors').select('id,email,display_name,show_name,message,photo_url,color,hidden,created_at').order('created_at', { ascending: false }).limit(1000),
    db.from('donor_totals').select('donor_id,total_cents,last_donation_at').limit(1000),
    db.from('events').select('id,name,starts_on,goal_cents,is_current,created_at').order('created_at', { ascending: false }),
    db.from('event_totals').select('event_id,total_cents,donations_count'),
    db
      .from('donations')
      .select('id,donor_id,event_id,amount_cents,source,created_at,donors(display_name,email,hidden,photo_url)')
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  for (const r of [donorsRes, totalsRes, eventsRes, eventTotalsRes, donationsRes]) if (r.error) return fail(r.error.message, 500)

  const totals = new Map((totalsRes.data ?? []).map(t => [t.donor_id, t]))
  const eventTotals = new Map((eventTotalsRes.data ?? []).map(t => [t.event_id, t]))

  return NextResponse.json({
    mode: paymentMode(),
    donors: (donorsRes.data ?? []).map(d => ({
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

    // Retirer seulement la photo (nom et message restent)
    case 'removePhoto': {
      const { data: before } = await db.from('donors').select('photo_url').eq('id', str(b.donorId)).maybeSingle()
      const { error } = await db.from('donors').update({ photo_url: null, updated_at: new Date().toISOString() }).eq('id', str(b.donorId))
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

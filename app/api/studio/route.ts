import { studioAccount } from '@/lib/studio'
import { NextRequest, NextResponse, after } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createInvitation, normalizeEmail, tokenHash, CREATE_INVITATION_DAYS } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { sendOrgInvitation } from '@/lib/email'
import { orgUrl, platformUrl } from '@/lib/tenant'
import { WINDOW_DAYS, buildFunnel, buildTodo, orgStats, platformTotals, toStudioOrg, type InvitationLite, type RequestLite } from '@/lib/studio-stats'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Section Studio de la vitrine (comptes is_studio seulement) : demandes d'invitation, invitations à créer un organisme,
// Parcours des organismes et TOTAUX par organisme (lib/studio-stats.ts). JAMAIS de donateur ni de don pris un par un :
// l'accès à une console passe par l'invitation de l'organisme. Seule exception voulue : le nom et le courriel des
// PROPRIÉTAIRES, pour que Studio puisse écrire à son client (relation de service, jamais d'envoi groupé).

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status }) // i18n-ok : section Studio (FR)

const studio = studioAccount

export async function GET(request: NextRequest) {
  const me = await studio(request)
  if (!me) return fail('Réservé à Studio Existence.', 403) // i18n-ok : section Studio (FR)
  const db = getDb()
  const now = Date.now()
  const [reqs, allReqs, invs, orgs, slugs, accounts, owners, stats] = await Promise.all([
    db.from('access_requests').select('id,org_name,name,email,message,locale,source,created_at').is('handled_at', null).order('created_at', { ascending: false }).limit(200),
    db.from('access_requests').select('source,created_at').limit(5000),
    db.from('invitations').select('id,email,org_name,locale,created_at,expires_at,accepted_at,revoked_at').is('organization_id', null).order('created_at', { ascending: false }).limit(500),
    db.from('organizations').select('id,name_fr,status,showcase,stripe_ready,legal,created_at,went_live_at').is('practice_of', null).eq('showcase', false).order('created_at', { ascending: false }).limit(500),
    db.from('organization_slugs').select('slug,organization_id').eq('is_current', true),
    db.from('accounts').select('id,email,name,last_login_at').limit(10000),
    // Contact des propriétaires (relation de service entre Studio et l'organisme, pas des donateurs)
    db.from('memberships').select('organization_id,account_id').eq('role', 'owner').limit(5000),
    orgStats(db, now).then(
      data => ({ data, error: null }),
      (error: { message?: string }) => ({ data: null, error }),
    ),
  ])
  for (const r of [reqs, allReqs, invs, orgs, slugs, accounts, owners, stats]) if (r.error) return fail(r.error.message || 'Erreur.', 500) // i18n-ok : section Studio (FR)
  const accountById = new Map((accounts.data ?? []).map(a => [a.id as string, { email: a.email as string, name: (a.name as string) || '' }]))
  const ownersOf = new Map<string, { email: string; name: string }[]>()
  for (const m of owners.data ?? []) {
    const a = accountById.get(m.account_id as string)
    if (a) ownersOf.set(m.organization_id as string, [...(ownersOf.get(m.organization_id as string) ?? []), a])
  }
  const slugOf = new Map((slugs.data ?? []).map(s => [s.organization_id as string, s.slug as string]))
  const invitations: (InvitationLite & { createdAt: string })[] = (invs.data ?? []).map(i => ({
    id: i.id as string,
    email: i.email as string,
    orgName: i.org_name as string | null,
    createdAt: i.created_at as string,
    expiresAt: i.expires_at as string,
    state: i.accepted_at ? 'accepted' : i.revoked_at ? 'revoked' : new Date(i.expires_at as string).getTime() <= now ? 'expired' : 'pending',
  }))
  const organizations = (orgs.data ?? []).map(o => {
    const slug = slugOf.get(o.id as string) ?? ''
    const org = toStudioOrg(o, slug, stats.data?.get(o.id as string))
    return {
      ...org,
      owners: ownersOf.get(o.id as string) ?? [],
      links: slug ? { vitrail: orgUrl(slug, '/vitrail', request), ecran: orgUrl(slug, '/ecran', request), affiche: orgUrl(slug, '/affiche', request) } : null,
    }
  })
  const since = now - WINDOW_DAYS * 86_400_000
  const logins = (accounts.data ?? []).map(a => a.last_login_at as string | null)
  return NextResponse.json({
    me: { email: me.email, name: me.name },
    requests: reqs.data ?? [],
    invitations,
    organizations,
    todo: buildTodo((reqs.data ?? []) as RequestLite[], invitations, organizations, now),
    totals: platformTotals(organizations),
    funnel: buildFunnel((allReqs.data ?? []) as { source: string | null; created_at: string }[], invitations.map(i => ({ created_at: i.createdAt })), organizations, now),
    accounts: { total: logins.length, active: logins.filter(d => !!d && new Date(d).getTime() > since).length },
    windowDays: WINDOW_DAYS,
  })
}

export async function POST(request: NextRequest) {
  const me = await studio(request)
  if (!me) return fail('Réservé à Studio Existence.', 403) // i18n-ok : section Studio (FR)
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const db = getDb()
  const base = platformUrl(request)
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

  switch (b.action) {
    case 'invite': {
      const email = normalizeEmail(b.email)
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Courriel invalide.') // i18n-ok : section Studio (FR)
      const locale = b.locale === 'en' ? 'en' : 'fr'
      const orgName = str(b.orgName, 120) || null
      const message = str(b.message, 1000) || null
      const inv = await createInvitation({ email, organizationId: null, role: 'owner', invitedBy: me.id, orgName, message, locale })
      const requestId = str(b.requestId, 64)
      if (requestId) await db.from('access_requests').update({ handled_at: new Date().toISOString(), outcome: 'invited', invitation_id: inv.id }).eq('id', requestId)
      after(async () => {
        try {
          await sendOrgInvitation({ to: email, token: inv.token, locale, orgName, message, baseUrl: base })
        } catch (e) {
          console.error('Invitation non envoyée :', e)
        }
      })
      return NextResponse.json({ ok: true })
    }

    // Renvoyer : nouveau lien (l'ancien cesse de fonctionner), 14 jours de plus
    case 'resend': {
      const { data: inv } = await db.from('invitations').select('id,email,org_name,message,locale,accepted_at').eq('id', str(b.invitationId, 64)).is('organization_id', null).maybeSingle()
      if (!inv || inv.accepted_at) return fail('Invitation introuvable ou déjà acceptée.') // i18n-ok : section Studio (FR)
      const token = randomBytes(32).toString('base64url')
      const now = Date.now()
      await db
        .from('invitations')
        .update({ token_hash: tokenHash(token), revoked_at: null, created_at: new Date(now).toISOString(), expires_at: new Date(now + CREATE_INVITATION_DAYS * 86_400_000).toISOString() })
        .eq('id', inv.id)
      after(async () => {
        try {
          await sendOrgInvitation({ to: inv.email as string, token, locale: inv.locale === 'en' ? 'en' : 'fr', orgName: inv.org_name as string | null, message: inv.message as string | null, baseUrl: base })
        } catch (e) {
          console.error('Invitation non renvoyée :', e)
        }
      })
      return NextResponse.json({ ok: true })
    }

    case 'revoke': {
      await db.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('id', str(b.invitationId, 64)).is('organization_id', null).is('accepted_at', null)
      return NextResponse.json({ ok: true })
    }

    case 'archive': {
      await db.from('access_requests').update({ handled_at: new Date().toISOString(), outcome: 'archived' }).eq('id', str(b.requestId, 64))
      return NextResponse.json({ ok: true })
    }
  }
  return fail('Action inconnue.') // i18n-ok : section Studio (FR)
}

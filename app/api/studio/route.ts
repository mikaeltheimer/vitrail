import { studioAccount } from '@/lib/studio'
import { NextRequest, NextResponse, after } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createInvitation, normalizeEmail, tokenHash, CREATE_INVITATION_DAYS } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { sendOrgInvitation } from '@/lib/email'
import { platformUrl } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Section Studio de la vitrine (comptes is_studio seulement) : demandes d'invitation, invitations à créer un organisme,
// liste des organismes et de leur état. JAMAIS de donateurs ni de dons : l'accès à une console passe par l'organisme.

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status }) // i18n-ok : section Studio (FR)

const studio = studioAccount

export async function GET(request: NextRequest) {
  const me = await studio(request)
  if (!me) return fail('Réservé à Studio Existence.', 403) // i18n-ok : section Studio (FR)
  const db = getDb()
  const [reqs, invs, orgs, slugs] = await Promise.all([
    db.from('access_requests').select('id,org_name,name,email,message,locale,created_at').is('handled_at', null).order('created_at', { ascending: false }).limit(200),
    db.from('invitations').select('id,email,org_name,locale,created_at,expires_at,accepted_at,revoked_at').is('organization_id', null).order('created_at', { ascending: false }).limit(200),
    db.from('organizations').select('id,name_fr,status,showcase,stripe_ready,created_at,terms_accepted_by').is('practice_of', null).order('created_at', { ascending: false }).limit(500),
    db.from('organization_slugs').select('slug,organization_id').eq('is_current', true),
  ])
  for (const r of [reqs, invs, orgs, slugs]) if (r.error) return fail(r.error.message, 500)
  const slugOf = new Map((slugs.data ?? []).map(s => [s.organization_id as string, s.slug as string]))
  const now = Date.now()
  return NextResponse.json({
    me: { email: me.email, name: me.name },
    requests: reqs.data ?? [],
    invitations: (invs.data ?? []).map(i => ({
      id: i.id,
      email: i.email,
      orgName: i.org_name,
      createdAt: i.created_at,
      expiresAt: i.expires_at,
      state: i.accepted_at ? 'accepted' : i.revoked_at ? 'revoked' : new Date(i.expires_at as string).getTime() <= now ? 'expired' : 'pending',
    })),
    organizations: (orgs.data ?? []).map(o => ({
      id: o.id,
      name: o.name_fr,
      slug: slugOf.get(o.id as string) ?? '',
      status: o.status,
      showcase: !!o.showcase,
      stripeReady: o.stripe_ready,
      createdAt: o.created_at,
    })),
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

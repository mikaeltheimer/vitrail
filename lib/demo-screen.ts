import { getDb } from './db'
import { err } from './errors'
import { DEMO_TEXTS } from './demo-data'
import { QUESTION_FIELDS } from './identity-shared'
import { cleanQuestion, validateAmountCents, validateColor, validateMessage, validateName, type Result } from './validate'
import { SCREEN_CODE_RE, type ScreenPiece } from './demoPieces'

// Écran jumelé de la démonstration (migration 2026-11-26) : un don d'essai fait par le QR d'un écran de la démo est
// gardé ici quelques heures, et seul cet écran (son code de séance) l'affiche. Jamais pour un vrai organisme.
// Rien ne rattache un morceau à une personne : ni courriel, ni compte, ni adresse IP.

/** Durée d'affichage d'un morceau sur l'écran. */
export const SCREEN_TTL_MS = 12 * 60 * 60 * 1000
/** Au-delà, la ligne est effacée (à chaque nouvel envoi). */
export const SCREEN_PURGE_MS = 24 * 60 * 60 * 1000
export const SCREEN_MAX_PIECES = 60
/** Photo : la data URL d'un JPEG carré de lib/photoClient (650 ko au plus, environ 870 000 caractères en base64). */
export const SCREEN_PHOTO_MAX = 1_000_000
const PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/

const TABLE = 'demo_screen_pieces'

export interface ScreenPieceInput {
  name: string | null
  message: string | null
  question: string | null
  color: string
  amountCents: number
  photo: string | null
}

/** Les questions de la démo, dans ses deux langues : la seule question acceptée avec un témoignage. */
function demoQuestions(): string[] {
  return (['fr', 'en'] as const).flatMap(l => QUESTION_FIELDS.map(f => (DEMO_TEXTS[l]?.[f] ?? '').trim()).filter(Boolean))
}

export const isScreenCode = (code: unknown): code is string => typeof code === 'string' && SCREEN_CODE_RE.test(code)

/** Mêmes règles que les vrais dons pour le nom, le témoignage, la couleur et le montant. */
export function validateScreenPiece(input: unknown): Result<ScreenPieceInput> {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  let name: string | null = null
  if (b.name != null && b.name !== '') {
    const n = validateName(b.name)
    if (!n.ok) return n
    name = n.value
  }
  const message = validateMessage(b.message)
  if (!message.ok) return message
  const color = validateColor(b.color)
  if (!color.ok) return color
  const amount = validateAmountCents(b.amountCents)
  if (!amount.ok) return amount
  let photo: string | null = null
  if (b.photo != null && b.photo !== '') {
    if (typeof b.photo !== 'string' || b.photo.length > SCREEN_PHOTO_MAX || !PHOTO_RE.test(b.photo)) return { ok: false, error: err('impossibleIci') }
    photo = b.photo
  }
  const question = message.value ? cleanQuestion(b.question, demoQuestions()) : null
  return { ok: true, value: { name, message: message.value, question, color: color.value, amountCents: amount.value, photo } }
}

const since = (now: number, ms: number) => new Date(now - ms).toISOString()

/** Ajoute un morceau à la séance ; 'plein' au-delà de SCREEN_MAX_PIECES morceaux encore affichés. */
export async function addScreenPiece(orgId: string, code: string, piece: ScreenPieceInput, now = Date.now()): Promise<'ok' | 'plein'> {
  const db = getDb()
  // Ménage : rien ne reste plus d'un jour (toutes séances confondues)
  const purge = await db.from(TABLE).delete().lte('created_at', since(now, SCREEN_PURGE_MS))
  if (purge.error) throw purge.error
  const { data: current, error } = await db.from(TABLE).select('id').eq('organization_id', orgId).eq('screen_code', code).gte('created_at', since(now, SCREEN_TTL_MS))
  if (error) throw error
  if ((current ?? []).length >= SCREEN_MAX_PIECES) return 'plein'
  const ins = await db.from(TABLE).insert({
    organization_id: orgId,
    screen_code: code,
    name: piece.name,
    message: piece.message,
    question: piece.question,
    color: piece.color,
    amount_cents: piece.amountCents,
    photo: piece.photo,
    has_photo: !!piece.photo,
    created_at: new Date(now).toISOString(),
  })
  if (ins.error) throw ins.error
  return 'ok'
}

interface Row {
  id: string
  name: string | null
  message: string | null
  question: string | null
  color: string
  amount_cents: number
  has_photo: boolean
  created_at: string
}

/** Les morceaux encore affichés de la séance, du plus ancien au plus récent (sans les photos, servies à part). */
export async function screenPieces(orgId: string, code: string, now = Date.now()): Promise<ScreenPiece[]> {
  const { data, error } = await getDb()
    .from(TABLE)
    .select('id,name,message,question,color,amount_cents,has_photo,created_at')
    .eq('organization_id', orgId)
    .eq('screen_code', code)
    .gte('created_at', since(now, SCREEN_TTL_MS))
    .order('created_at')
    .limit(SCREEN_MAX_PIECES)
  if (error) throw error
  return ((data ?? []) as Row[]).map(r => ({
    id: `ecran-${r.id}`,
    name: r.name,
    message: r.message,
    question: r.question,
    color: r.color,
    amountCents: r.amount_cents,
    photoUrl: r.has_photo ? `/api/demo/ecran?code=${code}&photo=${encodeURIComponent(r.id)}` : null,
    at: r.created_at,
  }))
}

/** La photo d'un morceau de la séance (data URL), ou null. */
export async function screenPhoto(orgId: string, code: string, id: string, now = Date.now()): Promise<string | null> {
  const { data, error } = await getDb()
    .from(TABLE)
    .select('photo')
    .eq('organization_id', orgId)
    .eq('screen_code', code)
    .eq('id', id)
    .gte('created_at', since(now, SCREEN_TTL_MS))
    .maybeSingle()
  if (error) throw error
  return (data as { photo: string | null } | null)?.photo ?? null
}

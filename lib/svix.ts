import { createHmac, timingSafeEqual } from 'node:crypto'

// Vérification de la signature d'un webhook Svix (le format qu'utilise Resend), sans dépendance :
// signature = base64(HMAC-SHA256(secret, `${svix-id}.${svix-timestamp}.${corps}`)), avec un secret « whsec_… » en base64.
// L'en-tête svix-signature peut porter plusieurs signatures (« v1,xxx v1,yyy ») pendant le changement d'un secret.

const TOLERANCE_S = 5 * 60

export function verifySvix(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_S) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest()
  return signature.split(' ').some(part => {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) return false
    const given = Buffer.from(value, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

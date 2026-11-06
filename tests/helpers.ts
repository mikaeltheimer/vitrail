import Module from 'node:module'
import path from 'node:path'
import { fakeDb } from './fake-db'

// Remplace ./db et @/lib/db par la base factice, avant tout import du code de l'application.
const root = path.resolve(__dirname, '..')
const original = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load
;(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (request: unknown, ...rest: unknown[]) {
  if (request === './db' || request === '@/lib/db' || (typeof request === 'string' && request.endsWith('/lib/db'))) return { getDb: () => fakeDb }
  if (typeof request === 'string' && request.startsWith('@/')) return original.call(this, path.join(root, request.slice(2)), ...rest)
  return original.call(this, request, ...rest)
}

let failures = 0
export function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.log(`  ✗ ${name}`, detail ?? '') }
}
export const done = () => { if (failures) { console.log(`\n${failures} échec(s)`); process.exit(1) } console.log('\ntout passe') }

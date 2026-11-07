#!/usr/bin/env node
// Contrôle des langues (voir docs/i18n.md).
//  1. Parité : messages/fr.json et messages/en.json ont les mêmes clés, les mêmes {variables} et les mêmes <balises>, sans valeur vide.
//     Échec = code de sortie 1.
//  2. Français laissé en dur dans le code (heuristique : chaînes et texte JSX avec accents ou mots courants, hors commentaires).
//     Affiché à titre d'avancement ; avec --strict, un reste fait échouer le contrôle.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = process.cwd()
const strict = process.argv.includes('--strict')

// Hors champ (voir docs/i18n.md) : console d'administration, affiches (prototype), liste de mots grossiers, outil de calibrage réservé au développement,
// lib/config.ts (textes de l'organisme : le français est la langue source, à côté de l'anglais ; ils passent en base à l'étape 3).
// Lignes ignorées : journaux pour l'exploitant (console.*), erreurs internes (new Error), et toute ligne marquée « i18n-ok » (avec la raison).
// lib/auth.ts : messages de connexion de la console (FR), qui entrent dans le périmètre avec la console reconstruite (étape 7).
// app/studio, components/studio, app/api/studio : section interne de Studio Existence, en français seulement.
const EXCLUDED = ['app/admin/', 'app/api/admin/', 'lib/auth.ts', 'app/studio/', 'components/studio/', 'app/api/studio/', 'app/affiche/', 'lib/config.ts', 'lib/profanity.ts', 'components/ScaleBadge.tsx', 'messages/', 'scripts/', 'node_modules/', '.next/']

let failed = false
const fail = msg => {
  failed = true
  console.error(`✗ ${msg}`)
}

// ── 1. Parité ──────────────────────────────────────────────────────────────
function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out.set(key, String(v))
  }
  return out
}
const placeholders = s => new Set([...s.matchAll(/\{\s*([A-Za-z_]\w*)/g)].map(m => `{${m[1]}}`))
const tags = s => new Set([...s.matchAll(/<\/?([a-z][\w]*)>/g)].map(m => `<${m[1]}>`))
const same = (a, b) => a.size === b.size && [...a].every(x => b.has(x))

const fr = flatten(JSON.parse(readFileSync(join(root, 'messages/fr.json'), 'utf8')))
const en = flatten(JSON.parse(readFileSync(join(root, 'messages/en.json'), 'utf8')))

for (const key of fr.keys()) if (!en.has(key)) fail(`clé absente de en.json : ${key}`)
for (const key of en.keys()) if (!fr.has(key)) fail(`clé absente de fr.json : ${key}`)
for (const [key, value] of fr) {
  const other = en.get(key)
  if (other === undefined) continue
  if (!value.trim()) fail(`valeur vide (fr) : ${key}`)
  if (!other.trim()) fail(`valeur vide (en) : ${key}`)
  if (!same(placeholders(value), placeholders(other))) fail(`variables différentes : ${key}  fr=${[...placeholders(value)].join(' ')}  en=${[...placeholders(other)].join(' ')}`)
  if (!same(tags(value), tags(other))) fail(`balises différentes : ${key}  fr=${[...tags(value)].join(' ')}  en=${[...tags(other)].join(' ')}`)
}
if (!failed) console.log(`✓ parité fr/en : ${fr.size} messages`)

// ── 2. Français laissé en dur ──────────────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const rel = relative(root, full).split(sep).join('/')
    if (EXCLUDED.some(e => (e.endsWith('/') ? `${rel}/`.startsWith(e) : rel === e))) continue
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push({ full, rel })
  }
  return out
}

const ACCENT = /[àâäçéèêëîïôöùûüÿœÀÂÇÉÈÊËÎÏÔÙÛÜŒ]/
const WORDS = /\b(Merci|Donner|donner|Votre|votre|Vous|vous|Anonyme|Retour|Annuler|Fermer)\b/
const french = s => ACCENT.test(s) || WORDS.test(s)

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

const found = []
for (const { full, rel } of [...walk(join(root, 'app')), ...walk(join(root, 'components')), ...walk(join(root, 'lib')), ...walk(join(root, 'i18n'))]) {
  const raw = readFileSync(full, 'utf8')
  const skip = new Set(raw.split('\n').flatMap((l, i) => (/console\.|new Error\(|i18n-ok/.test(l) ? [i] : [])))
  const code = stripComments(raw)
    .split('\n')
    .map((l, i) => (skip.has(i) ? '' : l))
    .join('\n')
  let count = 0
  for (const m of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g)) if (french(m[2])) count++
  for (const m of code.matchAll(/>([^<>{}]+)</g)) if (french(m[1])) count++
  if (count) found.push({ rel, count })
}
found.sort((a, b) => b.count - a.count)
const total = found.reduce((n, f) => n + f.count, 0)
if (found.length) {
  console.log(`${strict ? '✗' : '·'} français en dur : ${total} occurrences dans ${found.length} fichiers (heuristique)`)
  for (const f of found) console.log(`    ${String(f.count).padStart(4)}  ${f.rel}`)
  if (strict) failed = true
} else {
  console.log('✓ aucun français en dur hors périmètre exclu')
}

process.exit(failed ? 1 : 0)

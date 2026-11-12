// Captures fixes de la console pour le tiroir des outils de la démo (/vitrail de l'organisme « showcase ») :
// public/demo/console-{accueil,moderation}-{fr,en}.png, au format téléphone (390 × 844, densité 2).
//
// La VRAIE console (components/console), rendue par `next dev` avec des données FICTIVES : celles de la démo
// (demo-fixtures.ts), servies à la place de /api/admin et /api/vitrail. Aucune base n'est lue, aucune vraie donnée.
//
// À relancer après tout changement visible de la console :  npm run captures:console
// (Chromium de Playwright requis : npx playwright install chromium)
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { demoConsoleData, demoSnapshot } from './demo-fixtures'

// Playwright n'est pas une dépendance du dépôt (outil de poste) : chargé à l'exécution, avec le peu de types utilisé ici
type Route = { fulfill: (r: { json: unknown }) => Promise<void> }
type Page = {
  route: (url: string, handler: (route: Route) => unknown) => Promise<void>
  goto: (url: string, o?: { waitUntil?: string }) => Promise<unknown>
  waitForSelector: (s: string, o?: { timeout?: number }) => Promise<unknown>
  addStyleTag: (o: { content: string }) => Promise<unknown>
  waitForTimeout: (ms: number) => Promise<void>
  screenshot: (o: { path: string }) => Promise<unknown>
}
type Browser = { newContext: (o: Record<string, unknown>) => Promise<{ newPage: () => Promise<Page>; close: () => Promise<void> }>; close: () => Promise<void> }
const { chromium } = createRequire(__filename)('playwright') as { chromium: { launch: () => Promise<Browser> } }

const ROOT = path.resolve(__dirname, '../..')
const PORT = Number(process.env.CAPTURE_PORT || 3199)
const ROUTE = '/essai-captures-console' // pas de « _ » en tête : Next traite ces dossiers comme privés
const PAGE_DIR = path.join(ROOT, 'app', ROUTE.slice(1))
const OUT = path.join(ROOT, 'public', 'demo')
const AGENTS = path.join(ROOT, 'AGENTS.md')

async function waitFor(url: string, ms = 120_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      const r = await fetch(url)
      if (r.status < 500) return
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Le serveur ne répond pas : ${url}`)
}

async function main() {
  const hadAgents = existsSync(AGENTS)
  mkdirSync(PAGE_DIR, { recursive: true })
  copyFileSync(path.join(__dirname, 'harness-page.tsx'), path.join(PAGE_DIR, 'page.tsx'))
  mkdirSync(OUT, { recursive: true })
  let server: ChildProcess | null = null
  try {
    // Pas de base, pas de Stripe, pas de courriel : la page d'essai n'en a pas besoin
    server = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
      cwd: ROOT,
      env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RESEND_API_KEY: '', STRIPE_SECRET_KEY: '', NEXT_TELEMETRY_DISABLED: '1' },
      stdio: 'ignore',
      detached: true,
    })
    const base = `http://localhost:${PORT}`
    await waitFor(`${base}${ROUTE}`)

    const browser = await chromium.launch()
    for (const locale of ['fr', 'en'] as const) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: locale === 'fr' ? 'fr-CA' : 'en-CA' })
      const page = await context.newPage()
      await page.route('**/api/admin', route => route.fulfill({ json: demoConsoleData(locale) }))
      await page.route('**/api/vitrail*', route => route.fulfill({ json: demoSnapshot() }))
      for (const tab of ['accueil', 'moderation'] as const) {
        await page.goto(`${base}${ROUTE}?lang=${locale}${tab === 'accueil' ? '' : `#${tab}`}`, { waitUntil: 'networkidle' })
        await page.waitForSelector('main .card', { timeout: 60_000 })
        // Le badge de développement de Next n'a rien à faire sur une capture
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
        await page.waitForTimeout(800)
        const file = path.join(OUT, `console-${tab}-${locale}.png`)
        await page.screenshot({ path: file })
        console.log(`✓ ${path.relative(ROOT, file)}`)
      }
      await context.close()
    }
    await browser.close()
  } finally {
    if (server?.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM')
      } catch {}
    }
    rmSync(PAGE_DIR, { recursive: true, force: true })
    if (!hadAgents) rmSync(AGENTS, { force: true })
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

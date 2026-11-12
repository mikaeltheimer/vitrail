// Page d'essai TEMPORAIRE : capture.ts la copie dans app/ le temps des captures, puis la retire. Jamais commitée dans app/.
// La vraie console, sans session ni base : ses données (GET /api/admin, /api/vitrail) sont simulées par Playwright.
import Console from '@/components/console/Console'

export default function CapturesConsole() {
  return <Console />
}

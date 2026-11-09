'use client'

// Erreur dans le gabarit racine lui-même : plus de traductions ni d'identité, donc une page autonome, dans les deux langues.
// Garder les styles en ligne : globals.css n'est pas garanti ici.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const p: React.CSSProperties = { margin: '8px 0 0', color: 'rgba(244,239,230,0.7)', fontSize: 15, lineHeight: 1.5 }
  return (
    <html lang="fr-CA">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#0B0A12', color: '#F4EFE6', fontFamily: 'system-ui, -apple-system, sans-serif', padding: 16 }}>
        <main style={{ maxWidth: 400, width: '100%', background: '#14121D', border: '1px solid rgba(244,239,230,0.12)', borderRadius: 20, padding: 28 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Une erreur est survenue</h1>
          <p style={p}>La page n’a pas pu s’afficher. Réessayez dans un instant.</p>
          <h2 lang="en-CA" style={{ margin: '20px 0 0', fontSize: 20 }}>Something went wrong</h2>
          <p lang="en-CA" style={p}>The page couldn’t be displayed. Please try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 20, width: '100%', padding: '12px 16px', borderRadius: 999, border: 0, background: '#F0B24A', color: '#1A1208', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
            Réessayer · <span lang="en-CA">Try again</span>
          </button>
          {error.digest && <p style={{ ...p, fontSize: 12 }}>{error.digest}</p>}
        </main>
      </body>
    </html>
  )
}

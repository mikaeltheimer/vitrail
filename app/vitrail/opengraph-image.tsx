import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { CONFIG } from '@/lib/config'
import { getSnapshot } from '@/lib/donations'
import { formatMoney } from '@/lib/format'

// Image d'aperçu des liens partagés (Facebook, messageries) : le logo de l'école, l'appel et le total amassé.
export const runtime = 'nodejs'
export const revalidate = 300
export const alt = `${CONFIG.appName} — ${CONFIG.orgName}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage() {
  const logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), 'public', 'ecole-logo.png'))).toString('base64')}`
  let total = ''
  let donors = 0
  try {
    const s = await getSnapshot()
    total = formatMoney(s.totalCents)
    donors = s.pieces.length
  } catch {}
  const colors = ['#f472b6', '#d946ef', '#7c3aed', '#60a5fa', '#22d3ee', '#16a34a', '#a3e635', '#facc15', '#fb923c', '#f87171']
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#07060b', color: '#fff', padding: 64, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
          <img src={logo} width={360} height={89} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, color: '#fbbf24', letterSpacing: 4, textTransform: 'uppercase' }}>Faites partie du vitrail</div>
            <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05, marginTop: 12, maxWidth: 620 }}>Chaque don devient un morceau de verre</div>
          </div>
          <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.75)' }}>{total ? `${total} amassés · ${donors} donateurs` : CONFIG.orgName}</div>
        </div>
        <div style={{ width: 440, height: 440, alignSelf: 'center', borderRadius: 999, border: '10px solid #050408', display: 'flex', flexWrap: 'wrap', overflow: 'hidden' }}>
          {Array.from({ length: 30 }, (_, i) => (
            <div key={i} style={{ width: i % 7 === 0 ? 168 : 84, height: 84, background: colors[(i * 7) % colors.length], border: '4px solid #050408' }} />
          ))}
        </div>
      </div>
    ),
    size,
  )
}

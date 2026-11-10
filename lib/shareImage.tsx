/* eslint-disable @next/next/no-img-element -- images en données dans une image générée (pas de page) */
// Image de partage (1200 × 630) : la vitrine de Donivers ou le vitrail d'un organisme. Fond nuit, le vrai vitrail à
// droite (même pavage que la page), textes en Fraunces et DM Sans. Organisme : son logo ou son nom d'abord, l'appel,
// le total ; Donivers signe en bas (« propulsé par » + logo), plus petit que l'organisme.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { vitrailSvg, type SvgPiece } from './glassSvg'

const W = 1200
const H = 630
const NIGHT = '#0B0A12'
const CREAM = '#F4EFE6'
const AMBER = '#F0B24A'

type Font = { name: string; data: Buffer; weight: 400 | 500 | 700; style: 'normal' | 'italic' }
let fontsCache: Promise<Font[]> | null = null
// Fichiers inclus explicitement (outputFileTracingIncludes, next.config.ts) : pas de traçage automatique, qui inclurait tout le projet
const asset = (...p: string[]) => readFile(path.join(/* turbopackIgnore: true */ process.cwd(), ...p))

/** Polices (assets/fonts) : latin, puis latin étendu en secours pour les noms d'organismes. */
function fonts(): Promise<Font[]> {
  fontsCache ??= Promise.all(
    (
      [
        ['Fraunces', 'fraunces-latin-500-normal.woff', 500, 'normal'],
        ['Fraunces', 'fraunces-latin-ext-500-normal.woff', 500, 'normal'],
        // Nom à part : sinon le moteur prend l'italique (poids 400) pour tout texte en Fraunces sans poids précisé
        ['Fraunces Italic', 'fraunces-latin-400-italic.woff', 400, 'italic'],
        ['DM Sans', 'dm-sans-latin-400-normal.woff', 400, 'normal'],
        ['DM Sans', 'dm-sans-latin-ext-400-normal.woff', 400, 'normal'],
        ['DM Sans', 'dm-sans-latin-700-normal.woff', 700, 'normal'],
        ['DM Sans', 'dm-sans-latin-ext-700-normal.woff', 700, 'normal'],
      ] as const
    ).map(async ([name, file, weight, style]) => ({ name, data: await asset('assets', 'fonts', file), weight, style })),
  ).catch(e => {
    fontsCache = null
    throw e
  })
  return fontsCache
}

const svgData = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
/** Logo de Donivers (public/brand), en données ; null s'il manque. */
async function brandFile(file: string): Promise<{ src: string; ratio: number } | null> {
  try {
    const svg = (await asset('public', 'brand', file)).toString()
    const [, , w, h] = (svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 1 1').split(/\s+/).map(Number)
    return { src: svgData(svg), ratio: w / h }
  } catch {
    return null
  }
}

/** Vitrail d'attente (aucun don encore) : 24 morceaux égaux, graine tirée du nom ; affiché voilé. */
function waiting(seed: string): SvgPiece[] {
  const colors = ['#F0B24A', '#1FA978', '#5CC0F5', '#9450CC', '#F59AC5']
  return Array.from({ length: 24 }, (_, i) => ({ id: `${seed}-${i}`, color: colors[i % 5], amountCents: 2500 }))
}

/**
 * Le disque de droite : le vrai vitrail. Organisme sans don : un vitrail d'attente voilé (pas le symbole de Donivers,
 * qui prendrait la place de l'organisme). Vitrine sans démo : le symbole. Halo chaud derrière.
 */
async function Disc({ pieces, size, waitingFor }: { pieces: SvgPiece[]; size: number; waitingFor: string | null }) {
  const empty = pieces.length === 0
  // Le disque en haut à droite ; ses rayons tombent jusqu'au bas de l'image et s'évasent (sous le texte à gauche)
  const top = 30
  const padX = 320
  const padBottom = H - top - size
  const svg = vitrailSvg(empty && waitingFor ? waiting(waitingFor) : pieces, size, { rays: true, padX, padBottom })
  const symbol = svg ? null : await brandFile('donivers-symbole.svg')
  const veiled = empty && !!svg
  return (
    <div style={{ position: 'absolute', right: 56 - padX, top, width: size + 2 * padX, height: size + padBottom, display: 'flex' }}>
      <div
        style={{
          position: 'absolute',
          left: padX - 60,
          top: -60,
          width: size + 120,
          height: size + 120,
          borderRadius: 9999,
          backgroundImage: 'radial-gradient(circle, rgba(255,226,168,0.20) 0%, rgba(240,178,74,0.08) 45%, rgba(11,10,18,0) 70%)',
        }}
      />
      {svg ? (
        <img src={svgData(svg)} width={size + 2 * padX} height={size + padBottom} alt="" style={{ opacity: veiled ? 0.32 : 1 }} />
      ) : (
        symbol && <img src={symbol.src} width={size * 0.92} height={size * 0.92} alt="" style={{ marginLeft: padX + size * 0.04, marginTop: size * 0.04 }} />
      )}
    </div>
  )
}

export interface OrgShare {
  kind: 'org'
  name: string
  logo: { src: string; w: number; h: number } | null
  surtitre: string
  titre: string
  total: string
  poweredBy: string
  pieces: SvgPiece[]
}
export interface PlatformShare {
  kind: 'platform'
  titre: string
  descriptor: string
  slogan: string
  host: string
  pieces: SvgPiece[]
}

const HEADERS = { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600' }

export async function shareImage(p: OrgShare | PlatformShare): Promise<ImageResponse> {
  const [fontList, small, full] = await Promise.all([fonts(), brandFile('donivers-logo-creme-petit.svg'), brandFile('donivers-logo-creme.svg')])
  const disc = await Disc({ pieces: p.pieces, size: 470, waitingFor: p.kind === 'org' ? p.name : null })
  const column = { position: 'absolute' as const, left: 72, top: 64, bottom: 60, width: 520, display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-between' }

  const content =
    p.kind === 'org' ? (
      <div style={column}>
        {p.logo ? <img src={p.logo.src} width={p.logo.w} height={p.logo.h} alt="" /> : <div style={{ fontFamily: 'Fraunces', fontSize: 46, lineHeight: 1.1, maxWidth: 540 }}>{p.name}</div>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: AMBER, letterSpacing: 4, textTransform: 'uppercase' }}>{p.surtitre}</div>
          <div style={{ fontFamily: 'Fraunces', fontSize: 62, lineHeight: 1.06, marginTop: 14 }}>{p.titre}</div>
          {p.total && <div style={{ fontSize: 28, color: 'rgba(244,239,230,0.78)', marginTop: 22 }}>{p.total}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(244,239,230,0.6)', fontSize: 20 }}>
          <span>{p.poweredBy}</span>
          {small && <img src={small.src} height={28} width={Math.round(28 * small.ratio)} alt="" />}
        </div>
      </div>
    ) : (
      <div style={column}>
        {full ? <img src={full.src} height={64} width={Math.round(64 * full.ratio)} alt="" /> : <div style={{ fontFamily: 'Fraunces', fontSize: 48 }}>donivers</div>}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'Fraunces', fontSize: 70, lineHeight: 1.04 }}>{p.titre}</div>
          <div style={{ fontSize: 28, color: 'rgba(244,239,230,0.78)', marginTop: 22, lineHeight: 1.3 }}>{p.descriptor}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, fontSize: 22 }}>
          <span style={{ fontWeight: 700, color: AMBER }}>{p.host}</span>
          <span style={{ fontFamily: 'Fraunces Italic', fontStyle: 'italic', fontWeight: 400, color: 'rgba(244,239,230,0.6)' }}>{p.slogan}</span>
        </div>
      </div>
    )

  return new ImageResponse(
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: NIGHT, color: CREAM, fontFamily: 'DM Sans' }}>
      {disc}
      {content}
    </div>,
    { width: W, height: H, fonts: fontList, headers: HEADERS },
  )
}

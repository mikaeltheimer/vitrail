# Génère le logo de Donivers (fichiers SVG et PNG dans public/brand/).
#
# Symbole : un disque de verre découpé comme le vrai vitrail (coupes droites en T, jamais vers le centre : il ne doit
# pas ressembler à un camembert), dans les cinq verres de la palette et la lueur, plomb nuit. Version « petite »
# (4 pièces, plomb épais) pour 32 px et moins. Découpage déterministe : graine 7 (« équilibré », choisi le 9 nov. 2026).
# Mot : « donivers » en Fraunces vectorisée (opsz 144, wght 520, SOFT 100, WONK 0) ; un éclat d'ambre remplace le point
# du i, à la place et à l'écart exacts du point d'origine (détaché de la lettre).
#
# Prérequis (hors dépendances du projet) :
#   npm i --prefix /tmp/fraunces @fontsource-variable/fraunces
#   pip install fonttools brotli cairosvg
# Usage : python3 scripts/logo.py /tmp/fraunces/node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2
import math, random, sys, pathlib
import cairosvg
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'brand'
NIGHT, CREAM, INK, AMBRE = '#0B0A12', '#F4EFE6', '#1A1720', '#F0B24A'
GL = {'ambre': '#F0B24A', 'jade': '#1FA978', 'ciel': '#5CC0F5', 'violet': '#9450CC', 'rose': '#F59AC5', 'glow': '#FFE2A8'}
AXES = {'opsz': 144, 'wght': 520, 'SOFT': 100, 'WONK': 0}

# ── Symbole ─────────────────────────────────────────────────────────────────────
def cut(p, nx, ny, c):
    A, B = [], []
    for i in range(len(p)):
        a, b = p[i], p[(i + 1) % len(p)]
        da, db = a[0] * nx + a[1] * ny - c, b[0] * nx + b[1] * ny - c
        (A if da <= 0 else B).append(a)
        if da * db < 0:
            t = da / (da - db); q = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])); A.append(q); B.append(q)
    return A, B
def area(p): return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2
def cen(p): return (sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p))
def gen(seed, n):
    r = random.Random(seed)
    pcs = [[(50 + 47 * math.cos(i * math.pi / 48), 50 + 47 * math.sin(i * math.pi / 48)) for i in range(96)]]
    while len(pcs) < n:
        pcs.sort(key=area, reverse=True); p = pcs.pop(0)
        cx, cy = cen(p); t = r.random() * math.pi; nx, ny = math.cos(t), math.sin(t); off = (r.random() - 0.5) * math.sqrt(area(p)) * 0.6
        a, b = cut(p, nx, ny, cx * nx + cy * ny + off)
        if len(a) > 2 and len(b) > 2 and min(area(a), area(b)) > area(p) * 0.18: pcs += [a, b]
        else: pcs.append(p)
    return pcs
def adj(a, b): return sum(1 for p in a for q in b if abs(p[0] - q[0]) + abs(p[1] - q[1]) < 0.6) >= 2
def pieces(n, names=('violet', 'jade', 'ambre', 'ciel', 'rose', 'ambre')):
    pcs = gen(7, n); idx = sorted(range(n), key=lambda k: area(pcs[k]))
    col = {idx[0]: 'glow'}
    for c, k in zip(names, reversed(idx[1:])): col[k] = c
    assert not [(i, j) for i in range(n) for j in range(i + 1, n) if col[i] == col[j] and adj(pcs[i], pcs[j])], 'deux verres pareils se touchent'
    return [(GL[col[k]], ' '.join(f'{x:.2f},{y:.2f}' for x, y in p)) for k, p in enumerate(pcs)]
FULL, SMALL = pieces(7), pieces(4)
def symbol(parts, lead, ring, mono=None):
    b = ''.join(f'<polygon points="{p}" fill="{mono or c}" stroke="{NIGHT if not mono else "none"}" stroke-width="{lead}" stroke-linejoin="round"/>' for c, p in parts)
    return b + f'<circle cx="50" cy="50" r="{47 - ring / 2 + 0.5:.2f}" fill="none" stroke="{NIGHT}" stroke-width="{ring}"/>'

# ── Mot ─────────────────────────────────────────────────────────────────────────
f = instantiateVariableFont(TTFont(sys.argv[1]), AXES); gs = f.getGlyphSet(); cmap = f.getBestCmap(); UPM = f['head'].unitsPerEm
rp = RecordingPen(); gs[cmap[ord('i')]].draw(rp); conts, cur = [], []
for op, args in rp.value:
    if op == 'moveTo': cur = [args[0]]
    elif op in ('lineTo', 'curveTo', 'qCurveTo'): cur += list(args)
    elif op in ('closePath', 'endPath'): conts.append(cur)
dot = max(conts, key=lambda c: min(p[1] for p in c))
DX0, DX1, DY0, DY1 = min(p[0] for p in dot), max(p[0] for p in dot), min(p[1] for p in dot), max(p[1] for p in dot)
ibb = BoundsPen(gs); gs[cmap[ord('i')]].draw(ibb)
x, d = 0, []
for ch in 'donıvers':
    g = gs[cmap[ord(ch)]]; pen = SVGPathPen(gs); g.draw(TransformPen(pen, (1, 0, 0, -1, x, 0))); d.append(pen.getCommands())
    if ch == 'ı':
        b = BoundsPen(gs); g.draw(b)
        scx = x + (DX0 + DX1) / 2 - ((ibb.bounds[0] + ibb.bounds[2]) / 2 - (b.bounds[0] + b.bounds[2]) / 2); scy = (DY0 + DY1) / 2; s = (DY1 - DY0) * 1.18
        SHARD = ' '.join(f'{scx + px * s:.1f},{-(scy + py * s):.1f}' for px, py in [(-.50, -.18), (.08, -.52), (.52, -.22), (.40, .40), (-.30, .48)])
    x += g.width
WORD = ' '.join(d); WW = x
db = BoundsPen(gs); gs[cmap[ord('d')]].draw(db); ASC = db.bounds[3]
yb = BoundsPen(gs); gs[cmap[ord('s')]].draw(yb); DESC = min(0, yb.bounds[1])
TOP = max(ASC, -min(float(v) for v in SHARD.replace(',', ' ').split()[1::2]))
def word(color):
    return f'<path d="{WORD}" fill="{color}"/><polygon points="{SHARD}" fill="{AMBRE}"/>'

def svgdoc(w, h, body, vb):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{vb}">{body}</svg>'

OUT.mkdir(parents=True, exist_ok=True)
files = {}
files['donivers-symbole.svg'] = svgdoc(100, 100, symbol(FULL, 3.4, 4.2), '0 0 100 100')
files['donivers-symbole-petit.svg'] = svgdoc(100, 100, symbol(SMALL, 7, 8), '0 0 100 100')
files['donivers-symbole-mono-creme.svg'] = svgdoc(100, 100, f'<circle cx="50" cy="50" r="47" fill="{CREAM}"/>' + ''.join(f'<polygon points="{p}" fill="none" stroke="{NIGHT}" stroke-width="3.4" stroke-linejoin="round"/>' for _, p in FULL) + f'<circle cx="50" cy="50" r="45.4" fill="none" stroke="{NIGHT}" stroke-width="4.2"/>', '0 0 100 100')
pad = 20; H = TOP - DESC
for name, col in [('creme', CREAM), ('encre', INK)]:
    files[f'donivers-mot-{name}.svg'] = svgdoc(round(WW / 10), round((H + 2 * pad) / 10), f'<g transform="translate(0,{TOP + pad:.1f})">{word(col)}</g>', f'0 0 {WW:.0f} {H + 2 * pad:.0f}')
    # Logo horizontal : symbole d'un diamètre de 1,3 fois la hauteur du d, centré un peu sous le milieu du d
    D = ASC * 1.3; gap = D * 0.26; cy = -ASC * 0.47
    top = min(cy - D / 2, -TOP); bottom = max(cy + D / 2, -DESC); Hh = bottom - top + 2 * pad; base = pad - top
    # Deux versions : symbole complet (au-delà de 40 px de haut), petit symbole (en-têtes, courriels)
    for suffix, parts, lead, ring in [('', FULL, 3.4, 4.2), ('-petit', SMALL, 7, 8)]:
        sym = f'<g transform="translate(0,{base + cy - D / 2:.1f}) scale({D / 100:.3f})">{symbol(parts, lead, ring)}</g>'
        files[f'donivers-logo-{name}{suffix}.svg'] = svgdoc(round((D + gap + WW) / 10), round(Hh / 10), sym + f'<g transform="translate({D + gap:.1f},{base:.1f})">{word(col)}</g>', f'0 0 {D + gap + WW:.0f} {Hh:.0f}')
for n, s in files.items(): (OUT / n).write_text(s)
# Icônes (PNG) : favicon 32 (petit symbole), Android 192/512, iPhone 180 (fond nuit, marge)
cairosvg.svg2png(bytestring=files['donivers-symbole-petit.svg'].encode(), write_to=str(OUT / 'icon-32.png'), output_width=32, output_height=32)
for s in (192, 512): cairosvg.svg2png(bytestring=files['donivers-symbole.svg'].encode(), write_to=str(OUT / f'icon-{s}.png'), output_width=s, output_height=s)
apple = svgdoc(180, 180, f'<rect width="100" height="100" fill="{NIGHT}"/><g transform="translate(12,12) scale(0.76)">{symbol(FULL, 3.4, 4.2)}</g>', '0 0 100 100')
cairosvg.svg2png(bytestring=apple.encode(), write_to=str(OUT / 'apple-touch-icon.png'), output_width=180, output_height=180)
# Courriel : logo horizontal crème en PNG (Gmail et Outlook bloquent le SVG), 2× la taille affichée (28 px de haut)
cairosvg.svg2png(bytestring=files['donivers-logo-creme-petit.svg'].encode(), write_to=str(OUT / 'donivers-courriel.png'), output_height=112)
print('public/brand :', ', '.join(sorted(p.name for p in OUT.iterdir())))

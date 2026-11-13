# Génère le logo de Donivers (fichiers SVG et PNG dans public/brand/).
#
# Symbole « B » (choisi le 13 nov. 2026) : un disque de verre découpé comme le vrai vitrail (coupes droites en T, jamais
# vers le centre : il ne doit pas ressembler à un camembert) en 5 pièces, une par verre (violet, jade, ambre, ciel, rose),
# plomb nuit fin (2 sur 100, anneau 2,6), chaque pièce éclairée comme le vitrail (fond profond, cœur lumineux : mêmes
# formules que glowPalette et glow() dans lib/glass.ts). Un seul symbole à toutes les tailles (lisible de 24 à 160 px).
# Découpage déterministe : graine 3.
# Mot : « donivers » en Fraunces vectorisée (opsz 144, wght 520, SOFT 100, WONK 0) ; un éclat d'ambre remplace le point
# du i, à la place et à l'écart exacts du point d'origine (détaché de la lettre).
#
# Prérequis (hors dépendances du projet) :
#   npm i --prefix /tmp/fraunces @fontsource-variable/fraunces
#   pip install fonttools brotli cairosvg
# Usage : python3 scripts/logo.py /tmp/fraunces/node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2
import colorsys, math, random, sys, pathlib
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
def hsl_of(hexc):
    r, g, b = [int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return h * 360, s * 100, l * 100
def hex_of(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, max(0, min(100, l)) / 100, s / 100)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))
def inscribed(p):
    # centre et rayon du plus grand cercle inscrit (grille 41 × 41), comme labelCenter
    xs, ys = [q[0] for q in p], [q[1] for q in p]
    def inside(x, y):
        c = False
        for i in range(len(p)):
            a, b = p[i], p[i - 1]
            if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]: c = not c
        return c
    def dseg(x, y, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy + 1e-9)))
        return math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)
    best = (0, cen(p))
    for i in range(41):
        for j in range(41):
            x = min(xs) + (max(xs) - min(xs)) * i / 40; y = min(ys) + (max(ys) - min(ys)) * j / 40
            if inside(x, y):
                d = min(dseg(x, y, p[k], p[k - 1]) for k in range(len(p)))
                if d > best[0]: best = (d, (x, y))
    return best
PIECES = gen(3, 5)
_idx = sorted(range(5), key=lambda k: area(PIECES[k]))
COLORS = {k: c for c, k in zip(('violet', 'jade', 'ambre', 'ciel', 'rose'), reversed(_idx))}  # la plus grande violette, la plus petite rose
assert not [(i, j) for i in range(5) for j in range(i + 1, 5) if COLORS[i] == COLORS[j] and adj(PIECES[i], PIECES[j])], 'deux verres pareils se touchent'
def symbol(lead=2, ring=2.6, uid='g', mono=False):
    # uid : préfixe des dégradés, différent pour chaque symbole d'un même document
    defs, body = '', ''
    for k, p in enumerate(PIECES):
        pts = ' '.join(f'{x:.2f},{y:.2f}' for x, y in p)
        lead_line = f'<polygon points="{pts}" fill="none" stroke="{NIGHT}" stroke-width="{lead}" stroke-linejoin="round"/>'
        if mono:
            body += lead_line
            continue
        h, s, l = hsl_of(GL[COLORS[k]]); ir, (cx, cy) = inscribed(p); r = max(ir * 1.6, math.sqrt(area(p) / math.pi) * 0.8)
        defs += (f'<radialGradient id="{uid}{k}" gradientUnits="userSpaceOnUse" cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}">'
                 f'<stop offset="0" stop-color="{hex_of(h, s, min(88, l + 16))}"/><stop offset="0.55" stop-color="{hex_of(h, s, max(18, l))}"/>'
                 f'<stop offset="1" stop-color="{hex_of(h, s, max(14, l * 0.62))}"/></radialGradient>')
        body += f'<polygon points="{pts}" fill="url(#{uid}{k})"/>' + lead_line
    return (f'<defs>{defs}</defs>' if defs else '') + body + f'<circle cx="50" cy="50" r="{47 - ring / 2 + 0.5:.2f}" fill="none" stroke="{NIGHT}" stroke-width="{ring}"/>'

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
files['donivers-symbole.svg'] = svgdoc(100, 100, symbol(uid='s'), '0 0 100 100')
# Une couleur : plomb un peu plus épais, pour qu'il se lise sans couleur
files['donivers-symbole-mono-creme.svg'] = svgdoc(100, 100, f'<circle cx="50" cy="50" r="47" fill="{CREAM}"/>' + symbol(lead=2.6, ring=3, mono=True), '0 0 100 100')
pad = 20; H = TOP - DESC
for name, col in [('creme', CREAM), ('encre', INK)]:
    files[f'donivers-mot-{name}.svg'] = svgdoc(round(WW / 10), round((H + 2 * pad) / 10), f'<g transform="translate(0,{TOP + pad:.1f})">{word(col)}</g>', f'0 0 {WW:.0f} {H + 2 * pad:.0f}')
    # Logo horizontal : symbole d'un diamètre de 1,3 fois la hauteur du d, centré un peu sous le milieu du d
    D = ASC * 1.3; gap = D * 0.26; cy = -ASC * 0.47
    top = min(cy - D / 2, -TOP); bottom = max(cy + D / 2, -DESC); Hh = bottom - top + 2 * pad; base = pad - top
    sym = f'<g transform="translate(0,{base + cy - D / 2:.1f}) scale({D / 100:.3f})">{symbol(uid="l")}</g>'
    files[f'donivers-logo-{name}.svg'] = svgdoc(round((D + gap + WW) / 10), round(Hh / 10), sym + f'<g transform="translate({D + gap:.1f},{base:.1f})">{word(col)}</g>', f'0 0 {D + gap + WW:.0f} {Hh:.0f}')
for old in ('donivers-symbole-petit.svg', 'donivers-logo-creme-petit.svg', 'donivers-logo-encre-petit.svg'): (OUT / old).unlink(missing_ok=True)  # anciens petits symboles (4 pièces)
for n, s in files.items(): (OUT / n).write_text(s)
# Icônes (PNG) : favicon 32, Android 192/512, iPhone 180 (fond nuit, marge)
for s in (32, 192, 512): cairosvg.svg2png(bytestring=files['donivers-symbole.svg'].encode(), write_to=str(OUT / f'icon-{s}.png'), output_width=s, output_height=s)
apple = svgdoc(180, 180, f'<rect width="100" height="100" fill="{NIGHT}"/><g transform="translate(12,12) scale(0.76)">{symbol(uid='a')}</g>', '0 0 100 100')
cairosvg.svg2png(bytestring=apple.encode(), write_to=str(OUT / 'apple-touch-icon.png'), output_width=180, output_height=180)
# Courriel : logo horizontal crème en PNG (Gmail et Outlook bloquent le SVG), 2× la taille affichée (28 px de haut)
cairosvg.svg2png(bytestring=files['donivers-logo-creme.svg'].encode(), write_to=str(OUT / 'donivers-courriel.png'), output_height=112)
print('public/brand :', ', '.join(sorted(p.name for p in OUT.iterdir())))

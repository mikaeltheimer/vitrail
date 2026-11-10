# Mesure une palette de verres : clarté, contraste sur le fond nuit (télé et projecteur simulé), lisibilité du texte
# crème, et les paires les plus proches (vision normale, deutéranopie, protanopie, projecteur ; écart CIE76).
# Usage : python3 scripts/palette.py ambre=#F0B24A corail=#EA6646 …
import sys, itertools, colorsys
def h2r(h): h=h.lstrip('#'); return [int(h[i:i+2],16)/255 for i in (0,2,4)]
def lin(v): return v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4
def gam(v): v=max(0,min(1,v)); return 12.92*v if v<=0.0031308 else 1.055*v**(1/2.4)-0.055
def lum(c): r,g,b=[lin(x) for x in c]; return 0.2126*r+0.7152*g+0.0722*b
def con(a,b): x,y=sorted([lum(a),lum(b)],reverse=True); return (x+.05)/(y+.05)
def lab(c):
    r,g,b=[lin(x) for x in c]
    X=(0.4124*r+0.3576*g+0.1805*b)/0.95047;Y=0.2126*r+0.7152*g+0.0722*b;Z=(0.0193*r+0.1192*g+0.9505*b)/1.08883
    f=lambda t: t**(1/3) if t>0.008856 else 7.787*t+16/116
    return (116*f(Y)-16,500*(f(X)-f(Y)),200*(f(Y)-f(Z)))
def de(a,b): A,B=lab(a),lab(b); return sum((x-y)**2 for x,y in zip(A,B))**.5
def deut(c):
    R,G,B=[lin(x) for x in c]
    return [gam(0.367*R+0.861*G-0.228*B),gam(0.280*R+0.673*G+0.047*B),gam(-0.012*R+0.043*G+0.969*B)]
def prot(c):
    R,G,B=[lin(x) for x in c]
    return [gam(0.152*R+1.053*G-0.205*B),gam(0.115*R+0.786*G+0.099*B),gam(-0.004*R-0.048*G+1.052*B)]
def proj(c):
    y=0.3*c[0]+0.59*c[1]+0.11*c[2]; c=[v+(y-v)*0.3 for v in c]; return [ (46+v*255*0.78)/255 for v in c]
BG=h2r('#0B0A12'); CREAM=h2r('#F4EFE6')
P=dict(a.split('=') for a in sys.argv[1:])
print('verre      L*   contrasteFond  projFond  crème/verre')
for k,v in P.items():
    c=h2r(v); print(f'{k:9} {lab(c)[0]:5.1f} {con(c,BG):8.2f} {con(proj(c),proj(BG)):9.2f} {con(CREAM,c):9.2f}  sat={colorsys.rgb_to_hls(*c)[2]:.2f}')
for name,f in [('normal',lambda c:c),('deutéranopie',deut),('protanopie',prot),('projecteur',proj)]:
    pairs=sorted(((de(f(h2r(P[a])),f(h2r(P[b]))),a,b) for a,b in itertools.combinations(P,2)))
    print(name, ' '.join(f'{a}/{b}={d:.0f}' for d,a,b in pairs[:4]))

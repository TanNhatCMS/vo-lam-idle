import hashlib, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

A = r'P:/VoLamIdleAndroid/game'          # mình
B = r'P:/volam.vinarpg.com'              # vinarpg (bản clone)
MEDIA = ['img', 'snd', 'music', 'fx']

def scan(root, sub):
    base = os.path.join(root, sub)
    out = {}
    if not os.path.isdir(base):
        return out
    for dp, dn, fn in os.walk(base):
        for f in fn:
            p = os.path.join(dp, f)
            rel = os.path.relpath(p, base).replace(os.sep, '/')
            out[rel] = p
    return out

def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for c in iter(lambda: f.read(1 << 20), b''):
            h.update(c)
    return h.hexdigest()

for sub in MEDIA:
    mine, their = scan(A, sub), scan(B, sub)
    only_their = sorted(set(their) - set(mine))
    only_mine = sorted(set(mine) - set(their))
    common = sorted(set(mine) & set(their))
    changed = []
    for rel in common:
        if sha(mine[rel]) != sha(their[rel]):
            changed.append(rel)
    sa = sum(os.path.getsize(their[r]) for r in only_their)
    sb = sum(os.path.getsize(their[r]) for r in changed)
    print(f'== {sub}: mình {len(mine)} | họ {len(their)} | thiếu {len(only_their)} ({sa/1e6:.1f} MB) | khác nội dung {len(changed)} ({sb/1e6:.1f} MB) | mình thừa {len(only_mine)}')
    for r in only_their[:6]:
        print('   thiếu:', r)
    if len(only_their) > 6: print(f'   ... và {len(only_their)-6} file nữa')
    for r in changed[:6]:
        print('   khác:', r)
    if len(changed) > 6: print(f'   ... và {len(changed)-6} file nữa')
    for r in only_mine[:4]:
        print('   mình thừa:', r)

# Rà tổng: so headings + nút + window export của v119 với code port
import re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

s = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
import glob
SRC = ''
for p in glob.glob('P:/VoLamIdleAndroid/web/src/**/*.ts', recursive=True) + glob.glob('P:/VoLamIdleAndroid/web/src/**/*.tsx', recursive=True):
    SRC += open(p, encoding='utf-8', errors='replace').read()
CSS = open('P:/VoLamIdleAndroid/web/public/style.css', encoding='utf-8', errors='replace').read()

# 1. Cac the <h3> trong nguon
h3s = re.findall(r'<h3>([^<$]+)', s)
seen = []
for h in h3s:
    h = h.strip()
    if h and h not in seen: seen.append(h)
print('=== H3 trong v119 nhưng không có trong src ===')
miss = 0
for h in seen:
    if h not in SRC:
        print('  -', h); miss += 1
print('tổng', len(seen), 'thiếu', miss)

# 2. window.* exports của nguồn
ex = sorted(set(re.findall(r'defineProperty\(window,`?([A-Za-z_$][\w$]*)', s)) | set(re.findall(r'window\.([A-Za-z_$][\w$]*)=`', s)))
print('\n=== window.* của nguồn KHÔNG có trong src ===')
miss2 = []
for w in ex:
    if w.startswith('_') or w in ('location', 'localStorage', 'jxAfk', 'JXAFK'): continue
    if w not in SRC:
        miss2.append(w)
print(', '.join(miss2) if miss2 else '  (không)')
print('tổng exports:', len(ex), 'thiếu:', len(miss2))

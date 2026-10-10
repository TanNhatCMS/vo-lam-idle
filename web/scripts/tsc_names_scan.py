# -*- coding: utf-8 -*-
"""Quet TS2304/TS2305 (ten khong xac dinh / xuat khong ton tai) tren copy cua src/game
voi dong `// @ts-nocheck` da bo — @ts-nocheck che het loi, nhung loi "ten khong xac dinh"
la bug thoi (thieu import). Chay: python scripts/tsc_names_scan.py
"""
import io, os, re, shutil, subprocess, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, '..', 'src', 'game')
TMP = os.path.join(ROOT, '.tsc_scan')

if os.path.isdir(TMP):
    shutil.rmtree(TMP)
os.makedirs(TMP)

for f in os.listdir(SRC):
    if not f.endswith(('.ts', '.tsx')):
        continue
    t = open(os.path.join(SRC, f), encoding='utf-8', errors='replace').read()
    t = re.sub(r'(?m)^\s*//\s*@ts-nocheck.*$', '', t)   # bo che loi de tsc that su kiem
    open(os.path.join(TMP, f), 'w', encoding='utf-8').write(t)

tsc_js = os.path.join(ROOT, '..', 'node_modules', 'typescript', 'lib', 'tsc.js')
if not os.path.exists(tsc_js):
    print('khong tim thay node_modules/typescript/lib/tsc.js'); sys.exit(1)
cmd = ['node', tsc_js, '--noEmit', '--skipLibCheck', '--target', 'es2021',
       '--module', 'esnext', '--moduleResolution', 'bundler', '--strict', 'false',
       '--lib', 'es2021,dom', '--jsx', 'react-jsx', '--allowJs', 'false']
cmd += sorted(os.path.join(TMP, f) for f in os.listdir(TMP))
r = subprocess.run(cmd, capture_output=True, text=True, errors='replace')

hits = []
for line in (r.stdout + r.stderr).splitlines():
    m = re.search(r'error (TS2304|TS2305):', line)
    if m:
        hits.append(line.strip())

if hits:
    print('TEN KHONG XAC DINH / XUAT KHONG TON TAI:')
    for h in hits:
        print('  ' + h)
    sys.exit(1)
print('tsc name scan: OK (%d files)' % len(os.listdir(TMP)))

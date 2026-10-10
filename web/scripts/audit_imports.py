# -*- coding: utf-8 -*-
"""Guard cho cac dot port: tim module dung ham/global ma khong import.

Bai hoc: bug "nut bam khong tac dung" lap lai 4 lan deu do module thieu import
($ / setInvDirty / refresh...) — @ts-nocheck che loi, runtime chi vo khi bam.

Chay:  python scripts/audit_imports.py   (exit 1 neu co thieu import)
"""
import io, os, re, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src')
# ten ham -> (regex dung, nguon nen import tu)
CHECKS = {
    '$':          (r'(?<![\w.$])\$\s*\(', 'core'),
    'setInvDirty': (r'(?<![\w.])setInvDirty\s*\(', 'ui'),
    'closeModal': (r'(?<![\w.])closeModal\s*\(', 'ui'),
    'toast':      (r'(?<![\w.])toast\s*\(', 'ui'),
    'modal':      (r'(?<![\w.])modal\s*\(', 'ui'),
    'refresh':    (r'(?<![\w.])refresh\s*\(', 'ui'),
    'esc':        (r'(?<![\w.])esc\s*\(', 'core'),
    'fmt':        (r'(?<![\w.])fmt\s*\(', 'core'),
    'clamp':      (r'(?<![\w.])clamp\s*\(', 'core'),
    'save':       (r'(?<![\w.])save\s*\(', 'save'),
    'log':        (r'(?<![\w.])log\s*\(', 'ui'),
}
# file duoc phep ngoai le (dinh nghia chinh, hoac ham cung ten khac nguon)
SKIP = {'ui.ts', 'core.ts', 'types.ts'}
bad = []
for dp, dn, fn in os.walk(SRC):
    for f in fn:
        if not f.endswith(('.ts', '.tsx')) or f in SKIP: continue
        p = os.path.join(dp, f)
        t = open(p, encoding='utf-8', errors='replace').read()
        t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)      # bo comment khoi
        t = re.sub(r'(?m)^\s*//.*$', '', t)                 # bo comment dong
        # gom tat ca khoi import { ... } from '...'
        imports = {}
        for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*'([^']+)'", t, re.S):
            for name in re.findall(r'[A-Za-z_$][\w$]*', m.group(1)):
                imports.setdefault(name, set()).add(m.group(2))
        for name, (pat, src) in CHECKS.items():
            if not re.search(pat, t): continue
            if re.search(r'(function|const|let|var)\s+' + re.escape(name) + r'\s*[=(]', t): continue     # dinh nghia cuc bo
            if re.search(r'export\s+(function|const)\s+' + re.escape(name) + r'\b', t): continue
            # tham so / doi so ham trung ten (vd thanMaBind(refresh), bindBuilds(rerender))
            # NHUNG khong phap goi long: stageLevel(clamp(...)) — ten ngay sau ( la goi ham, phai kiem import
            if re.search(r'\(\s*' + re.escape(name) + r'\b(?!\s*\()', t): continue
            if name in imports: continue
            bad.append(f'{p}: dung {name}() nhung khong import (nen tu ./{src})')

if bad:
    print('CANH BAO — thieu import:')
    for b in bad: print('  ' + b)
    sys.exit(1)
print('audit import: OK')

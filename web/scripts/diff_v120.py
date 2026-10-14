# So bundle v119 (zZ5P793c) vs v120 (DzZ2mNZ0): tim phan diff chinh
import re, sys, difflib
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()
print('len v119:', len(a), 'v120:', len(b), 'delta:', len(b) - len(a))

sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
ops = [o for o in sm.get_opcodes() if o[0] != 'equal']
print('so khoi diff:', len(ops))
for tag, i1, i2, j1, j2 in ops[:20]:
    old = a[i1:i2]; new = b[j1:j2]
    print(f'\n===== {tag} v119[{i1}:{i2}] ({len(old)}B) -> v120[{j1}:{j2}] ({len(new)}B) =====')
    if len(old) < 700: print('OLD:', old[:700].replace('\n', ' '))
    if len(new) < 900: print('NEW:', new[:900].replace('\n', ' '))

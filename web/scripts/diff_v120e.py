# So 3000 byte cuoi cua 2 bundle bang difflib
import difflib, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()[-3000:]
b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()[-3000:]
# chia thanh cau nho de diff doc duoc
ta = a.replace('try{', '\ntry{').replace('}catch', '\n}catch')
tb = b.replace('try{', '\ntry{').replace('}catch', '\n}catch')
for line in difflib.unified_diff(ta.splitlines(), tb.splitlines(), 'v119', 'v120', lineterm='', n=0):
    if line.startswith(('---', '+++', '@@')): continue
    if line.startswith('+') or line.startswith('-'):
        print(line[:200])

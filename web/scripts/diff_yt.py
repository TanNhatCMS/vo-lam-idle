# So logic Dã Tẩu (yt) giữa 2 bundle: tim ham quest pool + reward
import re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()

for kw in ['Dã Tẩu']:
    print('=' * 12, kw, 'v119 hits:', a.count(kw), 'v120 hits:', b.count(kw))
    # in ngu canh hit cuoi cung o moi bundle (nhung ham tao quest)
    for name, s in (('v119', a), ('v120', b)):
        idx = [m.start() for m in re.finditer(kw, s)]
        print(f'--- {name}: hits at {idx[:10]}')
print()
# tim bang quest yt: nhin xung quanh 'Dã Tẩu' hit dau tien trong moi bundle
for name, s in (('v119', a), ('v120', b)):
    i = s.find('Dã Tẩu')
    print(f'===== {name} ctx đầu =====')
    print(s[max(0, i-700):i+300].replace('\n', ' '))
    print()

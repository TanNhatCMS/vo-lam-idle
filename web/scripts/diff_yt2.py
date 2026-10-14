# So logic nhiem vu Dã Tẩu (yt) + tim mt( trong v120
import re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()

# quest pool Dã Tẩu: tim bang quest (muc 'Hàng ngày' / 'ytQuests')
for name, s in (('v119', a), ('v120', b)):
    i = s.find('ytQuests')
    print(f'{name} ytQuests @{i}')
# bang nhiem vu: tim "Dã Tẩu" lan thu 3-4 (quests area) - in quanh do
for name, s in (('v119', a), ('v120', b)):
    idx = [m.start() for m in re.finditer('Dã Tẩu', s)]
    i = idx[2] if len(idx) > 2 else idx[-1]
    print(f'\n===== {name} quest area @{i} =====')
    print(s[max(0, i-500):i+400].replace('\n', ' '))

# Tim mt( trong v120 (he so nhan count) + quest pool
import re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()
a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()

# mt duoc dung trong Ta: "let t=pa(e.L),n=t.items.filter(...),r=mt(e)"
i = b.find(',r=mt(e)')
print('mt( use @', i)
# tim dinh nghia: "function mt(" hoac "var mt="
for pat in [r'function mt\(', r'\bmt=', r'var mt']:
    for m in re.finditer(pat, b):
        j = m.start()
        print(f'--- {pat} @{j}:', b[max(0,j-120):j+260].replace('\n', ' '))
        print()

# quest pool: tim "Hạ" + "Nhặt" templates gan nhau (duty pool)
i = b.find('`Hạ {n}`')
if i < 0: i = b.find('Hạ {n}')
for kw in ['Hạ {n}', 'Nhặt {n}', '{n} quái', 'đồ rơi']:
    j = b.find(kw)
    print(f'{kw!r}: {j}')
    if j >= 0:
        print('   ', b[max(0, j-250):j+150].replace('\n', ' '))

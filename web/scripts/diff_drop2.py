# So quanh bonusDrop (ham rollDrop) giua 2 bundle
import difflib, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()
ia = a.find('bonusDrop'); ib = b.find('bonusDrop')
# mo rong window de lay ca ham rollDrops gan do
A = a[max(0, ia-2500):ia+2500]
B = b[max(0, ib-2500):ib+2500]
# chuan hoa ten minify 1-2 chu cai de giam noise: thay \b[A-Za-z]{1,2}\b thanh #
import re
An = re.sub(r'\b[A-Za-z]{1,2}\b', '#', A)
Bn = re.sub(r'\b[A-Za-z]{1,2}\b', '#', B)
if An == Bn:
    print('HUONG bonusDrop: GIONG HET SAU KHI chuan hoa ten')
else:
    for line in difflib.unified_diff(An.split('},'), Bn.split('},'), 'v119', 'v120', lineterm='', n=1):
        print(line[:300])

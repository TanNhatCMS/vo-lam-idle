# Nguyen van 2 ham drop thay doi
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()

# ham itemTier: nhan dien qua "Math.round(" + "/12)" + "MinItemLevel"
import re
def grab(s, anchor, back=260, fwd=520):
    i = s.find(anchor)
    j = s.rfind('function ', max(0, i-back), i)
    return s[j:j+fwd] if j >= 0 else s[i-back:i+fwd]

print('===== itemTier v119 =====')
print(grab(a, 'MinItemLev'))
print()
print('===== itemTier v120 =====')
print(grab(b, 'MinItemLevel||1'))
print()
# ham chon mon: "return null" moi
i = b.find('return null', b.find('MinItemLevel||1'))
print('===== v120 new null-fn ctx =====')
print(b[max(0, i-450):i+450])
print()
# doi chieu v119 cung vi tri tuong doi (tiep theo MinItemLevel trong a)
i2 = a.find('MinItemLevel')
i2 = a.find('MinItemLevel', i2+10)
print('===== v119 same area =====')
print(a[max(0, i2-450):i2+450])

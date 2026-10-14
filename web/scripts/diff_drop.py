# So cac ham drop giua v119 va v120: rollDrops/moneyDrop/dropFile-equivalent
import re, sys, difflib
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()

def find_fn(s, markers, ctx=1400):
    """tim vi tri ham theo marker text duy nhat trong than ham"""
    for m in markers:
        i = s.find(m)
        if i >= 0:
            # lui ve dau function gan nhat
            j = s.rfind('function ', 0, i)
            if j >= 0 and i - j < 400:
                return s[j:j+ctx]
    return None

# ham roi do: nhan dien qua chuoi dac trung
MARK_DROP = ['randRange(', 'RandRate', 'dropFile']
for label, s in (('v119', a), ('v120', b)):
    print('#' * 10, label)
    # tim "MoneyScale" (moneyDrop) va ham tao item khi roi
    for marker in ['MoneyScale', 'bonusDrop', 'FACTION_WEAPON_SHARE']:
        i = s.find(marker)
        print(f'{marker}: {i}')

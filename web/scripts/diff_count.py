# Trich magicCount + rollDrops v119/v120 (form day du)
import re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()

# magicCount v119: sau rollMagic _a/... tim "lucky" * pattern
for name, s in (('v119', a), ('v120', b)):
    m = re.search(r'function (\w+)\((\w)\)\{let t=\(j\.P\?j\.P\.lucky:0\)\*\.?8?(\d*)', s)
    i = s.find('*.8)') if '*.8)' in s else s.find('*.5)')
    i = s.find('.lucky:0)*')
    j = s.rfind('function ', 0, i)
    print(f'===== {name} magicCount =====')
    print(s[j:s.find('}var ', j)+1])
    print()
    # rollDrops: tim "bonusDrop"
    i2 = s.find('bonusDrop')
    j2 = s.rfind('function ', 0, i2)
    print(f'===== {name} rollDrops =====')
    print(s[j2:s.find('}function ', j2)+1][:1600])
    print()

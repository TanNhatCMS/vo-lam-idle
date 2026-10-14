# monsterTrialTick (ht) day du + co o v119 khong
import re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()
a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()

i = b.find('function ht(e,t,n)')
j = b.find('function ', i + 12)
print('===== v120 monsterTrialTick =====')
print(b[i:j])
print()
print('v119 có "lastDamageHp":', a.count('lastDamageHp'), '| v120:', b.count('lastDamageHp'))
print('v119 có ".tr??":', a.count('.tr??'), '| v120:', b.count('.tr??'))
# tim v119 tuong duong qua marker lastDamageHp
if a.count('lastDamageHp'):
    i2 = a.find('lastDamageHp')
    k = a.rfind('function ', 0, i2)
    print('===== v119 cùng khu vực =====')
    print(a[k:k+700])

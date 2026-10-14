# So chuoi literal (backtick) v120 vs v119: string moi/cua v120
import re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()
sa = set(re.findall(r'`([^`]{4,120})`', a))
sb = re.findall(r'`([^`]{4,120})`', b)
seen = set(); new = []
for x in sb:
    if x in sa or x in seen: continue
    seen.add(x); new.append(x)
print('string moi o v120:', len(new))
for x in new[:60]:
    print('  +', x[:110].replace('\n', ' '))
print()
# va string mat di (co o v119, khong con o v120)
sbset = set(sb)
lost = []
seen2 = set()
for x in re.findall(r'`([^`]{4,120})`', a):
    if x in sbset or x in seen2: continue
    seen2.add(x); lost.append(x)
print('string mat o v120:', len(lost))
for x in lost[:25]:
    print('  -', x[:110].replace('\n', ' '))

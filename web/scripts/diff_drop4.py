# Tim cach dung la=7 va ua=.25 trong v120 + so v119
import re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()
a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()

i = b.find('var sa=.5,ca=40,la=7,ua=.25')
win = b[i:i+3000]
# in cac vi tri dung la / ua (word boundary) trong window
print('=== v120 window sau var block (3000B) ===')
print(win.replace('},', '},\n')[:3000])

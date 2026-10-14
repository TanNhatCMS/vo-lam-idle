# Trich UE (tao vat pham) + qE (tao sach bk90) + helper lien quan
import re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

s = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
for fn in ['function UE(', 'function qE(']:
    i = s.find(fn)
    if i < 0: print(fn, 'NOT FOUND'); continue
    j = s.find('function ', i + 12)
    print('=' * 16, fn, '=' * 16)
    print(s[i:j if j > i else i + 4000])
    print()
# ADMIN_ITEM_DETAILS + IE bang
i = s.find('ADMIN_ITEM_DETAILS')
if i > 0:
    j = s.rfind('var ', 0, i)
    print('=' * 16, 'ADMIN_ITEM_DETAILS area', '=' * 16)
    print(s[j:j+900])

# '🎖 Danh hiệu' chinh xac + first-boot notice + bang thu nghiem cua ta
import re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

s = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
i = s.find('🎖')
print('=== 🎖 ctx ===')
print(s[max(0, i-300):i+300].replace('\n', ' ') if i > 0 else 'không có 🎖')
print()

import glob
SRC = ''
for p in glob.glob('P:/VoLamIdleAndroid/web/src/**/*.ts', recursive=True) + glob.glob('P:/VoLamIdleAndroid/web/src/**/*.tsx', recursive=True):
    SRC += open(p, encoding='utf-8', errors='replace').read()
print('ta có "Treo máy":', 'Treo máy' in SRC, "| 'Thao tác nhanh':", 'Thao tác nhanh' in SRC)
print('ta có notice "Phi thương mại":', 'Phi thương mại' in SRC)
print('ta có "Tạo vật phẩm":', 'Tạo vật phẩm' in SRC)
print('ta có adminItem/admin tool:', 'adminItem' in SRC.lower() or 'tạo item' in SRC.lower())

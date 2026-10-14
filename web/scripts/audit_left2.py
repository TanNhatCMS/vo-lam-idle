# Ngữ cảnh 4 h3 còn thiếu + rà window exports đúng regex
import re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

s = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
for kw in ['JxOffline', 'Danh hiệu', 'Tạo vật phẩm theo ý', 'Tạo Võ Lâm Mật Tịch']:
    i = s.find(f'<h3>{kw}')
    if i < 0: i = s.find(kw)
    print(f'=== {kw} @{i} ===')
    print(s[max(0, i-400):i+400].replace('\n', ' '))
    print()

# window exports: defineProperty(window,"Name" (double quote) hoac backtick
ex = sorted(set(re.findall(r'defineProperty\(window,["\'`]([A-Za-z_$][\w$]*)["\'`]', s)) | set(re.findall(r'window\.([A-Za-z_$][\w$]*)=`', s)))
import glob
SRC = ''
for p in glob.glob('P:/VoLamIdleAndroid/web/src/**/*.ts', recursive=True) + glob.glob('P:/VoLamIdleAndroid/web/src/**/*.tsx', recursive=True):
    SRC += open(p, encoding='utf-8', errors='replace').read()
miss = [w for w in ex if not w.startswith('_') and w not in SRC and w not in ('location',)]
print('=== window exports thiếu ===')
print(len(ex), 'exports,', len(miss), 'thiếu:', ', '.join(miss) if miss else '(không)')

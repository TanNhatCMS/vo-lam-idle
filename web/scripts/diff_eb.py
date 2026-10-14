# eb quest pool 2 bản + shopForgeBlank + our forge
import re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', encoding='utf-8').read()
b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', encoding='utf-8').read()
for name, s in (('v119', a), ('v120', b)):
    m = re.search(r'\[\[`kills`,`.+?tháp[^]]*\]\]', s)
    print(f'{name} eb:', m.group(0) if m else 'không thấy')
    # sau eb: ham tao quest (duty)
    i = m.start() if m else 0
    print('   sau eb:', s[m.end():m.end()+700].replace('\n', ' ')[:700])
    print()
import glob
SRC = ''
for p in glob.glob('P:/VoLamIdleAndroid/web/src/**/*.ts', recursive=True):
    SRC += open(p, encoding='utf-8', errors='replace').read()
print('ta có shopForgeBlank:', 'shopForgeBlank' in SRC)
print('ta có convertWhite:', 'convertWhite' in SRC or 'trắng ra xanh' in SRC.lower() or 'luyện trắng' in SRC.lower())
print('ta có quest pool:', 'Hạ {n} quái' in SRC, '| picked:', 'Nhặt {n} món' in SRC)

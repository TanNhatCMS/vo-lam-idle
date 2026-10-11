#!/usr/bin/env python3
"""Chen block mock /api/chat/* vao cac spec chua mock (test khong noi
server chat that — 40 trang/suite lam live server 429)."""
import re, sys

BLOCK = '''
/* Chat the gioi: mock toan bo /api/chat/* (stream treo = khong noi
   server chat nguon that — ca suite ~40 trang cung IP bi 429). */
test.beforeEach(async ({ page }) => {
  page.route('**/api/chat/status', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 0 }) }));
  page.route('**/api/chat/stream*', () => { /* treo: EventSource dung CONNECTING */ });
  page.route('**/api/chat/messages*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) }));
  page.route('**/api/chat/presence*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
});
'''

FILES = [
    'tests/regression.spec.ts',
    'tests/f1-combat.spec.ts',
    'tests/f3-survival-evo.spec.ts',
    'tests/f4-pet-skill.spec.ts',
    'tests/f5-tower2-set.spec.ts',
    'tests/f6-forge.spec.ts',
    'tests/f7-save-dex-loot.spec.ts',
    'tests/f8-sach-diem.spec.ts',
    'tests/f10-vuot-cap.spec.ts',
    'tests/tyvo.spec.ts',
]

for path in FILES:
    with open(path, encoding='utf-8') as f:
        text = f.read()
    if 'api/chat' in text:
        print(f'SKIP (da co mock): {path}')
        continue
    lines = text.split('\n')
    last_import = max(i for i, ln in enumerate(lines) if ln.startswith('import '))
    lines.insert(last_import + 1, BLOCK)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write('\n'.join(lines))
    print(f'OK: {path} (sau dong import {last_import + 1})')

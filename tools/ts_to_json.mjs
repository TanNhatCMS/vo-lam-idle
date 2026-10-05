#!/usr/bin/env node
/* Chuyen file du lieu `export const X: any={...};` (codemod tu *.js) thanh JSON
   de dong goi chung goi assets OTA (media) thay vi bi bien dich vao chunk JS.

   Du lieu game port tu vanilla JS gio nam trong `game/jdata/` — thu muc `jdata` duoc
   liet ke trong MEDIA_DIRS cua tools/make_ota_manifest.py nen ca thu muc di cung goi
   `assets` OTA (khong bi bien dich vao chunk JS cua goi `data`):
     game/jdata/jx.json    (vat pham, ky nang, quai, bang cap)
     game/jdata/jw.json    (vung, ban do, chi so quai theo vung)
     game/jdata/jfx.json   (hieu ung chieu)
     game/jdata/jmo.json   (vat can ban do, mo ta anh nen img/z/*.jpg)
     game/jdata/jsnd.json  (muc nhac + am thanh, mo ta snd/*.mp3 va music/*.mp3)

   Dung: node tools/ts_to_json.mjs            -> chuyen bo mac dinh
         node tools/ts_to_json.mjs a.ts:b.json -> chuyen file chi dinh (lap lai duoc)
*/
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT = [
  ['web/src/game/jx.ts', 'game/jdata/jx.json'],
  ['web/src/game/jw.ts', 'game/jdata/jw.json'],
  ['web/src/game/jfx.ts', 'game/jdata/jfx.json'],
  ['web/src/game/jmo.ts', 'game/jdata/jmo.json'],
  ['web/src/game/jsnd.ts', 'game/jdata/jsnd.json'],
];

const pairs = process.argv.slice(2).length
  ? process.argv.slice(2).map(a => a.split(':'))
  : DEFAULT;

for (const [tsRel, jsonRel] of pairs) {
  const tsPath = join(ROOT, tsRel);
  if (!existsSync(tsPath)) { console.warn(`[bo qua] khong co ${tsRel} (JSON da la nguon chinh, xem docs/DU-LIEU-MEDIA.md)`); continue; }
  const src = readFileSync(tsPath, 'utf8');
  const m = src.match(/export const \w+\s*:\s*any\s*=([\s\S]*);\s*$/);
  if (!m) { console.error(`[LOI] khong tim thay "export const ...: any={...};" trong ${tsRel}`); process.exit(1); }
  const data = JSON.parse(m[1]);                       // nem loi ngay neu body khong phai JSON hop le
  const out = join(ROOT, jsonRel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(data), 'utf8');
  const keys = Array.isArray(data) ? data.length : Object.keys(data).length;
  console.log(`${jsonRel}  <- ${tsRel}  (${keys} khoa, ${(JSON.stringify(data).length / 1024).toFixed(0)} KB)`);
}

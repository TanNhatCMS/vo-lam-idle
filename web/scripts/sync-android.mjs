/* Dong goi build web (Next.js static export) cho Android OTA + ban web deploy.
   - `node scripts/sync-android.mjs`          : build + chep out/ -> ../game/ (de ranh OTA manifest tool)
   - `node scripts/sync-android.mjs --clean`  : nhu tren + xoa code cu khong con dung (js/, data.js, world.js...)
   - `node scripts/sync-android.mjs --out DIR`: dong goi ban web day du (out + media) vao DIR de deploy static
   Media (img/snd/music/fx/ui) giu nguyen trong game/ — khong bao gio bi ghi de. */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const ROOT = join(WEB, '..');
const GAME = join(ROOT, 'game');
const DIST = join(WEB, 'out');
const PUBLIC = join(WEB, 'public');

const args = process.argv.slice(2);
const clean = args.includes('--clean');
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 ? join(ROOT, args[outIdx + 1]) : null;

const MEDIA = ['img', 'snd', 'music', 'fx'];
// junction media tao boi prep-public.mjs cho next dev — next build phai khong thay de tranh copy 115MB vao out/
function unlinkMediaJunctions() {
  for (const m of MEDIA) {
    const p = join(PUBLIC, m);
    try {
      if (lstatSync(p).isSymbolicLink()) { rmSync(p, { force: true }); console.log('   go junction public/' + m); }
    } catch { /* khong ton tai — bo qua */ }
  }
}
function relinkMediaJunctions() {
  for (const m of MEDIA) {
    const p = join(PUBLIC, m), t = join(GAME, m);
    if (existsSync(p) || !existsSync(t)) continue;
    try { symlinkSync(t, p, 'junction'); } catch { /* linux khong co quyen — dev bo qua */ }
  }
}

console.log('[1/4] go junction media (neu co)...');
unlinkMediaJunctions();
console.log('[2/4] next build...');
// next export KHONG tu xoa out/ — xoa truoc de khong tich luy chunk cu (hash doi moi build)
rmSync(DIST, { recursive: true, force: true });
execSync('npx next build', { cwd: WEB, stdio: 'inherit' });

const CODE_GLOBS = ['index.html', '_next', 'style.css', 'manifest.json', 'fonts', 'ui'];
// code cu cua ban vanilla khong con duoc index.html moi tham chieu
const LEGACY = ['js', 'data.js', 'world.js', 'sound.js', 'fx.js', 'jmo.js', 'rdata.js'];

if (outDir) {
  console.log('[3/4] dong goi ban web day du -> ' + outDir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(DIST, outDir, { recursive: true });
  for (const m of [...MEDIA, 'ui']) {
    const src = join(GAME, m);
    if (existsSync(src)) cpSync(src, join(outDir, m), { recursive: true });
  }
  console.log('[4/4] OK — deploy thu muc ' + outDir + ' len moi hosting static bat ky (domain root)');
} else {
  console.log('[3/4] chep out -> game/ (Android OTA data)');
  if (clean) for (const l of LEGACY) { const p = join(GAME, l); if (existsSync(p)) { rmSync(p, { recursive: true, force: true }); console.log('   xoa code cu: ' + l); } }
  // _next cua ban build truoc phai xoa han: chunk dat ten theo hash, giu lai se ton file chet
  for (const g of CODE_GLOBS) {
    const src = join(DIST, g);
    if (!existsSync(src)) continue;
    const dst = join(GAME, g);
    if (statSync(src).isDirectory()) { rmSync(dst, { recursive: true, force: true }); cpSync(src, dst, { recursive: true }); }
    else cpSync(src, dst);
  }
  console.log('[4/4] OK — chay: python tools/make_ota_manifest.py --version <x.y.z> de sinh goi OTA');
}
console.log('[tail] tao lai junction media cho next dev (neu thieu)...');
relinkMediaJunctions();

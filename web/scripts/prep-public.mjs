/* Chuẩn bị media cho `next dev`: img/snd/music/fx (~115MB) KHÔNG copy — tạo junction
   trỏ vào ../game để dev server phục vụ như file tĩnh trong public/.
   `next build` cần KHÔNG có junction (tránh copy 115MB vào out/) — sync-android.mjs
   tự gỡ trước khi build rồi gọi lại script này. */
import { existsSync, lstatSync, symlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, '..', 'public');
const GAME = join(HERE, '..', '..', 'game');

for (const dir of ['img', 'snd', 'music', 'fx']) {
  const link = join(PUBLIC, dir);
  if (existsSync(link)) continue;                       // đã có (junction hoặc copy thật)
  const target = join(GAME, dir);
  if (!existsSync(target)) {
    console.warn(`[prep-public] bo qua ${dir}: khong ton tai ${target}`);
    continue;
  }
  symlinkSync(target, link, 'junction');
  console.log(`[prep-public] junction public/${dir} -> game/${dir}`);
}
console.log('[prep-public] OK');

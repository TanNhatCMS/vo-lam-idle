/* Server static toi gian de thu ban dong goi (android:sync --out DIR):
   node scripts/serve-static.mjs <thu-muc> [port] */
import { createReadStream, existsSync, statSync } from 'fs';
import { createServer } from 'http';
import { join, extname, resolve } from 'path';

const ROOT = resolve(process.argv[2] || '../deploy');
const PORT = Number(process.argv[3]) || 8080;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.txt': 'text/plain',
};

createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  let file = join(ROOT, p);
  if (!existsSync(file) && existsSync(join(file, 'index.html'))) file = join(file, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');   // dev: bao luon lay ban moi, tranh index/chunk cu trong cache
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`[serve-static] ${ROOT} -> http://localhost:${PORT}`));

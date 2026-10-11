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
  /* Stub API chat the gioi cho test: chat.ts luon fetch /api/chat/* khi
     boot, neu server static tra 404 se gay "Failed to load resource"
     trong console cua test. Chat spec (tests/chat.spec.ts) dung
     page.route() de mock chi tiet hon — route luon uu tien hon server.
     Day chi la stub de cac test con lai khong bi loi console. */
  if (p === '/api/chat/status' || p === '/api/chat/messages') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify(p === '/api/chat/status' ? { ok: true, online: 0 } : { ok: true, messages: [] }));
  }
  if (p === '/api/chat/stream') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store');
    return res.end('event: ready\ndata: {"messages":[],"online":0}\n\n');
  }
  if (p.endsWith('/')) p += 'index.html';
  let file = join(ROOT, p);
  if (!existsSync(file) && existsSync(join(file, 'index.html'))) file = join(file, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');   // dev: bao luon lay ban moi, tranh index/chunk cu trong cache
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`[serve-static] ${ROOT} -> http://localhost:${PORT}`));

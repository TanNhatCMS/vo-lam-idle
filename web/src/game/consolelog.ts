// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { $, esc } from './core';
import { modal, toast } from './ui';

/* ======================= NHAT KY CONSOLE TRONG GAME =======================
   Vỏ Android (WebView) không có DevTools — mọi loi console/window.onerror bi mat.
   Module nay hook console.log/info/warn/error + error + unhandledrejection, giu
   vòng đệm 400 dòng (lưu bền 200 dòng gần nhất vào localStorage), và mở modal
   xem / sao chép / xoá trong tab Khác.
   QUAN TRONG: phải được import ĐẦU TIÊN trong App.tsx để hook kịp cài trước khi
   các module khác chạy (bat ca loi "module evaluation"). */
'use strict';
const MAX = 400, PERSIST_MAX = 200, KEY = 'jxidle_log';
const buf = [];
let persistT = 0;
const lvCol = { error: '#ff8a7a', warn: '#e8c66a', info: '#9fd0ff', log: '#cfd6c9' };
const pad2 = n => String(n).padStart(2, '0');
const stamp = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };

function fmtArg(a) {
  if (a instanceof Error) return a.stack || (a.name + ': ' + a.message);
  if (typeof a === 'string') return a;
  if (a === null || a === undefined || typeof a === 'number' || typeof a === 'boolean') return String(a);
  try { const s = JSON.stringify(a); return s && s.length > 400 ? s.slice(0, 400) + '…' : (s || String(a)); } catch (e) { return String(a); }
}
function push(lvl, parts) {
  const line = { t: stamp(), lvl, m: parts.map(fmtArg).join(' ').replace(/\s+/g, ' ').trim() };
  if (!line.m) return;
  buf.push(line); if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  const now = Date.now();
  if (now - persistT > 1500) { persistT = now; persist(); }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(buf.slice(-PERSIST_MAX))); } catch (e) { /* bo qua */ }
}
function restore() {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) for (const x of arr) if (x && typeof x.m === 'string') buf.push({ t: String(x.t || ''), lvl: x.lvl || 'log', m: String(x.m).slice(0, 500) });
  } catch (e) { /* bo qua */ }
}
restore();

/* cai hook ngay khi module duoc nap (import dau tien trong App.tsx) */
for (const lvl of ['log', 'info', 'warn', 'error']) {
  const orig = console[lvl] ? console[lvl].bind(console) : () => {};
  console[lvl] = (...a) => { try { push(lvl, a); } catch (e) { /* khong de log lam chet app */ } orig(...a); };
}
window.addEventListener('error', e => { push('error', ['[uncaught] ' + (e.message || '?') + ' @ ' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0)]); });
window.addEventListener('unhandledrejection', e => { push('error', ['[promise] ' + fmtArg(e.reason)]); });
window.addEventListener('pagehide', persist);

export const logLines = () => buf;
export function logClear() { buf.length = 0; try { localStorage.removeItem(KEY); } catch (e) { /* bo qua */ } }
function logText() { return buf.map(x => `[${x.t}] ${x.lvl.toUpperCase().padEnd(5)} ${x.m}`).join('\n'); }
function copyLog() {
  const txt = logText();
  const done = () => toast(`Đã sao chép ${buf.length} dòng nhật ký`);
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt, done)); return; } } catch (e) { /* roi xuong fallback */ }
  fallbackCopy(txt, done);
}
function fallbackCopy(txt, done) {
  try {
    const ta = document.createElement('textarea'); ta.value = txt;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
  } catch (e) { toast('Không sao chép được — chọn tay trong ô nhật ký'); }
}
export function logModal() {
  const errs = buf.filter(x => x.lvl === 'error').length, warns = buf.filter(x => x.lvl === 'warn').length;
  const rows = buf.map(x => `<div class="lg-line" style="color:${lvCol[x.lvl] || lvCol.log}"><span class="lg-t">${x.t}</span> ${x.lvl === 'error' ? '⛔' : x.lvl === 'warn' ? '⚠' : '·'} ${esc(x.m)}</div>`).join('');
  modal(`<h3>Nhật ký <small>${buf.length} dòng · ${errs} lỗi · ${warns} cảnh báo</small></h3>
    <p class="desc">Ghi lại console + lỗi runtime của game (giữ ${PERSIST_MAX} dòng gần nhất qua lần mở sau). Khi báo lỗi, bấm <b>Sao chép</b> rồi dán gửi để được hỗ trợ nhanh.</p>
    <div class="lg-view" id="lgView">${rows || '<div class="dim">Chưa có dòng nào</div>'}</div>
    <div class="btnrow"><button class="btn" id="lgCopy">Sao chép</button><button class="btn red" id="lgClear">Xóa hết</button><button class="btn" id="lgClose">Đóng</button></div>`, () => {
    const v = $('#lgView'); if (v) v.scrollTop = v.scrollHeight;
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    on('#lgCopy', copyLog);
    on('#lgClear', () => { logClear(); toast('Đã xóa nhật ký'); logModal(); });
    on('#lgClose', () => { const m = $('#mClose'); if (m) m.click(); });
  });
}

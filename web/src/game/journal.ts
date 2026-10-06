// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { esc, fmt } from './core';
import { S } from './save';
import { modal } from './ui';

/* ======================= SO TAY: thong ke 7 ngay gan nhat (luu trong save) =======================
   Port tu js/journal.js ban vinarpg. Kinh nghiem / vang moi gio choi that, do rot theo do hiem,
   so lan guc kem nguyen nhan. Chi ghi cac con so nho -> save tang vai KB.
   Hook: loop.ts (giay choi that), combat.ts onKill/heroDeath, loot.ts pickUp. */
'use strict';
const JR_DAYS = 7, JR_DEATHS = 12;
const pad2 = n => String(n).padStart(2, '0');
export const localISODay = d => { const x = d || new Date(); return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate()); };
function jr() {
  if (!S) return null;
  const j = S.journal || (S.journal = { days: {} }), k = localISODay(), cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (JR_DAYS - 1));
  for (const day of Object.keys(j.days)) if (day < localISODay(cutoff) || day > k) delete j.days[day];
  if (!j.days[k]) j.days[k] = { sec: 0, xp: 0, gold: 0, kills: 0, r2: 0, r3: 0, set: 0, other: 0, deaths: [], deathN: 0 };
  return j.days[k];
}
export const jrAdd = (f, n) => { const d = jr(); if (d && n) d[f] = (d[f] || 0) + n; };
export function jrDeath(why) {
  const d = jr(); if (!d) return;
  d.deathN = (d.deathN || d.deaths.length) + 1;
  d.deaths.unshift({ at: Date.now(), lvl: S.lvl, stage: S.stage, why });
  d.deaths.length = Math.min(d.deaths.length, JR_DEATHS);
}
/* Do vua duoc nhat (cham tay hoac auto): thong ke theo do hiem. r4/r5 (Hoang Kim / Bach Kim) cong chung nhom Tim+. */
export function jrDrop(it) {
  const d = jr(); if (!d || !it) return;
  if (it.set) d.set++;
  else if ((it.r | 0) >= 3) d.r3++;
  else if (it.r === 2) d.r2++;
  else d.other++;
}
export function jrModal() {
  jr();
  const j = S.journal || { days: {} }, keys = Object.keys(j.days).sort().reverse();
  const per = (v, s) => s > 60 ? fmt(v / s * 3600) : '–';
  const rows = keys.map(k => { const d = j.days[k]; return `<div class="qrow"><span><b>${k === localISODay() ? 'Hôm nay' : k}</b><small>${Math.round(d.sec / 60)} phút · ${fmt(d.kills)} quái · gục ${d.deathN || d.deaths.length}</small></span><small>${per(d.xp, d.sec)} kn/giờ<br>${per(d.gold, d.sec)} lượng/giờ</small><small>Trắng/Xanh ${d.other || 0} · Vàng ${d.r2} · Tím+ ${d.r3} · Bộ ${d.set}</small></div>`; }).join('');
  const dead = keys.flatMap(k => j.days[k].deaths).slice(0, JR_DEATHS).map(x => `<div class="row"><small>${new Date(x.at).toLocaleString('vi-VN')} · cấp ${x.lvl}, ải ${x.stage}: ${esc(x.why)}</small></div>`).join('');
  modal(`<h3>Sổ tay <small>7 ngày gần nhất</small></h3><p class="desc">Thống kê theo thời gian chiến đấu thật (không tính lúc ở thành / Luyện Công / offline).</p>${rows || '<small class="dim">Chưa có dữ liệu</small>'}
    <h3>Lần gục gần đây</h3><div class="card">${dead || '<small class="dim">Chưa gục lần nào</small>'}</div>`);
}

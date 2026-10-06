// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { clamp } from './core';
import { S, save } from './save';
import { closeModal, modal, refresh } from './ui';
import { R } from './combat';
import { RW } from './rewards';

/* ======================= THAP II (port tu js/tower2-balance.js + depth.js) =======================
   Bang chi so goc cua ho can theo nhan vat cap 550 cua ho — minh ap dung TY LE multiplicative
   giu nguyen hinh the tien trinh: tang 1 = x1, tang 2000 = x71 mau / x15 sat thuong (tinh anh).
   Mo khoa o chuyen sinh 5 (TS5); diem TS6-TS10 chi co tac dung trong Thap II. */
'use strict';
export const TOWER2 = { reborn: 5, maxFloor: 2000, lossFloors: 10, baseLevel: 200, endLevel: 325, move: 1.25, regen: 0.012 };
const ANCHORS = [
  [1, 1, 1, 1, 1], [5, 1.071, 1.1, 1.033, 1.05], [10, 1.286, 1.3, 1.083, 1.15],
  [25, 1.643, 1.9, 1.25, 1.4], [50, 2.143, 3.0, 1.5, 1.8], [100, 3.214, 4.8, 1.917, 2.4],
  [250, 5.714, 10.0, 2.833, 3.6], [500, 10.714, 24.0, 4.333, 5.5], [1000, 25.0, 64.0, 7.0, 9.0],
  [1500, 46.429, 130.0, 10.833, 14.0], [1990, 70.0, 230.0, 14.833, 19.8], [2000, 71.429, 240.0, 15.0, 20.0],
];
export function t2mul(floor, cls) {
  const f = Math.max(1, Math.min(TOWER2.maxFloor, Math.floor(Number(floor) || 1)));
  const i = ANCHORS.findIndex(row => row[0] >= f), hi = ANCHORS[i], lo = ANCHORS[Math.max(0, i - 1)];
  const k = hi[0] === lo[0] ? 0 : (f - lo[0]) / (hi[0] - lo[0]);
  const at = col => lo[col] * Math.pow(hi[col] / lo[col], k);
  const boss = cls === 'boss', normal = cls === 'normal';
  return { hp: at(boss ? 2 : 1) / (normal ? 2.5 : 1), dmg: at(boss ? 4 : 3) / (normal ? 1.3 : 1) };
}
export const tower2Unlocked = () => RW().stat.reborn >= TOWER2.reborn;
export const tower2Floor = f => clamp(Math.floor(+f) || 1, 1, TOWER2.maxFloor);
export const tower2Level = f => Math.min(99, Math.round(TOWER2.baseLevel + (tower2Floor(f) - 1) * (TOWER2.endLevel - TOWER2.baseLevel) / (TOWER2.maxFloor - 1)));
/* Diem TS6-TS10 (chi tac dung trong Thap II) */
const TOWER2_OPTIONS = [
  { k: 'son', n: 'Khai Sơn', d: 'Mỗi điểm: +2% sát thương lên quái Tháp II; tối đa +10%.' },
  { k: 'thap', n: 'Hộ Tháp', d: 'Mỗi điểm: giảm 1% sát thương nhận từ quái Tháp II; tối đa giảm 5%.' },
  { k: 'khi', n: 'Hồi Khí', d: 'Mỗi điểm: thêm 2% hồi sinh lực sau tầng Tháp II (cộng vào 30% gốc, tối đa 40%).' },
];
function tp2Stacks() {
  const t = (S && S.rw && S.rw.tp2) || {}, st = {};
  for (const k of ['son', 'thap', 'khi']) st[k] = clamp(Math.floor(+t[k]) || 0, 0, 5);
  return st;
}
export const tp2Pending = () => Math.max(0, (S.rw && S.rw.tp2Pend) | 0);
function tp2Pick(k) {
  const r = RW(), st = tp2Stacks(), used = Object.values(st).reduce((n, v) => n + v, 0);
  if (!TOWER2_OPTIONS.some(t => t.k === k) || !(r.tp2Pend > 0) || st[k] >= 5 || used >= clamp(r.stat.reborn - 5, 0, 5)) return false;
  r.tp2 = r.tp2 || {}; r.tp2[k] = st[k] + 1; r.tp2Pend--; save(); return true;
}
export function tower2Bonuses(e) {
  if (!R.tower || R.tower.id !== 2 || (e && e.towerId !== 2)) return { dmg: 1, taken: 1, heal: 0 };
  const st = tp2Stacks(); return { dmg: 1 + 0.02 * st.son, taken: 1 - 0.01 * st.thap, heal: 0.02 * st.khi };
}
export function tower2OptionModal() {
  if (!tp2Pending()) return;
  const st = tp2Stacks();
  modal(`<h3>Option Tháp II <small>còn ${tp2Pending()} điểm</small></h3><p class="desc">TS6–TS10: mỗi lần chuyển sinh từ lần 6 nhận một điểm nâng cao, tối đa 5 điểm. Chỉ có tác dụng trong Tháp II. Phân bổ lâu dài, chưa có tẩy điểm.</p>
    ${TOWER2_OPTIONS.map(t => `<div class="card"><b>${t.n} ${st[t.k]}/5</b><p class="dim small">${t.d}</p><div class="btnrow"><button class="btn" data-tp2="${t.k}" ${st[t.k] >= 5 ? 'disabled' : ''}>Thêm 1 điểm</button></div></div>`).join('')}`, () => {
    document.querySelectorAll('#mBody [data-tp2]').forEach(b => b.onclick = () => {
      if (!tp2Pick(b.dataset.tp2)) return;
      closeModal(true); refresh(); if (tp2Pending()) tower2OptionModal();
    });
  }, true);
}

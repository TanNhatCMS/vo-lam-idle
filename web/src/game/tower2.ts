// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { clamp, MAX_LEVEL } from './core';
import { localISODay } from './journal';
import { S, save } from './save';
import { closeModal, log, modal, refresh, toast } from './ui';
import { R } from './combat';
import { RW, towerExit } from './rewards';

/* ======================= THAP II (port tu js/tower2-balance.js + depth.js) =======================
   Bang chi so goc cua ho can theo nhan vat cap 550 cua ho — minh ap dung TY LE multiplicative
   giu nguyen hinh the tien trinh: tang 1 = x1, tang 2000 = x71 mau / x15 sat thuong (tinh anh).
   Mo khoa o chuyen sinh 5 (TS5); diem TS6-TS10 chi co tac dung trong Thap II. */
'use strict';
export const TOWER2 = { reborn: 5, maxFloor: 2000, lossFloors: 10, baseLevel: 200, endLevel: 325, move: 1.625, regen: 0.012, tries: 1000 };
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
/* Dang trong tranh Thap II (rewards.js: towerIs2) — dung lam dieu kien cho cac hook do bo Thap II. */
export const towerIs2 = () => !!R.tower && R.tower.id === 2;
export const tower2Floor = f => clamp(Math.floor(+f) || 1, 1, TOWER2.maxFloor);
export const tower2Level = f => Math.min(MAX_LEVEL, Math.round(TOWER2.baseLevel + (tower2Floor(f) - 1) * (TOWER2.endLevel - TOWER2.baseLevel) / (TOWER2.maxFloor - 1)));
/* Diem TS6-TS10 (chi tac dung trong Thap II) */
export const TOWER2_OPTIONS = [
  { k: 'son', n: 'Khai Sơn', d: 'Mỗi điểm: +2% sát thương lên quái Tháp II; tối đa +10%.' },
  { k: 'thap', n: 'Hộ Tháp', d: 'Mỗi điểm: giảm 1% sát thương nhận từ quái Tháp II; tối đa giảm 5%.' },
  { k: 'khi', n: 'Hồi Khí', d: 'Mỗi điểm: thêm 2% hồi sinh lực sau tầng Tháp II (cộng vào 30% gốc, tối đa 40%).' },
];
export function tp2Stacks() {
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
  modal(`<h3>Option Tháp II <small>còn ${tp2Pending()} điểm</small></h3><p class="desc">TS6–TS10: mỗi lần chuyển sinh nhận một điểm nâng cao, tối đa 5 điểm. Chỉ có tác dụng trong Tháp II. Phân bổ lâu dài, chưa có tẩy điểm.</p>
    ${TOWER2_OPTIONS.map(t => `<div class="card"><b>${t.n} ${st[t.k]}/5</b><p class="dim small">${t.d}</p><div class="btnrow"><button class="btn" data-tp2="${t.k}" ${st[t.k] >= 5 ? 'disabled' : ''}>Thêm 1 điểm</button></div></div>`).join('')}`, () => {
    document.querySelectorAll('#mBody [data-tp2]').forEach(b => b.onclick = () => {
      if (!tp2Pick(b.dataset.tp2)) return;
      closeModal(true); refresh(); if (tp2Pending()) tower2OptionModal();
    });
  }, true);
}

/* ======================= HE THONG CHUNG THAP I / II (port tu bundle v107) =======================
   Thap I: cap 10 (hoac da chuyen sinh), 1.000 luot/tuan, quai cap 10+4×tang, toc do ×1.3.
   Thap II: TS5, 1.000 luot/tuan, 2.000 tang, quai cap 200–325, toc do ×1.625.
   Thuong (EXP/loot/qua tang) chi nhan khi VUOT QUA KHOAC LUC — gom vao pend[], trao khi qua tang. */
export const TOWER_TRIES = 1000;                 // Jy — luot vao Thap I / tuan
export const TOWER_RESET_COST = 300;             // Qy — Phúc Duyên reset tuần + tiến độ Tháp II
export const TOWER_MIN_LVL = 10;                 // jy — cấp tối thiểu Tháp I (hoặc đã chuyển sinh)
export const TOWER_MOVE = 1.3;                   // Zy — quái Tháp I nhanh hơn 30%
export const TOWER_SET_TIER200 = 50;             // lo — từ tầng 50 có thêm 1% bộ cấp 200
const TOWER_STALL_SEC = 45, TOWER_STALL_PCT = 0.01;   // Gl, Kl — 45s phải giảm >1% tổng máu
/* Bù thử thách Bố Y: quái yếu đi theo tháp (nguồn JX_TOWER_CHALLENGE_BALANCE.white) */
export const TOWER_WHITE_BALANCE = { 1: { hp: 0.7, dmg: 0.7 }, 2: { hp: 0.4, dmg: 0.5 } };

export const towerName = id => id === 2 ? 'Tháp II' : 'Tháp I';                                   // tb
export const towerBestKey = id => id === 2 ? 'tower2Best' : 'towerBest';                          // nb
export const towerRebornOk = () => (RW().stat.reborn || 0) >= TOWER2.reborn;                      // rb
export const towerEnterLvlOk = lvl => lvl >= TOWER_MIN_LVL || (RW().stat.reborn || 0) > 0;        // Ny
export const towerFloorClamp = f => clamp(Math.floor(+f) || 1, 1, TOWER2.maxFloor);               // ib
export const towerAnchorLevel = f => Math.round(TOWER2.baseLevel + (towerFloorClamp(f) - 1) * (TOWER2.endLevel - TOWER2.baseLevel) / (TOWER2.maxFloor - 1));  // ab
export const towerLevelCap = f => Math.min(MAX_LEVEL, towerAnchorLevel(f));                         // ob
/* Con trỏ tiếp tục Tháp II: lưu tower2Floor, mặc định kỷ lục+1, luôn nằm trong [1, 2000] */
export function tower2Continue() {
  const r = RW();
  r.tower2Floor = towerFloorClamp(r.tower2Floor == null ? (r.stat.tower2Best || 0) + 1 : r.tower2Floor);
  return r.tower2Floor;
}
export const tower2Conquered = () => (RW().stat.tower2Best || 0) >= TOWER2.maxFloor;                // cb
export const towerInRecord = () => !!R.tower && R.tower.floor > (RW().stat[towerBestKey(R.tower.id || 1)] || 0);  // pb

/* ---------- biến thể tuần riêng của Tháp (3 luật, nguồn xC — khác hệ 4 luật của Tống Kim) ---------- */
export const TOWER_WEEK_MODS = [
  { k: 'armor', n: 'Giáp dày', d: 'quái kháng mọi nguyên tố +25%' },
  { k: 'rage', n: 'Cuồng bạo', d: 'quái đánh đau hơn (+30%) nhưng yếu máu hơn (−20%)' },
  { k: 'regen', n: 'Hồi huyết', d: 'quái hồi 1,2% máu tối đa mỗi giây' },
];
export const towerWeekKey = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localISODay(d); };  // ub — thứ Hai đầu tuần
function towerWeekSeed() { let h = 0; for (const c of towerWeekKey()) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }  // SC
export function towerWeekMods() {   // CC — 2 luật/tuần, không trùng
  const h = towerWeekSeed(), a = h % TOWER_WEEK_MODS.length, b = (a + 1 + (h >>> 3) % (TOWER_WEEK_MODS.length - 1)) % TOWER_WEEK_MODS.length;
  return { list: [TOWER_WEEK_MODS[a], TOWER_WEEK_MODS[b]] };
}
export const towerWeekModHas = k => towerWeekMods().list.some(m => m.k === k);                    // wC
export function towerWeekModsText() { return towerWeekMods().list.map(m => `<b>${m.n}</b>: ${m.d}`).join(' · '); }  // TC
export function applyTowerWeekMod(e) {   // EC
  if (towerWeekModHas('armor')) for (const k in e.res) e.res[k] = Math.min(85, (e.res[k] || 0) + 25);
  if (towerWeekModHas('rage')) { e.dmg *= 1.3; e.hp = e.max = e.max * 0.8; }
  if (towerWeekModHas('regen')) e.regen = TOWER2.regen;
}
export function applyTowerBalance(e) {   // JX_TOWER_CHALLENGE_BALANCE.apply — Bố Y bù sức quái
  if (!(S && S.chal === 'white') || !R.tower) return;
  const b = TOWER_WHITE_BALANCE[R.tower.id || 1];
  if (b) { e.hp = e.max = e.max * b.hp; e.dmg *= b.dmg; }
}

/* ---------- lượt tuần (r.tw / r.tw2 = {week, n}, reset khi qua thứ Hai) ---------- */
export function towerWeekState(id) {   // db
  const r = RW(), key = towerWeekKey(), k = id === 2 ? 'tw2' : 'tw';
  if (!r[k] || r[k].week !== key) r[k] = { week: key, n: 0 };
  r[k].n = clamp(Math.floor(+r[k].n) || 0, 0, id === 2 ? TOWER2.tries : TOWER_TRIES);
  return r[k];
}

/* ---------- stall: 45 giây phải giảm >1% tổng máu quái, không thì tự rời tháp (nguồn Jl/ql) ---------- */
export function towerProgressReset() {   // ql — gọi khi vào tầng / đợt quái mới
  R.stall = 0;
  if (R.tower) R.tower.progress = {
    floor: R.tower.floor, enemies: R.enemies, elapsed: 0,
    hp: R.enemies.reduce((n, e) => n + Math.max(0, e.hp), 0),
    max: R.enemies.reduce((n, e) => n + (e.max || 0), 0),
  };
}
export function towerStallTick(dt) {   // Jl — chạy mỗi tick khi đang trong tháp
  if (!R.tower || !R.enemies.length) return;
  let t = R.tower.progress;
  if (!t || t.floor !== R.tower.floor || t.enemies !== R.enemies) { towerProgressReset(); t = R.tower.progress; }
  t.elapsed += dt; R.stall = t.elapsed;
  if (t.elapsed < TOWER_STALL_SEC) return;
  const hp = R.enemies.reduce((n, e) => n + Math.max(0, e.hp), 0);
  if (t.hp - hp <= t.max * TOWER_STALL_PCT) {
    log(`<span class="dim">45 giây không giảm được máu quái đáng kể, rời tháp.</span>`);
    towerExit(false, false, 'timeout');
    return;
  }
  t.hp = hp; t.elapsed = 0; R.stall = 0;
}

/* ---------- reset tuần + tiến độ Tháp II: 300 Phúc Duyên (nguồn fb) ---------- */
export function towerResetModal() {
  if (R.tower || R.tk || R.tyvo) return;
  const r = RW();
  if (r.fd < TOWER_RESET_COST) { toast(`Cần ${TOWER_RESET_COST} Phúc Duyên`); return; }
  modal(`<h3>Reset Tháp II?</h3>
    <p class="desc">Thao tác này tốn <b>${TOWER_RESET_COST} Phúc Duyên</b>, làm mới lượt tuần, xóa kỷ lục và tầng đã vượt, rồi đưa tiến độ về tầng 1. Không thể hoàn tác.</p>
    <div class="card"><b>Sau khi reset</b><br><small class="dim">Lượt tuần: 0/${TOWER2.tries.toLocaleString('vi-VN')} · Kỷ lục: tầng 0 · Tiến độ: tầng 1</small></div>
    <div class="btnrow"><button class="btn red" id="gTower2ResetConfirm">Reset · ${TOWER_RESET_COST} Phúc Duyên</button><button class="btn" id="gTower2ResetCancel">Để sau</button></div>`, () => {
    const q = s => document.querySelector(s);
    q('#gTower2ResetCancel').onclick = () => closeModal(true);
    q('#gTower2ResetConfirm').onclick = () => {
      if (R.tower || R.tk || R.tyvo) { toast('Hãy kết thúc hoạt động hiện tại trước khi reset Tháp II'); closeModal(true); return; }
      const u = RW();
      if (u.fd < TOWER_RESET_COST) { toast(`Cần ${TOWER_RESET_COST} Phúc Duyên`); closeModal(true); return; }
      u.fd -= TOWER_RESET_COST;
      u.tw2 = { week: towerWeekKey(), n: 0 };
      u.stat.tower2Best = 0;
      u.tower2Floor = 1;
      save();
      toast(`Đã reset lượt tuần và tiến độ Tháp II về tầng 1 · còn ${u.fd} Phúc Duyên`);
      closeModal(true); refresh();
    };
  }, true);
}

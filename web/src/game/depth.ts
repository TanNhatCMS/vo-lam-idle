// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { FAC, J, MON, SERIES, ZONES, counters, esc, fmt } from './core';
import { localISODay } from './journal';
import { heroSeries } from './stats';
import { R, recalc } from './combat';
import { pack, S, save, unpack } from './save';
import { closeModal, log, modal, refresh, toast } from './ui';
import { RW } from './rewards';
import { buildN } from './builds';
import { stashMax } from './stash';
import { TOWER2_SET_ROWS } from './sets';

/* ======================= CHIEU SAU + CHOI LAI =======================
   Port tu js/depth.js ban vinarpg (bo phan Thap II + bien the tuan — can port ca
   survival Thap II moi lam duoc): tam phap chuyen sinh, thu thach nhan vat,
   danh vong gia toc dung chung 3 slot, bach khoa hoan thanh vung. */
'use strict';

/* ---------- tam phap chuyen sinh ---------- */
export const TAM_PHAP = [
  { k: 'ho', n: 'Hộ Thể', d: 'mỗi cấp: sinh lực +6%, hóa giải 1% sát thương nhận' },
  { k: 'bao', n: 'Thám Bảo', d: 'mỗi cấp: tỉ lệ rơi đồ +5%, may mắn +3' },
  { k: 'tru', n: 'Phá Trùm', d: 'mỗi cấp: sát thương lên tinh anh / trùm +6%' },
];
export function tpStacks() { const t = (S && S.rw && S.rw.tp) || {}; return { ho: t.ho || 0, bao: t.bao || 0, tru: t.tru || 0 }; }
export const tpPending = () => ((S.rw && S.rw.tpPend) | 0);
function tpPick(k) {
  const r = RW(), st = tpStacks(), used = Object.values(st).reduce((n, v) => n + v, 0);
  if (!(r.tpPend > 0) || !TAM_PHAP.some(t => t.k === k) || st[k] >= 5 || used >= Math.min(5, r.stat.reborn)) return false;
  r.tp = r.tp || {}; r.tp[k] = (r.tp[k] || 0) + 1; r.tpPend--; R.dirty = true; save(); return true;
}
export function tamPhapModal() {
  if (!tpPending()) return;
  const st = tpStacks();
  modal(`<h3>Chọn tâm pháp <small>còn ${tpPending()} lượt</small></h3><p class="desc">TS1–TS5: mỗi lần chuyển sinh nhận một điểm; chọn trùng thì cộng dồn. Phân bổ lâu dài. Hiện có: ${TAM_PHAP.map(t => `${t.n} ×${st[t.k]}`).join(' · ')}.</p>
    ${TAM_PHAP.map(t => `<div class="card"><b>${t.n}</b> <small class="dim">${t.d}</small><div class="btnrow"><button class="btn" data-tp="${t.k}">Chọn</button></div></div>`).join('')}`, () => {
    document.querySelectorAll('#mBody [data-tp]').forEach(b => b.onclick = () => { tpPick(b.dataset.tp); closeModal(true); recalc(); refresh(); if (tpPending()) tamPhapModal(); });
  }, true);
}

/* ---------- thu thach nhan vat ---------- */
export const CHALLENGES = [
  { k: '', n: 'Thường', d: 'Không thêm luật' },
  { k: 'nopot', n: 'Bất dược', d: 'Không dùng thuốc (cả tự động và bấm tay)' },
  { k: 'white', n: 'Bố y', d: 'Chỉ mặc đồ Trắng và Xanh (không Vàng / Tím / đồ bộ)' },
  { k: 'hard', n: 'Huyết chiến', d: 'Độ khó Khó cố định, không đổi được' },
];
export const chalOf = () => (S && S.chal) || '';
export const chalName = () => (CHALLENGES.find(c => c.k === chalOf()) || CHALLENGES[0]).n;
/* Man hinh chon luat khi tao nhan vat (sau khi chon mon phai) */
export function challengeModal(key, after) {
  const cards = CHALLENGES.map(c => `<button class="btn${c.k ? '' : ' on'}" data-chal="${c.k}" style="justify-content:flex-start;text-align:left"><b>${c.n}</b><small class="dim">${c.d}</small></button>`);
  modal(`<h3>Chọn thử thách <small>tùy chọn</small></h3><p class="desc">Luật thử thách gắn với nhân vật lúc tạo, không đổi được về sau. Đạt cấp 99 với luật đang bật nhận danh hiệu riêng.</p><div class="challenges">${cards.join('')}</div>`, () => {
    document.querySelectorAll('#mBody [data-chal]').forEach(b => b.onclick = () => { closeModal(true); after(CHALLENGES.some(c => c.k === b.dataset.chal) ? b.dataset.chal : ''); });
  }, true);
}

/* ---------- danh vong gia toc (dung chung 3 slot, co chu ky) ---------- */
const CLAN_KEY = 'jxidle_clan';
const CLAN_EVENTS = [
  ['lv60', 2, 'Một nhân vật đạt cấp 60', () => S.lvl >= 60],
  ['lv99', 4, 'Một nhân vật đạt cấp 99', () => S.lvl >= 99],
  ['reborn1', 8, 'Chuyển sinh lần đầu', () => (RW().stat.reborn || 0) > 0],
  ['tower50', 6, 'Chinh phục tầng 50 Tháp thử thách', () => (RW().stat.towerBest | 0) >= 50],
  ['chal', 10, 'Đạt cấp 99 ở một thử thách nhân vật', () => ['nopot', 'white', 'hard'].some(k => RW().ach['chal_' + k] && chalOf() === k)],
  ['dex8', 4, 'Bách khoa: hạ đủ quái ở 8 vùng', () => dexZones() >= 8],
  ['dex16', 8, 'Bách khoa: hạ đủ quái mọi vùng', () => dexZones() >= ZONES.length],
  ['dexs3', 4, 'Bách khoa: đủ 3 bộ Hoàng Kim', () => dexSetsDone() >= 3],
  ['dexs10', 10, 'Bách khoa: đủ 10 bộ Hoàng Kim', () => dexSetsDone() >= 10],
];
const CLAN_PERKS = [[10, 'stash', '+10 ô kho chung'], [25, 'build', '+1 bộ võ học'], [45, 'stash', '+10 ô kho chung'], [70, 'build', '+1 bộ võ học']];
function clanRead() {
  let raw = null; try { raw = localStorage.getItem(CLAN_KEY); } catch (e) { return { rep: 0, done: {} }; }
  if (!raw) return { rep: 0, done: {} };
  try { const u = unpack(raw); if (u.ok && u.state && typeof u.state === 'object') return { rep: Math.max(0, +u.state.rep | 0), done: u.state.done && typeof u.state.done === 'object' ? u.state.done : {} }; } catch (e) { /* hong */ }
  return { rep: 0, done: {} };
}
function clanWrite(c) { try { localStorage.setItem(CLAN_KEY, pack(c)); } catch (e) { /* bo qua */ } }
export const clanRep = () => clanRead().rep;
export const clanPerk = k => CLAN_PERKS.filter(([v, kind]) => kind === k && clanRep() >= v).length;
export function clanCheck() {
  if (!S || !S.fac) return 0;
  if (!S.cid) S.cid = Math.random().toString(36).slice(2, 10);
  const c = clanRead(); let add = 0;
  for (const [k, pts, , ok] of CLAN_EVENTS) { const key = S.cid + ':' + k; if (!c.done[key] && ok()) { c.done[key] = 1; c.rep += pts; add += pts; } }
  if (add) { clanWrite(c); log(`Danh vọng gia tộc +${add}`); }
  return add;
}
export function clanModal() {
  const c = clanRead(), next = CLAN_PERKS.find(p => c.rep < p[0]);
  modal(`<h3>Gia tộc <small>danh vọng ${c.rep}</small></h3><p class="desc">Danh vọng gia tộc dùng chung cho cả 3 slot nhân vật. Chỉ mở <b>tiện ích</b> (kho, bộ võ học), không cộng chỉ số, nên chơi nhiều phái đều có lợi.</p>
    <div class="card stats"><span>Ô kho chung</span><span>${stashMax()}</span><span>Bộ võ học</span><span>${buildN()}</span><span>Mốc kế</span><span>${next ? next[0] + ' danh vọng' : 'Đã mở hết'}</span></div>
    <h3>Cách tăng</h3>${CLAN_EVENTS.map(([k, pts, txt]) => `<div class="qrow"><span>${txt}</span><small>+${pts}</small><small>${c.done[(S.cid || '') + ':' + k] ? '✔' : ''}</small></div>`).join('')}`);
}

/* ---------- bach khoa hoan thanh vung (S.seen danh quai da ha) ---------- */
export function dexMark(tid) { S.seen = S.seen || {}; if (!S.seen[tid]) S.seen[tid] = 1; }
const dexZoneDone = z => [...z.m, z.boss].filter(t => MON[t]).every(t => (S.seen || {})[t]);
export const dexZones = () => ZONES.filter(dexZoneDone).length;

/* ---------- sưu tập bộ đồ (F9 — S.setSeen danh do bo da co) ---------- */
/* Goi khi do bo vao tay: addItem (ui.ts) va noi ghép/chế đồ bộ (recipes.ts). */
export function dexSet(n) { S.setSeen = S.setSeen || {}; S.setSeen[n.replace(/^\[[^\]]*\]\s*/, '')] = 1; }
/* Nhom cac bo Hoàng Kim / Thiên Cực cua mon phai dang choi (bo khong yeu cau phai bi loai). */
export function dexSetGroups() {
  const fid = FAC[S.fac] ? FAC[S.fac].id : -1, g = new Map();
  for (const r of [...J.sets.gold, ...TOWER2_SET_ROWS]) { if ((r.req.find(q => q[0] === 39) || [0, -1])[1] !== fid || /^\[/.test(r.n)) continue; (g.get(r.grp) || g.set(r.grp, new Set()).get(r.grp)).add(r.n); }
  return [...g.values()];
}
export const dexSetsDone = () => dexSetGroups().filter(names => [...names].every(n => (S.setSeen || {})[n])).length;

/* ---------- biến thể tuần (port từ depth.js — áp dụng cho Tống Kim; Tháp II port sau) ---------- */
export const WEEK_MODS = [
  { k: 'armor', n: 'Giáp dày', d: 'quái kháng mọi nguyên tố +25%' },
  { k: 'rage', n: 'Cuồng bạo', d: 'quái đánh đau hơn (+30%) nhưng yếu máu hơn (−20%)' },
  { k: 'regen', n: 'Hồi huyết', d: 'quái hồi 1,2% máu tối đa mỗi giây' },
  { k: 'elem', n: 'Hệ thịnh', d: 'toàn bộ quái cùng một hệ; hệ khắc hệ đó được thưởng ×1,25' },
];
export const weekKey = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localISODay(d); };   // thu Hai dau tuan, gio may
function weekSeed() { let h = 0; for (const c of weekKey()) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
export function weekMods() { const h = weekSeed(), a = h % WEEK_MODS.length, b = (a + 1 + (h >>> 3) % (WEEK_MODS.length - 1)) % WEEK_MODS.length; return { list: [WEEK_MODS[a], WEEK_MODS[b]], series: (h >>> 5) % 5 }; }
export const weekModHas = k => weekMods().list.some(m => m.k === k);
export function weekModsText() { const w = weekMods(); return w.list.map(m => `<b>${m.n}</b>: ${m.d}${m.k === 'elem' ? ' (hệ ' + SERIES[w.series] + ')' : ''}`).join(' · '); }
export function weekRewardMul() { return weekModHas('elem') && counters(heroSeries(), weekMods().series) ? 1.25 : 1; }
export function applyWeekMod(e) {
  if (weekModHas('armor')) for (const k in e.res) e.res[k] = Math.min(85, (e.res[k] || 0) + 25);
  if (weekModHas('rage')) { e.dmg *= 1.3; e.hp = e.max = e.max * 0.8; }
  if (weekModHas('regen')) e.regen = 0.012;
  if (weekModHas('elem')) e.series = weekMods().series;
}

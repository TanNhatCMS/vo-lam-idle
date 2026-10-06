// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { MON, SERIES, ZONES, counters, esc, fmt } from './core';
import { R, recalc } from './combat';
import { pack, S, save, unpack } from './save';
import { closeModal, log, modal, refresh, toast } from './ui';
import { RW } from './rewards';
import { buildN } from './builds';
import { stashMax } from './stash';

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

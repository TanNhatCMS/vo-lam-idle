// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { uiSfx } from './audio';
import {
  H,
  R,
  alive,
  heal,
  makeEnemy,
  stageLevel,
  zoneIdx,
  zoneOf,
} from './combat';
import { backFromTown } from './control';
import {
  $,
  DETAIL_SLOT,
  FAC,
  INV_MAX,
  J,
  MAX_LEVEL,
  MON,
  PET_EQ_BUFF,
  PET_GEAR_POWER,
  PET_LV,
  PET_SLOTS,
  RAR_COL,
  SERIES,
  SERIES_COL,
  SERIES_ELEM,
  STAGES,
  ZONES,
  attrName,
  attrText,
  clamp,
  counters,
  enhMul,
  esc,
  escRich,
  fmt,
  inWorld,
  irnd,
  pick,
  rnd,
  wpick,
} from './core';
import { itemPower, makeItem, sexPart } from './loot';
import {
  MON_SCALE,
  NAME_COL,
  addText,
  dirOf,
  drawAnim,
  img,
  label,
  setAct,
  stepAct,
} from './render';
import { S, save } from './save';
import { enoughToActive, makeSetItem } from './sets';
import { potStock } from './shop';
import { addAttr, autoSpendAttrs, sexReqOk } from './stats';
import { addItem, closeModal, findItem, itemHTML, log, modal, refresh, setInvDirty, toast } from './ui';
import { matAdd } from './recipes';
import { WB_EVERY, WB_FIRST, WB_MIN_LV } from './worldboss';

/* ======================= PHAN THUONG NGOAI GAME GOC (docs/DE_XUAT.md) =======================
   1 diem danh 7/30 ngay · 2 nhiem vu ngay · 3 thanh tuu + danh hieu · 4 trum Hoang Kim dinh ky · 5 thuong offline theo moc
   6 thap thu thach · 7 chuyen sinh (toi da 5 lan) · 8 dong hanh · 9 su kien theo mua · 10 ruong Phuc Duyen */
'use strict';
const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const today = () => dayKey(new Date());
const weekKey = d => { const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()); t.setDate(t.getDate() - (t.getDay() + 6) % 7); return dayKey(t); };   // Thu Hai cua tuan: doi tuan -> key doi
export const GB_EVERY = 1800, GB_RETRY = 300;     // trum Hoang Kim: moi 30 phut choi; thua thi 5 phut sau quay lai
const REBORN_LV = MAX_LEVEL, REBORN_MAX = 5;   // chuyen sinh o cap toi da (99)
const FD_COST = 10;
export function RW() { // trang thai phan thuong trong file luu (tao / bo sung truong khi nap file cu)
  const r = S.rw || (S.rw = {});
  r.stat = Object.assign({ kills: 0, bosses: 0, goldBoss: 0, picked: 0, towerBest: 0, reborn: 0, chests: 0, tokens: 0, wboss: 0 }, r.stat || {});
  r.login = Object.assign({ last: '', streak: 0, total: 0, got: {}, claimed: true }, r.login || {});
  r.ach = r.ach || {}; r.title = r.title || ''; r.fd = r.fd || 0; if (r.gbT == null) r.gbT = GB_EVERY;
  r.pet = r.pet || null;
  if (r.pet && typeof r.pet === 'object') { if (!r.pet.eq || typeof r.pet.eq !== 'object') r.pet.eq = {}; }   // dong hanh: o trang bi (save cu chua co -> tu bo sung)
  /* Boss Thế Giới + Vỏ Sò: bổ sung TRÊN TẠI object cũ (không thay bằng bản sao như stat/login ở trên)
     vì worldboss wbVictory / spinSo giữ tham chiếu w/so qua nhiều lần gọi RW() giữa các mutation. */
  const wbHad = !!(r.wb && typeof r.wb === 'object');
  if (!wbHad) r.wb = {};
  if (r.wb.t != null) { r.wb.next = Date.now() + r.wb.t * 1000; delete r.wb.t; }   // migrate save cũ (t = giây đếm ngược theo thời gian chơi)
  if (r.wb.next == null) r.wb.next = Date.now() + (wbHad ? WB_EVERY : WB_FIRST) * 1000;   // mốc THỜI GIAN THỰC; nhân vật mới: con đầu sau WB_FIRST
  if (!('up' in r.wb)) r.wb.up = null;
  if (!r.so || typeof r.so !== 'object') r.so = {};
  r.so.n = r.so.n || 0; r.so.pity = r.so.pity || 0; r.so.spins = r.so.spins || 0; r.so.day = r.so.day || '';
  r.codes = Object.assign({}, r.codes || {});        // mã quà tặng đã dùng (mỗi nhân vật)
  r.welcomeGot = r.welcomeGot || 0;                  // quà tân thủ đã nhận chưa
  return r;
}

/* ---------- phan thuong chung ---------- */
export function grant(g, why) {
  const out = [];
  if (g.gold) { const v = Math.round(g.gold * (1 + S.lvl / 10)); S.gold += v; out.push(`${fmt(v)} lượng`); }
  if (g.pot) { const st = potStock(g.pot.kind); st[g.pot.tier] = (st[g.pot.tier] || 0) + g.pot.n; out.push(`${g.pot.n} ${g.pot.kind === 'life' ? 'Kim Sáng Dược' : 'Ngưng Thần đan'}`); }
  if (g.fd) { RW().fd += g.fd; out.push(`${g.fd} Phúc Duyên`); }
  if (g.item) { const it = (() => { const d = irnd(0, 9); return makeItem(d, sexPart(d, 0), clamp(Math.round(S.lvl / 12) + 1, 1, 10), g.item); })(); if (it) { if (g.itemR) it.r = g.itemR; addItem(it, true, true, true); out.push(esc(it.n)); } }
  if (g.set) { const it = forceSetItem(); if (it) { addItem(it, true, true); out.push(`<b style="color:${RAR_COL[it.r]}">${esc(it.n)}</b>`); } }
  if (g.pts) { S.attrPts += g.pts; out.push(`${g.pts} điểm tiềm năng`); }
  if (g.so) { const so = RW().so; so.n += g.so; out.push(`+${g.so} Vỏ Sò`); }
  if (g.mat) { matAdd(g.mat.g, g.mat.k, g.mat.n); out.push(`${g.mat.n} ${g.mat.g === 'ht' ? 'Huyền Tinh cấp ' + g.mat.k : g.mat.k}`); }
  if (out.length) { log(`🎁 ${esc(why)}: ${out.join(', ')}`); if (!R.quiet) uiSfx('learn'); save(); }
  return out;
}
function forceSetItem() { // do bo Hoang Kim cua phai, cap yeu cau gan cap nhan vat
  const fid = FAC[S.fac] ? FAC[S.fac].id : -1, cap = S.lvl + 15;
  const req = (r, id) => (r.req.find(q => q[0] === id) || [0, -1])[1];
  const G = J.sets.gold.filter(r => sexReqOk(r.req));
  let pool = G.filter(r => req(r, 39) === fid && req(r, 36) <= cap);
  if (!pool.length) pool = G.filter(r => req(r, 36) <= cap);
  if (!pool.length) pool = G.filter(r => req(r, 39) === fid);
  return pool.length ? makeSetItem('gold', pick(pool), 5) : null;
}

/* ---------- 1. diem danh 7 ngay (vong lap) + moc 10/20/30 ngay ---------- */
const LOGIN7 = [{ gold: 200 }, { pot: { kind: 'life', tier: 2, n: 10 } }, { gold: 400, fd: 5 }, { pot: { kind: 'mana', tier: 2, n: 10 } }, { item: 4 }, { gold: 800, fd: 10 }, { set: 1, fd: 20 }];
const LOGIN30 = { 10: { gold: 3000, pts: 10 }, 20: { set: 1, pts: 20 }, 30: { set: 1, fd: 50, pts: 30 } };
export function loginCheck() {
  if (!S || !S.fac) return;
  const L = RW().login, t = today();
  if (L.last === t) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  L.streak = L.last === dayKey(y) ? L.streak + 1 : 1;
  L.last = t; L.total++; L.claimed = false;
  dailyQuests(true); weeklyQuests(); dotGift();
}
function claimLogin() {
  const L = RW().login; if (L.claimed) return;
  L.claimed = true;
  grant(LOGIN7[(L.streak - 1) % 7], `Điểm danh ngày ${L.streak}`);
  const m = LOGIN30[L.total]; if (m && !L.got[L.total]) { L.got[L.total] = 1; grant(m, `Điểm danh ${L.total} ngày`); }
  achCheck();
}

/* ---------- 1b. qua moc cap (nhan 1 lan, khong nhan lai sau chuyen sinh): chu yeu tieu hao + tien loi,
   chi so vinh vien chi la vai diem tiem nang -> khong lam lech can bang giua cac phai ---------- */
export const LV_MS = [
  [10, { gold: 300, pot: { kind: 'life', tier: 1, n: 10 } }, 'Mở khóa: tháp thử thách'],
  [20, { gold: 600, pot: { kind: 'mana', tier: 2, n: 10 }, fd: 5 }, 'Mở khóa: đồng hành'],
  [30, { item: 4, fd: 5 }, ''],
  [40, { gold: 1500, pot: { kind: 'life', tier: 3, n: 10 }, pts: 3 }, ''],
  [50, { item: 5, fd: 10 }, 'Danh hiệu «Thiếu hiệp»'],
  [60, { gold: 3000, pot: { kind: 'mana', tier: 3, n: 10 }, pts: 3 }, ''],
  [70, { set: 1, fd: 10 }, ''],
  [80, { gold: 5000, pot: { kind: 'life', tier: 4, n: 10 }, pts: 4 }, ''],
  [90, { item: 6, fd: 15 }, ''],
  [95, { set: 1, fd: 20, pts: 5 }, 'Danh hiệu «Đại hiệp»'],
  [97, { gold: 10000, pot: { kind: 'life', tier: 5, n: 20 }, fd: 20 }, ''],
  [99, { set: 1, fd: 30, pts: 5 }, 'Danh hiệu «Tông sư» · mở khóa chuyển sinh'],
];
const TOWER_LV = 10;
const unlocked = lv => S.lvl >= lv || RW().stat.reborn > 0;
function lvMsReady() { const g = RW().lvGot || {}; return LV_MS.filter(([lv]) => S.lvl >= lv && !g[lv]); }
function claimLvMs(lv) {
  const r = RW(), m = LV_MS.find(x => x[0] === lv); r.lvGot = r.lvGot || {};
  if (!m || S.lvl < lv || r.lvGot[lv]) return;
  r.lvGot[lv] = 1; grant(m[1], `Mốc cấp ${lv}`); achCheck(); refreshGift();
}

/* ---------- 2. nhiem vu ngay (4 viec ngau nhien moi ngay) ---------- */
const DQ_POOL = [
  ['kills', 'Hạ {n} quái', lv => 150 + lv * 3], ['bosses', 'Hạ {n} trùm', () => 2], ['picked', 'Nhặt {n} món đồ', () => 8],
  ['stages', 'Vượt {n} ải', () => 5], ['pots', 'Dùng {n} bình thuốc', () => 10], ['tower', 'Leo {n} tầng tháp thử thách', () => 3],
];
function dailyQuests(reset) {
  const r = RW();
  if (!reset && r.dq && r.dq.day === today()) return r.dq;
  const pool = DQ_POOL.filter(q => q[0] !== 'tower' || unlocked(TOWER_LV)).sort(() => Math.random() - 0.5).slice(0, 4);
  r.dq = { day: today(), list: pool.map(([k, t, f]) => ({ k, t: t.replace('{n}', f(S.lvl)), need: f(S.lvl), have: 0, done: false })) };
  return r.dq;
}
export function questTick(k, n = 1) {
  if (!S || !S.fac) return;
  if (k === 'picked') RW().stat.picked += n;
  for (const q of dailyQuests().list) if (q.k === k && !q.done && q.have < q.need) { q.have = Math.min(q.need, q.have + n); if (q.have >= q.need) dotGift(); }
  for (const q of weeklyQuests().list) if (q.k === k && !q.done && q.have < q.need) { q.have = Math.min(q.need, q.have + n); if (q.have >= q.need) dotGift(); }
}
function claimQuest(i) { const q = dailyQuests().list[i]; if (!q || q.done || q.have < q.need) return; q.done = true; grant({ gold: 300, fd: 5 }, `Nhiệm vụ: ${q.t}`); }

/* ---------- 2b. nhiem vu tuan (5 viec ngau nhien, lam moi vao Thu Hai) ---------- */
const WQ_POOL = [
  ['kills', 'Hạ {n} quái', lv => 1200 + lv * 15], ['bosses', 'Hạ {n} trùm', () => 12], ['picked', 'Nhặt {n} món đồ', () => 60],
  ['stages', 'Vượt {n} ải', () => 20], ['pots', 'Dùng {n} bình thuốc', () => 60], ['tower', 'Leo {n} tầng tháp thử thách', () => 12],
];
const WQ_REWARD = { gold: 1500, fd: 20 };
function weeklyQuests(reset) {
  const r = RW(), wk = weekKey(new Date());
  if (!reset && r.wq && r.wq.week === wk) return r.wq;
  const pool = WQ_POOL.filter(q => q[0] !== 'tower' || unlocked(TOWER_LV)).sort(() => Math.random() - 0.5).slice(0, 5);
  r.wq = { week: wk, list: pool.map(([k, t, f]) => ({ k, t: t.replace('{n}', f(S.lvl)), need: f(S.lvl), have: 0, done: false })) };
  return r.wq;
}
function claimWeekQuest(i) { const q = weeklyQuests().list[i]; if (!q || q.done || q.have < q.need) return; q.done = true; grant(WQ_REWARD, `Nhiệm vụ tuần: ${q.t}`); }

/* ---------- 3. thanh tuu + danh hieu (deo 1 danh hieu: cong chi so nho) ---------- */
const ACH = [
  ['lv30', 'Xuất sơn', () => S.lvl >= 30 || RW().stat.reborn > 0, { gold: 1000 }, ['lifemax_p', 3]],
  ['lv50', 'Thiếu hiệp', () => (RW().lvGot || {})[50], { fd: 5 }, ['lifemax_p', 4]],
  ['lv80', 'Danh chấn giang hồ', () => S.lvl >= 80 || RW().stat.reborn > 0, { gold: 5000, pts: 10 }, ['attackspeed_v', 3]],
  ['lv100', 'Đại hiệp', () => (RW().lvGot || {})[95] || (RW().lvGot || {})[100], { fd: 10 }, ['allres_p', 4]],
  ['lv150', 'Tông sư', () => (RW().lvGot || {})[99] || (RW().lvGot || {})[150], { fd: 20 }, ['allres_p', 6]],
  ['k1000', 'Sát thủ', () => RW().stat.kills >= 1000, { fd: 10 }, ['manamax_p', 4]],
  ['k10000', 'Vạn nhân địch', () => RW().stat.kills >= 10000, { set: 1 }, ['attackspeed_v', 5]],
  ['b50', 'Diệt trùm', () => RW().stat.bosses >= 50, { fd: 20 }, ['allres_p', 3]],
  ['zone8', 'Nửa giang sơn', () => S.maxStage >= STAGES / 2, { gold: 8000 }, ['fastwalkrun_p', 5]],
  ['zone16', 'Trường Bạch sơn chủ', () => S.maxStage > STAGES, { set: 1, pts: 20 }, ['lifemax_p', 6]],
  ['setfull', 'Hoàng Kim đủ bộ', () => enoughToActive(S.eq), { fd: 30 }, ['allres_p', 5]],
  ['tower20', 'Leo tháp tầng 20', () => RW().stat.towerBest >= 20, { set: 1 }, ['attackspeed_v', 6]],
  ['reborn1', 'Chuyển sinh', () => RW().stat.reborn >= 1, { fd: 50 }, ['lifemax_p', 8]],
  ['gold5', 'Săn trùm Hoàng Kim', () => RW().stat.goldBoss >= 5, { fd: 20 }, ['lucky_v', 10]],
  ['login30', 'Giang hồ lão luyện', () => RW().login.total >= 30, { set: 1 }, ['manamax_p', 6]],
];
export function achCheck() {
  if (!S || !S.fac) return;
  const r = RW();
  for (const [id, n, ok, reward] of ACH) if (!r.ach[id] && ok()) { r.ach[id] = 1; grant(reward, `Thành tựu «${n}»`); if (!R.quiet) toast(`Thành tựu: ${n}`); dotGift(); }
}
export function titleAttr(A) { // goi tu calc(): chi so cua danh hieu dang deo
  if (!S.rw || !S.rw.title) return;
  const t = ACH.find(a => a[0] === S.rw.title); if (t && S.rw.ach[t[0]]) addAttr(A, t[4][0], [t[4][1], 0, 0]);
}

/* ---------- 4. trum Hoang Kim dinh ky ---------- */
export function goldBossTick(dt) { if (S.fac && !R.town && !R.tower && !R.wbArena) RW().gbT -= dt; }   // wbArena: hai boss không chạy song song
export function goldBossDue() { return !R.tower && RW().gbT <= 0; }
export function spawnGoldBoss() {
  // cap trum khong vuot cap nhan vat + 2 (nhip len cap cham: nhan vat thuong danh ai cao hon cap minh)
  const z = zoneOf(Math.min(S.stage, STAGES)), L = Math.min(stageLevel(S.stage), S.lvl) + 2, [x, y] = inWorld(H.x + 240, H.y - 120);
  const e = makeEnemy(z.boss, L, 'boss', x, y);
  e.hp = e.max = e.max * 2; e.dmg *= 1.15; e.goldBoss = true; e.n = 'Trùm Hoàng Kim · ' + e.n;
  R.enemies.push(e); RW().gbT = GB_EVERY;
  R.banner = { t: 2.5, text: 'Trùm Hoàng Kim xuất hiện!', sub: 'Hạ để nhận đồ Hoàng Kim' }; log('<b style="color:#ffb52e">Trùm Hoàng Kim xuất hiện!</b>');
}

/* ---------- 5. thuong offline theo moc 1 / 4 / 8 gio ---------- */
export function offlineChests(secs) {
  let n = 0;
  if (secs >= 3600) { grant({ gold: 500, pot: { kind: 'life', tier: 2, n: 5 } }, 'Tu luyện 1 giờ'); n++; }
  if (secs >= 4 * 3600) { grant({ gold: 1500, fd: 10 }, 'Tu luyện 4 giờ'); n++; }
  if (secs >= 8 * 3600 - 60) { grant({ set: 1, fd: 20 }, 'Tu luyện 8 giờ'); n++; }
  return n;
}

/* ---------- 6. thap thu thach (Phong Ky) ---------- */
function towerStart() {
  if (R.town) backFromTown();
  R.tower = { floor: Math.max(1, RW().stat.towerBest - 4) }; R.enemies = []; R.corpses = []; R.spawnT = 0.5;
  R.banner = { t: 2, text: `Tháp thử thách · tầng ${R.tower.floor}`, sub: 'Gục ngã là rời tháp' }; closeModal(true);
}
const towerLevel = f => Math.min(MAX_LEVEL, 10 + f * 4);
export function towerSpawn() {
  const f = R.tower.floor, L = towerLevel(f), z = ZONES[Math.min(ZONES.length - 1, Math.floor(f / 3))], boss = f % 5 === 0;
  R.enemies = []; R.stall = 0;
  const n = boss ? 1 : 3 + (f % 3);
  for (let i = 0; i < n; i++) { const [x, y] = inWorld(H.x + rnd(-260, 260), H.y + rnd(-220, 220)); R.enemies.push(makeEnemy(boss ? z.boss : pick(z.m), L, boss ? 'boss' : 'elite', x, y)); }
}
export function towerCleared() {
  const r = RW(), f = R.tower.floor;
  if (f > r.stat.towerBest) { r.stat.towerBest = f; grant(f % 5 === 0 ? { set: 1, fd: 10 } : { gold: 200 * f, fd: 2 }, `Tháp tầng ${f}`); }
  questTick('tower'); achCheck();
  heal(R.P.life * 0.3, true); R.mana = Math.min(R.P.mana, R.mana + R.P.mana * 0.3);
  R.tower.floor++; R.spawnT = 1.5; R.banner = { t: 1.5, text: `Tầng ${R.tower.floor}`, sub: `Quái cấp ${towerLevel(R.tower.floor)}` };
}
export function towerExit(dead) {
  if (!R.tower) return;
  log(`${dead ? 'Gục ở' : 'Rời'} tháp thử thách tầng ${R.tower.floor}. Kỷ lục: ${RW().stat.towerBest}`);
  R.tower = null; R.enemies = []; S.wave = 1; R.spawnT = 0.5; R.zoneShown = null;
}

/* ---------- 7. chuyen sinh (level_exp.txt co 5 cot chuyen sinh -> toi da 5 lan) ---------- */
export function rebornBonus() { const n = S.rw && S.rw.stat ? S.rw.stat.reborn || 0 : 0; return { xp: 0.2 * n, dmg: 0.1 * n }; }
function doReborn() {
  const r = RW();
  if (S.lvl < REBORN_LV || r.stat.reborn >= REBORN_MAX) return;
  if (!confirm('Chuyển sinh: về cấp 1, giữ trang bị và võ công. Tiếp tục?')) return;
  r.stat.reborn++;
  S.lvl = 1; S.xp = 0; S.attr = { str: 0, dex: 0, vit: 0, eng: 0 }; S.attrPts = r.stat.reborn * 50;
  S.stage = 1; S.wave = 1; S.push = true; R.tower = null; R.enemies = []; R.dirty = true; R.zoneShown = null;
  log(`<b class="up">Chuyển sinh lần ${r.stat.reborn}!</b> +${r.stat.reborn * 20}% kinh nghiệm, +${r.stat.reborn * 10}% sát thương`);
  if (S.autoPts === true) autoSpendAttrs();
  achCheck(); closeModal(true); refresh(); save();
}

/* ---------- 8. dong hanh (thu nuoi danh cung, len cap theo quai ha) ---------- */
/* O trang bi cua Dong hanh = dung bo o cua nhan vat, CHI THIEU Ngua (PET_SLOTS o core.ts).
   Mon nao vao o nao theo DETAIL_SLOT; rieng nhan chia 2 o ring1/ring2 nhu nhan vat. */
export function petSlotFor(it) {
  if (!it || !(it.d >= 0 && it.d <= 9)) return null;              // Ngua (d 10) khong cho Dong hanh
  const s = DETAIL_SLOT[it.d]; if (!s) return null;
  if (s !== 'ring') return s;
  const eq = S.rw && S.rw.pet && S.rw.pet.eq;
  if (!eq || !eq.ring1) return 'ring1';
  if (!eq.ring2) return 'ring2';
  return itemPower(eq.ring1) <= itemPower(eq.ring2) ? 'ring1' : 'ring2';
}
/* Mon co vua o slot cu the khong (dung cho bo chon do theo tung o) */
function petFits(slot, it) {
  if (!it || !(it.d >= 0 && it.d <= 9)) return false;
  const s = DETAIL_SLOT[it.d];
  return s === slot || (s === 'ring' && (slot === 'ring1' || slot === 'ring2'));
}
export const petUnlocked = () => !!(S && S.fac) && (S.lvl >= PET_LV || (S.rw && S.rw.stat && S.rw.stat.reborn > 0));
/* Dong hanh dang ra tran (co loai, khong o trong thanh) — dung de giao viec nhat do auto cho pet thay nguoi */
export const petActive = () => { const p = S && S.rw && S.rw.pet; return !!(p && MON[p.tid] && !R.town); };
/* Mon trong tui co gan duoc cho Dong hanh khong (dung o + da mo khoa + da chon loai) — de hien nut trong the Hanh trang */
export function petCanEquip(it) { return !!petSlotFor(it) && petUnlocked() && !!(S.rw && S.rw.pet); }
/* Mon Dong hanh DANG mang o cung loai voi mon dang xem (de hoi "Đồng hành đang mặc:" trong chi tiet do) */
export function petWearingOf(it) {
  const slot = petSlotFor(it); if (!slot) return null;
  return (S.rw && S.rw.pet && S.rw.pet.eq && S.rw.pet.eq[slot]) || null;
}
/* Gan mot mon trong tui cho Dong hanh (goi tu nut trong chi tiet do o the Hanh trang) */
export function petEquipItem(it) {
  const slot = petSlotFor(it); if (!slot) return;
  if (!petUnlocked()) { toast(`Đồng hành mở khóa ở cấp ${PET_LV}.`); return; }
  if (!S.rw || !S.rw.pet) { toast('Chọn loài Đồng hành trước (thẻ Đồng hành).'); return; }
  if (!S.inv.includes(it)) return;
  petEquip(slot, it);
}
/* Tra ve object pet trong file luu, bao dam co o trang bi (mutate tai cho — giu tham chieu nhu wb/so) */
function petCur() { const r = RW(); if (r.pet && typeof r.pet === 'object' && (!r.pet.eq || typeof r.pet.eq !== 'object')) r.pet.eq = {}; return r.pet; }
/* He ngu hanh cua loai: lay he chiem uu the cua vung xuat hien dau tien (sw lech han); vung can bang -> gan theo loai */
const PET_ELEM = {};
export function petElemOf(tid) {
  if (PET_ELEM[tid] != null) return PET_ELEM[tid];
  let e = -1;
  for (const z of ZONES) {
    if (!z.m || z.m.indexOf(tid) < 0) continue;
    const sw = z.sw, mx = Math.max.apply(null, sw), mn = Math.min.apply(null, sw);
    if (mx > mn) { e = sw.indexOf(mx); break; }
  }
  if (e < 0) e = ((tid % 5) + 5) % 5;
  return (PET_ELEM[tid] = e);
}
/* Thong so Dong hanh: cap + he + trang bi (trang bi cong vao NHAN VAT o calc(); tai day cong vao luc danh cua rieng pet) */
export function petStats(p) {
  const lvl = p.lvl || 1, eq = p.eq || {}, elem = petElemOf(p.tid);
  let atk = (6 + lvl * 5) * (1 + lvl * 0.04) * (1 + rebornBonus().dmg);
  let crit = 0, aspd = 0, dmgPct = 0, elemAdd = 0, power = 0;
  for (const k in eq) {
    const it = eq[k]; if (!it || !Array.isArray(it.base)) continue;
    power += itemPower(it); const em = enhMul(it);
    for (const [id, mn] of it.base) if ((id === 28 || id === 29) && k === 'weapon') atk += mn * em;   // vu khi cua pet: cong sat thuong goc
    for (const m of it.mag || []) {
      const nm = attrName(m.a), raw = m.p && m.p[0] != null ? m.p[0] : 0, v = raw === -1 ? 0 : raw;
      if (nm === 'deadlystrike_p' || nm === 'deadlystrikeenhance_p' || nm === 'deadlystrike_v') crit += v;
      else if (nm === 'attackspeed_v' || nm === 'castspeed_v') aspd += v;
      else if (nm === 'addphysicsdamage_p' || nm === 'weapondamageenhance_p') dmgPct += v;
      else if (nm === 'addphysicsdamage_v') atk += v;
      else if (/^add(poison|cold|fire|lighting)damage_v$/.test(nm)) elemAdd += v;
    }
  }
  atk = atk * (1 + dmgPct / 100) + PET_GEAR_POWER * power + elemAdd;
  return { lvl, elem, atk, crit: clamp(crit, 0, 60), cd: clamp(1.2 / (1 + aspd / 100), 0.5, 3), power };
}
function petChoices() {
  const zs = ZONES.slice(0, zoneIdx(Math.min(S.maxStage, STAGES)) + 1);
  return [...new Set(zs.flatMap(z => z.m))].filter(t => MON[t] && MON[t].anim).slice(0, 20);
}
function petGrouped() { const g = [[], [], [], [], []]; for (const t of petChoices()) g[petElemOf(t)].push(t); return g; }
function petAdopt(tid) { const old = RW().pet; RW().pet = { tid, lvl: old ? old.lvl : 1, xp: old ? old.xp : 0, eq: (old && old.eq) || {} }; R.petPos = null; R.dirty = true; toast(`Đồng hành: ${MON[tid].n} · hệ ${SERIES[petElemOf(tid)]}`); save(); refresh(); refreshGift(); }
function petDmg(p) { return petStats(p).atk; }
export function petTick(dt) {
  const p = S.rw && S.rw.pet; if (!p || R.town || !MON[p.tid]) { R.petPos = null; R.petLoot = null; return; }
  const pp = R.petPos || (R.petPos = { x: H.x - 30, y: H.y + 10, t: 0, act: 'st', actT: 0, dir: 0 });
  /* Nhat do auto (loot.ts dat R.petLoot): pet uu tien di nhat thay nguoi; xong moi quay lai danh quai */
  const lt = R.petLoot && R.ground.indexOf(R.petLoot) >= 0 ? R.petLoot : null; if (!lt) R.petLoot = null;
  const t = lt ? null : alive().sort((a, b) => Math.hypot(a.x - pp.x, a.y - pp.y) - Math.hypot(b.x - pp.x, b.y - pp.y))[0];
  const goal = lt || t || { x: H.x - 36, y: H.y + 12 }, d = Math.hypot(goal.x - pp.x, goal.y - pp.y), reach = lt ? 16 : t ? t.r + 14 : 10;
  pp.moving = d > reach;
  if (pp.moving) { const k = Math.min(1, 170 * dt / d); pp.dir = dirOf(goal.x - pp.x, goal.y - pp.y); pp.x += (goal.x - pp.x) * k; pp.y += (goal.y - pp.y) * k; }
  if (!lt && Math.hypot(H.x - pp.x, H.y - pp.y) > 500) { pp.x = H.x - 30; pp.y = H.y + 10; }   // lac xa: dich chuyen ve canh chu (khong ap dung khi dang di nhat xa)
  pp.t -= dt;
  if (t && !pp.moving && pp.t <= 0) {
    const st = petStats(p); pp.t = st.cd;
    const el = SERIES_ELEM[st.elem] || 'phys';                 // don cua pet mang he cua no
    let dmg = st.atk * rnd(0.9, 1.1);
    const crit = Math.random() * 100 < st.crit; if (crit) dmg *= 2;
    const adv = counters(st.elem, t.series);                   // tuong khac he: +25%, bi khac: -15%
    if (adv) dmg *= 1.25; else if (counters(t.series, st.elem)) dmg *= 0.85;
    dmg = Math.max(1, dmg * (100 - clamp(t.res[el] || 0, -100, 95)) / 100);   // khang nguyen to cua muc tieu
    t.hp -= dmg; t.hitT = 0.1; pp.act = 'at'; pp.actT = 0; pp.dir = dirOf(t.x - pp.x, t.y - pp.y);
    addText(t.x, t.y - 30, fmt(dmg) + (adv ? ' ⚡' : ''), crit ? '#ffe14a' : '#9fe36a', 11);
  }
}
function petGainXp(n) {
  const p = S.rw && S.rw.pet; if (!p) return;
  p.xp += n; const need = 20 + p.lvl * 12;
  if (p.xp >= need) { p.xp -= need; p.lvl++; log(`Đồng hành ${esc(MON[p.tid].n)} lên cấp ${p.lvl}`); }
}
export function drawPet(c, dt) {
  const p = S.rw && S.rw.pet, pp = R.petPos; if (!p || !pp || !MON[p.tid]) return;
  pp.animKey = MON[p.tid].anim; stepAct(pp, dt, pp.moving ? 'run' : 'st'); if (pp.act !== 'at') setAct(pp, pp.moving ? 'run' : 'st');
  c.fillStyle = '#0007'; c.beginPath(); c.ellipse(pp.x, pp.y, 10, 4, 0, 0, 7); c.fill();
  drawAnim(pp.animKey, pp.act || 'st', pp.dir || 0, pp.actT || 0, pp.x, pp.y, 0.75 * MON_SCALE);
  label(pp.x, pp.y - 42, `${MON[p.tid].n} · Lv${p.lvl}`, SERIES_COL[petElemOf(p.tid)] || NAME_COL.pet, 10, -1);
}
/* ---------- 8b. trang bi cho Dong hanh (gan do khong dung vao pet -> buff thuoc tinh nhan vat) ---------- */
/* Giu lai mon dang trong tui nhung phu hop o pet (neu khong, tu ban do thua se an het do truoc khi nguoi choi kip gan) */
export function petWants(it) {
  const slot = petSlotFor(it); if (!slot || !petUnlocked()) return false;
  if (S.inv.length >= INV_MAX - 6) return false;               // tui gan day: nhuong cho, ban nhu thuong
  const cur = S.rw && S.rw.pet && S.rw.pet.eq && S.rw.pet.eq[slot];
  return !cur || itemPower(it) > itemPower(cur) * 0.9;
}
function petEquip(slot, it) {
  const p = petCur(); if (!p || !petUnlocked() || !petFits(slot, it) || !S.inv.includes(it)) return;
  const old = p.eq[slot]; S.inv = S.inv.filter(x => x !== it); if (old) S.inv.unshift(old);
  p.eq[slot] = it; R.dirty = true; setInvDirty(true); save(); closeModal(true); refresh(); toast('Gắn cho Đồng hành: ' + it.n);
}
function petUnequip(slot) {
  const p = petCur(); if (!p || !p.eq || !p.eq[slot]) return;
  if (S.inv.length >= INV_MAX) { toast('Hành trang đầy'); return; }
  S.inv.unshift(p.eq[slot]); delete p.eq[slot];
  R.dirty = true; setInvDirty(true); save(); closeModal(true); refresh();
}
const petCell = it => `<button class="it r${it.r}" data-puid="${it.uid}">${it.ic ? `<img src="${esc(it.ic)}" alt="">` : ''}<i>${it.lvl}</i>${it.s >= 0 ? `<b class="s5" style="background:${SERIES_COL[it.s]}"></b>` : ''}</button>`;
function petPickModal(slot) {
  const vi = (PET_SLOTS.find(x => x[0] === slot) || [slot, slot])[1];
  const list = S.inv.filter(it => petFits(slot, it)).sort((a, b) => itemPower(b) - itemPower(a));
  modal(`<h3>Gắn ${esc(vi)} cho Đồng hành</h3><p class="desc">Chọn món trong hành trang. Thuộc tính món được cộng vào nhân vật ${Math.round(PET_EQ_BUFF * 100)}% (mọi dòng, kể cả dòng ẩn).</p>
    ${list.length ? `<div class="slotlist">${list.map(it => `<button class="slotrow petrow" data-pe="${it.uid}"><span>${esc(it.n)}<small>${esc(J.items[it.d].n)} · cấp ${it.lvl} · hệ ${SERIES[it.s]} · sức mạnh ${fmt(itemPower(it))}</small></span></button>`).join('')}</div>`
      : '<p class="desc">Hành trang không có món phù hợp ô này.</p>'}`, () => {
    document.querySelectorAll('#mBody [data-pe]').forEach(x => x.onclick = () => { const it = findItem(+x.dataset.pe); if (it) petEquip(slot, it); });
  });
}
function petItemModal(it, slot) {
  const hcur = slot && S.eq[slot] ? S.eq[slot] : null;   // nhan vat dang mac o cung loai (so sanh nguoc lai)
  modal(`${itemHTML(it)}${hcur ? `<div class="cmp"><small class="dim">Nhân vật đang mặc:</small>${itemHTML(hcur)}</div>` : ''}<p class="dim small">Đang gắn cho Đồng hành · thuộc tính cộng vào nhân vật ${Math.round(PET_EQ_BUFF * 100)}%.</p>
    <div class="btnrow"><button class="btn" id="pUn">Tháo về hành trang</button></div>`, () => { $('#pUn').onclick = () => petUnequip(slot); });
}
export function renderPet() {
  const el = $('#t-pet'); if (!el) return;
  if (!petUnlocked()) { el.innerHTML = `<h3>Đồng hành</h3><p class="desc">Đồng hành mở khóa ở cấp ${PET_LV} (hoặc sau chuyển sinh). Đồng hành đi theo, cùng đánh quái, lên cấp theo số quái hạ, và mang trang bị để cộng thuộc tính cho nhân vật.</p>`; return; }
  const p = petCur(), st = p && MON[p.tid] ? petStats(p) : null, need = p ? 20 + p.lvl * 12 : 0;
  const slots = PET_SLOTS.map(([k, vi]) => `<div class="slot" data-pslot="${k}">${p && p.eq && p.eq[k] ? petCell(p.eq[k]) : `<span>${vi}</span>`}</div>`).join('');
  const groups = petGrouped().map((list, e) => list.length ? `<div class="peGroup"><h4 style="color:${SERIES_COL[e]}">Hệ ${SERIES[e]}</h4><div class="petpick">${list.map(t => `<button data-p="${t}" class="${p && p.tid === t ? 'on' : ''}">${MON[t].img ? `<img src="${esc(MON[t].img)}" alt="">` : ''}<b>${esc(MON[t].n)}</b></button>`).join('')}</div></div>` : '').join('');
  const body = p && st ? `<div class="card stats">
      <span>Đang dẫn</span><span><b style="color:${SERIES_COL[st.elem]}">${esc(MON[p.tid].n)}</b></span>
      <span>Hệ</span><span style="color:${SERIES_COL[st.elem]}">${SERIES[st.elem]}</span>
      <span>Cấp</span><span>${p.lvl}</span><span>Kinh nghiệm</span><span>${Math.floor(p.xp)}/${need}</span>
      <span>Sát thương</span><span>${fmt(st.atk)}/đòn</span><span>Chu kỳ đánh</span><span>${st.cd.toFixed(2)}s</span>
      <span>Chí mạng</span><span>${Math.round(st.crit)}%</span><span>Sức mạnh trang bị</span><span>${fmt(st.power)}</span></div>
    <h3>Trang bị cho Đồng hành <small>cộng ${Math.round(PET_EQ_BUFF * 100)}% thuộc tính vào nhân vật</small></h3>
    <div class="eqgrid">${slots}</div>
    <p class="dim small">Chạm ô trống để gắn món trong hành trang; chạm món đang gắn để xem/tháo. Đồng hành tương khắc hệ quái: +25% sát thương (⚡). Ra trận, Đồng hành tự đi nhặt đồ auto theo bộ lọc ở thẻ Hành trang thay nhân vật.</p>`
    : '<p class="desc">Chưa chọn loài Đồng hành — chọn một loài bên dưới (đổi loài vẫn giữ cấp và trang bị).</p>';
  el.innerHTML = `<h3>Đồng hành</h3>${body}<h3>Chọn loài <small>theo hệ ngũ hành</small></h3>${groups}`;
  el.querySelectorAll('[data-pslot]').forEach(b => b.onclick = () => {
    const k = b.dataset.pslot, it = p && p.eq && p.eq[k];
    if (it) petItemModal(it, k); else petPickModal(k);
  });
  el.querySelectorAll('#t-pet .petpick [data-p]').forEach(x => x.onclick = () => petAdopt(+x.dataset.p));
}

/* ---------- 9. su kien theo mua (theo thang hien tai) ---------- */
function eventNow() {
  const m = new Date().getMonth() + 1;
  if (m === 1 || m === 2) return { n: 'Tết Nguyên Đán', token: 'Bánh Chưng', col: '#ff5a4a' };
  if (m === 9 || m === 10) return { n: 'Tết Trung Thu', token: 'Bánh Trung Thu', col: '#ffd24a' };
  if (m === 12) return { n: 'Giáng Sinh', token: 'Chuông Bạc', col: '#9fe3ff' };
  return { n: 'Hội Võ Lâm', token: 'Lệnh Bài Võ Lâm', col: '#c8a2ff' };
}
const EVENT_SHOP = [[10, { gold: 1000 }], [20, { pot: { kind: 'life', tier: 3, n: 10 } }], [30, { item: 5 }], [40, { fd: 20 }], [60, { set: 1 }]];
function eventBuy(i) {
  const [cost, g] = EVENT_SHOP[i], st = RW().stat;
  if (st.tokens < cost) { toast(`Cần ${cost} ${eventNow().token}`); return; }
  st.tokens -= cost; grant(g, eventNow().n); refreshGift();
}

/* ---------- 10. ruong Phuc Duyen ---------- */
const FD_TABLE = [[40, { gold: 600 }], [20, { pot: { kind: 'life', tier: 3, n: 5 } }], [15, { pot: { kind: 'mana', tier: 3, n: 5 } }], [12, { item: 4 }], [8, { item: 6 }], [4, { pts: 5 }], [1, { set: 1 }]];
function openChest() {
  const r = RW(); if (r.fd < FD_COST) { toast(`Cần ${FD_COST} điểm Phúc Duyên`); return; }
  r.fd -= FD_COST; r.stat.chests++;
  const got = grant(wpick(FD_TABLE, x => x[0])[1], 'Rương Phúc Duyên');
  toast('Rương Phúc Duyên: ' + got.join(', ').replace(/<[^>]+>/g, '')); refreshGift();
}

/* ---------- 10b. quay Vỏ Sò (bàn quay kiểu Bách Bảo Rương — Kiếm Thế) ---------- */
const SO_COST1 = 1, SO_COST10 = 9, PITY_MAX = 25;                  // ×10 tính 9 vỏ (tặng 1 lượt); 25 lượt không ra Tím+ thì ép
const SO_TIER_COL = { 0: RAR_COL[0], 3: RAR_COL[3], 4: RAR_COL[4], 5: '#ff6a5a' };
/* [trọng số, hạng (>=3 = Tím+, thuộc nhóm bảo đảm), tên hiển thị, sinh phần thưởng, icon ô quay, số sao, màu riêng (tuỳ chọn)] */
const SO_TABLE = [
  [25, 0, 'Ngân lượng', () => ({ gold: 500 }), '💰', 2],
  [15, 0, 'Thuốc', () => ({ pot: { kind: pick(['life', 'mana']), tier: irnd(2, 3), n: irnd(5, 10) } }), '🧪', 2],
  [12, 0, 'Phúc Duyên', () => ({ fd: irnd(5, 15) }), '🧧', 3],
  [12, 0, 'Vỏ Sò', () => ({ so: irnd(2, 4) }), '🐚', 1],
  [10, 0, 'Đồ 4 dòng', () => ({ item: 4 }), '🗡️', 4],
  [9, 0, 'Đồ 5 dòng', () => ({ item: 5 }), '🪖', 5],
  [6, 3, 'Đồ 6 dòng (Tím)', () => ({ item: 6, itemR: 3 }), '💎', 6],
  [4, 3, 'Nguyên liệu rèn', () => ({ mat: { g: 'ht', k: String(clamp(Math.round(S.lvl / 12) + 1, 1, 10)), n: irnd(2, 5) } }), '💠', 4],
  [3, 0, '5 điểm tiềm năng', () => ({ pts: 5 }), '✨', 3],
  [2, 0, 'Vỏ Sò Vàng', () => ({ so: irnd(20, 35) }), '🐚', 5, '#ffd24a'],
  [1.8, 4, 'Đồ Hoàng Kim', () => ({ set: 1 }), '👑', 6],
  [0.2, 5, 'Huyền Thoại', () => ({ set: 1, fd: 50 }), '🐉', 6],
];
/* Loại thưởng trên từng ô theo thứ tự vòng kim đồng hồ (20 ô; 8 loại phổ biến chiếm 2 ô, 4 loại hiếm chiếm 1 ô) */
const SO_RING_TYPES = [0, 3, 5, 1, 11, 4, 8, 2, 10, 7, 6, 2, 0, 1, 10, 3, 9, 4, 6, 5];
let soResults = [];                                                // kết quả lần quay gần nhất (hiện ở Bảng Vận Mệnh)
let soSpinning = false;                                            // đang chạy đèn: chặn quay tiếp, chặn re-render giữa chừng
let soWinLast = 0;                                                 // vỏ sò rớt ra ở lần quay gần nhất (khay "Nhận Vỏ Sò")
const SO_RING: [number, number][] = [];
for (let c = 0; c < 8; c++) SO_RING.push([0, c]);
for (let r = 1; r <= 3; r++) SO_RING.push([r, 7]);
for (let c = 6; c >= 0; c--) SO_RING.push([3, c]);
for (let r = 2; r >= 1; r--) SO_RING.push([r, 0]);
const soCellsOf = typeIdx => SO_RING.map((_, i) => i).filter(i => SO_RING_TYPES[i] === typeIdx);
function spinSo(nLượt) {
  const so = RW().so, cost = nLượt >= 10 ? SO_COST10 : SO_COST1;
  if (soSpinning) return;
  if (so.n < cost) { toast(`Không đủ Vỏ Sò (cần ${cost}, đang có ${so.n})`); return; }
  so.n -= cost; so.spins += nLượt; soResults = []; soWinAccum = 0;
  soSpinning = true;
  document.querySelectorAll('#mBody #gSo1, #mBody #gSo10').forEach(b => b.disabled = true);
  const bal = $('#mBody #soBal'); if (bal) bal.textContent = String(so.n);
  const seq = (k) => {
    if (k >= nLượt) {                                              // hết lượt: nhẹ nhàng trả giao diện
      soSpinning = false; soWinLast = soWinAccum; uiSfx('learn'); save(); refreshGift();
      return;
    }
    so.pity = (so.pity || 0) + 1;
    const pool = so.pity >= PITY_MAX ? SO_TABLE.filter(x => x[1] >= 3) : SO_TABLE;   // lượt bảo đảm: chỉ rút hạng Tím+
    const row = wpick(pool, x => x[0]);
    if (row[1] >= 3) so.pity = 0;
    const land = pick(soCellsOf(SO_TABLE.indexOf(row)));           // 1 trong các ô của loại này trên bàn
    soRingSpin(land, () => {                                       // đèn dừng mới phát thưởng (đủ hồi hộp như Kiếm Thế)
      const g = row[3](), got = grant(g, 'Quay Sò');
      const col = row[6] || SO_TIER_COL[row[1]];
      const line = { label: row[2], got: (got && got[0]) || '', col };
      soResults.push(line);
      const logEl = $('#mBody #soLog');
      if (logEl) {
        logEl.insertAdjacentHTML('afterbegin', `<div>Bạn rót được <b style="color:${col}">${esc(line.label)}</b> <small class="dim">${line.got}</small></div>`);
        while (logEl.children.length > 5) logEl.removeChild(logEl.lastChild);
      }
      const bal2 = $('#mBody #soBal'); if (bal2) bal2.textContent = String(so.n);
      const prizeTray = $('#mBody #soPrizeTray'); if (prizeTray) prizeTray.textContent = row[2];
      if (g.so) {                                                  // trúng vỏ sò: rớt vào khay "Nhận Vỏ Sò"
        soWinAccum += g.so;
        const shellTray = $('#mBody #soShellTray');
        if (shellTray) { shellTray.textContent = '+' + soWinAccum + ' vỏ'; const t = shellTray.closest('.soTray'); if (t) { t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump'); } }
      }
      seq(k + 1);
    }, nLượt >= 10);
  };
  seq(0);
}
let soWinAccum = 0;                                                // vỏ sò rớt trong phiên quay đang chạy
let soRingPos = 0;                                                 // ô đèn đang đứng (giữ liên tục giữa các lượt — vòng quay chạy tròn, không nhảy về 0)
function soRingSpin(land, done, quick) {
  /* querySelectorAll trả ô theo thứ tự DOM (từng hàng) — xếp lại theo data-ring để đèn đi
     đúng vòng kim đồng hồ: hàng trên trái→phải, cột phải xuống, hàng dưới phải→trái, cột trái lên. */
  const cells = Array.from(document.querySelectorAll('#mBody .soCell'))
    .sort((a, b) => (+a.dataset.ring) - (+b.dataset.ring));
  if (!cells.length) { done(); return; }                           // modal đóng giữa chừng (Esc): bỏ animation, thưởng vẫn nhận (grant nằm trong done)
  const N = 20, start = soRingPos % N, ahead = (land - start + N) % N;
  const steps = N + ahead;                                         // luôn chạy trọn ít nhất 1 vòng rồi mới dừng vào ô trúng
  let i = 0, pos = start;
  cells.forEach(c => c.classList.remove('cur'));
  cells[start].classList.add('cur');
  const step = () => {
    cells[pos].classList.remove('cur');
    pos = (pos + 1) % N;                                           // sáng ô KẾ TIẾP trước rồi mới kiểm dừng -> đèn đứng đúng ô trúng
    cells[pos].classList.add('cur');
    i++;
    if (i >= steps) {
      cells[land].classList.add('land');
      uiSfx('click');
      soRingPos = land;
      setTimeout(() => { const w = cells[land]; if (w) w.classList.remove('land'); done(); }, quick ? 260 : 520);
      return;
    }
    const tailStart = steps - (quick ? 3 : 6);
    const tail = i >= tailStart ? (quick ? 110 + (i - tailStart) * 50 : 150 + (i - tailStart) * 60) : (quick ? 26 : 80);
    setTimeout(step, tail);
  };
  setTimeout(step, quick ? 30 : 90);
}

/* ---------- 11. mã quà tặng + quà tân thủ (offline: validate client-side, mỗi nhân vật 1 lần) ---------- */
const CODES = [
  ['TANTHU2026', { gold: 3000, fd: 5 }, 'Quà ra mắt'],
  ['VOLAMIDLE', { so: 10 }, 'Chào mừng tới Võ Lâm Idle'],
  ['BOSSTHEGIOI', { so: 5, mat: { g: 'ht', k: '2', n: 2 } }, 'Săn Boss Thế Giới'],
  ['QUAYSO', { so: 3 }, 'Thử vận may quay sò'],
  ['PHUCDUYEN', { fd: 20 }, 'Phúc Duyên'],
];
export function claimCode(raw) {
  if (!S || !S.fac) return;
  const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code) { toast('Nhập mã quà tặng'); return; }
  const row = CODES.find(c => c[0] === code);
  if (!row) { toast('Mã không hợp lệ'); return; }
  const r = RW(); r.codes = r.codes || {};
  if (r.codes[code]) { toast('Mã này đã dùng rồi'); return; }
  r.codes[code] = 1;
  const got = grant(row[1], `Mã quà ${code}`);
  uiSfx('levelup');
  toast(`Mã ${code}: ` + got.join(', ').replace(/<[^>]+>/g, ''));
  refreshGift();
  return got;
}
const WELCOME = { gold: 5000, pot: { kind: 'life', tier: 2, n: 10 }, fd: 5, so: 10, item: 4 };
export function claimWelcome() {
  if (!S || !S.fac) return;
  const r = RW();
  if (r.welcomeGot) { toast('Quà tân thủ đã nhận rồi'); return; }
  r.welcomeGot = 1;
  const got = grant(WELCOME, 'Quà tân thủ');
  grant({ pot: { kind: 'mana', tier: 2, n: 10 } }, 'Quà tân thủ · nội lực');
  uiSfx('levelup');
  toast('Quà tân thủ: ' + got.join(', ').replace(/<[^>]+>/g, ''));
  refreshGift();
}

/* ---------- moc noi vao tro choi ---------- */
export function rwOnKill(e) {
  if (!S.fac) return;
  const r = RW(); r.stat.kills++; questTick('kills');
  if (e.cls === 'boss') { r.stat.bosses++; questTick('bosses'); }
  if (e.goldBoss) { r.stat.goldBoss++; grant({ set: 1, fd: 10 }, 'Hạ Trùm Hoàng Kim'); }
  if (Math.random() < 0.05) { r.stat.tokens++; const ev = eventNow(); addText(e.x, e.y - 50, '+1 ' + ev.token, ev.col, 11); }
  petGainXp(e.cls === 'boss' ? 10 : e.cls === 'elite' ? 3 : 1);
  if (r.stat.kills % 25 === 0 || e.cls === 'boss') achCheck();
}
export function giftPending() {
  if (!S || !S.fac) return false;
  const r = RW();
  return !r.welcomeGot || !r.login.claimed || lvMsReady().length > 0 || dailyQuests().list.some(q => !q.done && q.have >= q.need) || weeklyQuests().list.some(q => !q.done && q.have >= q.need) || r.fd >= FD_COST;
}
export function dotGift() { const b = $('#giftBtn'); if (b) b.classList.toggle('on', giftPending()); }

/* ---------- giao dien: nut 🎁 ---------- */
let giftTab = 'login';
function refreshGift() { if (!$('#modal').classList.contains('hidden') && $('#giftTabs')) giftModal(); dotGift(); }
function giftText(g) {
  const p = [];
  if (g.gold) p.push(`${fmt(g.gold * (1 + S.lvl / 10))} lượng`); if (g.pot) p.push(`${g.pot.n} bình thuốc`); if (g.fd) p.push(`${g.fd} Phúc Duyên`);
  if (g.item) p.push(`đồ ${g.item} dòng`); if (g.set) p.push('đồ Hoàng Kim'); if (g.pts) p.push(`${g.pts} tiềm năng`);
  return p.join(', ');
}
function giftBody(r) {
  if (giftTab === 'login') {
    const L = r.login, day = ((L.streak - 1) % 7 + 7) % 7;
    return `<p class="desc">Chuỗi ${L.streak} ngày · tổng ${L.total} ngày. Mốc 10 / 20 / 30 ngày có quà lớn.</p>
      <div class="days">${LOGIN7.map((g, i) => `<div class="day${i < day || (i === day && L.claimed) ? ' got' : ''}${i === day ? ' cur' : ''}"><b>Ngày ${i + 1}</b><small>${giftText(g)}</small></div>`).join('')}</div>
      <div class="btnrow"><button class="btn" id="gLogin" ${L.claimed ? 'disabled' : ''}>${L.claimed ? 'Đã nhận hôm nay' : 'Nhận quà hôm nay'}</button></div>`;
  }
  if (giftTab === 'lvms') {
    const g = r.lvGot || {};
    return `<p class="desc">Quà mốc cấp: nhận một lần (chuyển sinh không nhận lại). Chủ yếu thuốc, ngân lượng, Phúc Duyên và mở khóa tính năng.</p>${LV_MS.map(([lv, rw, note]) => `<div class="qrow${S.lvl >= lv ? '' : ' lock'}"><span><b>Cấp ${lv}</b><small>${giftText(rw)}${note ? ' · ' + note : ''}</small></span><small></small><button class="btn sm" data-lv="${lv}" ${S.lvl >= lv && !g[lv] ? '' : 'disabled'}>${g[lv] ? 'Đã nhận' : 'Nhận'}</button></div>`).join('')}`;
  }
  if (giftTab === 'quest') return `<p class="desc"><b>Hằng ngày</b> — làm mới mỗi ngày. Mỗi việc: lượng + 5 Phúc Duyên.</p>${dailyQuests().list.map((q, i) => `<div class="qrow"><span>${esc(q.t)}</span><small>${q.have}/${q.need}</small><button class="btn sm" data-q="${i}" ${q.done || q.have < q.need ? 'disabled' : ''}>${q.done ? 'Đã nhận' : 'Nhận'}</button></div>`).join('')}
      <p class="desc" style="margin-top:10px"><b>Hằng tuần</b> — làm mới vào thứ Hai, mục tiêu lớn hơn. Mỗi việc: ${fmt(WQ_REWARD.gold)} lượng + ${WQ_REWARD.fd} Phúc Duyên.</p>${weeklyQuests().list.map((q, i) => `<div class="qrow"><span>${esc(q.t)}</span><small>${q.have}/${q.need}</small><button class="btn sm" data-w="${i}" ${q.done || q.have < q.need ? 'disabled' : ''}>${q.done ? 'Đã nhận' : 'Nhận'}</button></div>`).join('')}`;
  if (giftTab === 'ach') return `<p class="desc">Hoàn thành để nhận thưởng; đeo 1 danh hiệu để cộng chỉ số.</p>${ACH.map(([id, n, , g, t]) => `<div class="qrow${r.ach[id] ? '' : ' lock'}"><span><b>${n}</b><small>${giftText(g)} · danh hiệu: ${escRich(attrText(t[0], [t[1], 0, 0]))}</small></span><small></small><button class="btn sm" data-t="${id}" ${r.ach[id] ? '' : 'disabled'}>${r.title === id ? 'Đang đeo' : 'Đeo'}</button></div>`).join('')}`;
  if (giftTab === 'chest') return `<p class="desc">Điểm Phúc Duyên: <b>${r.fd}</b> (điểm danh, nhiệm vụ, thành tựu, trùm). Mỗi lần mở: ${FD_COST} điểm.</p>
      <div class="chips">${FD_TABLE.map(([w, g]) => `<span class="chip2">${giftText(g)} · ${w}%</span>`).join('')}</div>
      <div class="btnrow"><button class="btn" id="gChest" ${r.fd >= FD_COST ? '' : 'disabled'}>Mở rương Phúc Duyên</button></div>`;
  if (giftTab === 'newbie') {
    const got = !!r.welcomeGot;
    return `<p class="desc">Quà chào sân cho nhân vật mới — nhận <b>một lần</b> cho mỗi nhân vật.</p>
      <div class="card stats"><span>Ngân lượng</span><span>${fmt(WELCOME.gold * (1 + S.lvl / 10))}</span><span>Thuốc</span><span>10 Kim Sáng Dược + 10 Ngưng Thần đan</span><span>Phúc Duyên</span><span>${WELCOME.fd}</span><span>Vỏ Sò</span><span>${WELCOME.so} (quay sò ở tab bên cạnh)</span><span>Trang bị</span><span>1 món 4 dòng</span></div>
      <div class="btnrow"><button class="btn" id="gWelcome" ${got ? 'disabled' : ''}>${got ? 'Đã nhận quà tân thủ' : 'Nhận quà tân thủ'}</button></div>`;
  }
  if (giftTab === 'code') {
    const used = Object.keys(r.codes || {});
    return `<p class="desc">Nhập <b>mã quà tặng</b> (không phân biệt hoa/thường). Mỗi mã dùng được một lần cho mỗi nhân vật.</p>
      <div class="row"><input id="codeInp" class="nameinp" maxlength="24" placeholder="Nhập mã…" value=""></div>
      <div class="btnrow"><button class="btn" id="gCode">Nhận quà</button></div>
      ${used.length ? `<h3>Đã dùng <small>${used.length}</small></h3><p class="desc">${used.map(esc).join(' · ')}</p>` : ''}`;
  }
  if (giftTab === 'so') {
    if (!unlocked(WB_MIN_LV)) return `<p class="desc">Quay Sò mở ở cấp ${WB_MIN_LV} — sau khi đủ sức hạ <b>Boss Thế Giới</b> (xuất hiện mỗi ${Math.round(WB_EVERY / 60)} phút chơi).</p>`;
    const so = r.so, left = Math.max(0, PITY_MAX - (so.pity || 0));
    const at = new Map(SO_RING.map(([rr, cc], i) => [rr * 8 + cc, i]));
    let board = '';
    for (let p = 0; p < 32; p++) {
      const i = at.get(p);
      if (i == null) { board += '<i class="soHole"></i>'; continue; }
      const row = SO_TABLE[SO_RING_TYPES[i]], col = row[6] || SO_TIER_COL[row[1]];
      board += `<div class="soCell t${row[1]}" data-ring="${i}"${row[6] ? ` style="border-color:${row[6]}"` : ''}><span>${row[4]}</span><small style="color:${col}">${'★'.repeat(row[5])}</small></div>`;
    }
    const last = soResults.length ? soResults[soResults.length - 1] : null;
    return `<p class="desc">Vỏ Sò rớt từ <b style="color:#ff8a5a">Boss Thế Giới</b>. Đang có <b id="soBal">${so.n}</b> vỏ · đã quay ${so.spins} lượt · bảo đảm Tím+: ${left === 0 ? '<b>lượt kế tiếp</b>' : `còn <b>${left}</b> lượt`}.</p>
      <div class="soBoard">${board}<div class="soCenter"><h4>◆ Bảng Vận Mệnh ◆</h4><div class="soLog" id="soLog">${soResults.slice(-5).reverse().map(x => `<div>Bạn rót được <b style="color:${x.col}">${esc(x.label)}</b> <small class="dim">${x.got}</small></div>`).join('') || '<div class="dim">Bấm quay — đèn chạy vòng và dừng vào ô phúc phần của bạn.</div>'}</div></div></div>
      <div class="soTrays"><div class="soTray"><span>🎁</span><small>Nhận thưởng</small><b id="soPrizeTray">${last ? esc(last.label) : '—'}</b></div><div class="soTray"><span>🐚</span><small>Nhận Vỏ Sò</small><b id="soShellTray">${soWinLast ? '+' + soWinLast + ' vỏ' : '—'}</b></div></div>
      <div class="btnrow"><button class="btn" id="gSo1" ${so.n >= SO_COST1 && !soSpinning ? '' : 'disabled'}>Quay ×1 · 1 vỏ</button><button class="btn" id="gSo10" ${so.n >= SO_COST10 && !soSpinning ? '' : 'disabled'}>Quay ×10 · 9 vỏ</button></div>
      <div class="chips">${SO_TABLE.map(([w, , label]) => `<span class="chip2">${label} · ${w}%</span>`).join('')}</div>`;
  }
  if (giftTab === 'event') {
    const ev = eventNow();
    return `<p class="desc">Sự kiện: <b style="color:${ev.col}">${ev.n}</b>. Quái rơi ${ev.token} (5%). Đang có: <b>${r.stat.tokens}</b>.</p>${EVENT_SHOP.map(([c, g], i) => `<div class="qrow"><span>${giftText(g)}</span><small>${c} ${ev.token}</small><button class="btn sm" data-e="${i}" ${r.stat.tokens >= c ? '' : 'disabled'}>Đổi</button></div>`).join('')}`;
  }
  if (giftTab === 'tower') return `<p class="desc">Mỗi tầng một đợt tinh anh; tầng chia hết cho 5 là trùm (lần đầu qua được đồ Hoàng Kim). Quái cấp 10 + 4 × tầng. Gục ngã là rời tháp.</p>
      <p>Kỷ lục: <b>tầng ${r.stat.towerBest}</b>${R.tower ? ` · đang ở tầng ${R.tower.floor}` : ''}</p>
      <div class="btnrow">${R.tower ? '<button class="btn red" id="gTowerOut">Rời tháp</button>' : !unlocked(TOWER_LV) ? `<button class="btn" disabled>Cần cấp ${TOWER_LV}</button>` : `<button class="btn" id="gTower">Vào tháp (từ tầng ${Math.max(1, r.stat.towerBest - 4)})</button>`}</div>`;
  if (giftTab === 'pet') {
    const p = r.pet;
    if (!unlocked(PET_LV)) return `<p class="desc">Đồng hành mở khóa ở cấp ${PET_LV}.</p>`;
    const st = p && MON[p.tid] ? petStats(p) : null;
    return `<p class="desc">Đồng hành đi theo và cùng đánh quái, lên cấp theo số quái hạ. Chọn trong các loài ở vùng đã tới (đổi loài vẫn giữ cấp và trang bị). Gắn trang bị cho Đồng hành ở <b>thẻ Đồng hành</b> dưới thanh menu.</p>${p && st ? `<p>Đang dẫn: <b style="color:${SERIES_COL[st.elem]}">${esc(MON[p.tid].n)}</b> · hệ ${SERIES[st.elem]} · cấp ${p.lvl} · sát thương ${fmt(st.atk)}/đòn</p>` : ''}
      <div class="petpick">${petChoices().map(t => `<button data-p="${t}" class="${p && p.tid === t ? 'on' : ''}">${MON[t].img ? `<img src="${esc(MON[t].img)}" alt="">` : ''}<b>${esc(MON[t].n)}</b></button>`).join('')}</div>`;
  }
  const bo = rebornBonus(), full = r.stat.reborn >= REBORN_MAX;
  return `<p class="desc">Từ cấp ${REBORN_LV} (tối đa): về cấp 1, giữ trang bị và võ công, nhận 50 điểm tiềm năng × số lần chuyển sinh, thưởng vĩnh viễn +20% kinh nghiệm và +10% sát thương mỗi lần (tối đa ${REBORN_MAX} lần).</p>
      <p>Đã chuyển sinh: <b>${r.stat.reborn}</b> lần · hiện +${Math.round(bo.xp * 100)}% kinh nghiệm, +${Math.round(bo.dmg * 100)}% sát thương.</p>
      <div class="btnrow"><button class="btn red" id="gReborn" ${S.lvl >= REBORN_LV && !full ? '' : 'disabled'}>${full ? 'Đã chuyển sinh tối đa' : S.lvl >= REBORN_LV ? 'Chuyển sinh' : `Cần cấp ${REBORN_LV}`}</button></div>`;
}
export function giftModal() {
  if (!S.fac) return;
  const r = RW(), tabs = [['newbie', 'Tân thủ'], ['code', 'Mã quà'], ['login', 'Điểm danh'], ['lvms', 'Mốc cấp'], ['quest', 'Nhiệm vụ'], ['ach', 'Thành tựu'], ['chest', 'Phúc Duyên'], ['so', 'Quay Sò'], ['event', 'Sự kiện'], ['tower', 'Tháp'], ['pet', 'Đồng hành'], ['reborn', 'Chuyển sinh']];
  modal(`<h3>Phần thưởng <small>Phúc Duyên ${r.fd}</small></h3><div class="dtabs" id="giftTabs">${tabs.map(([k, n]) => `<button data-g="${k}" class="${k === giftTab ? 'on' : ''}">${n}</button>`).join('')}</div>${giftBody(r)}`, () => {
    document.querySelectorAll('#mBody #giftTabs button').forEach(x => x.onclick = () => { giftTab = x.dataset.g; giftModal(); });
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    on('#gLogin', () => { claimLogin(); refreshGift(); }); on('#gChest', openChest); on('#gTower', towerStart);
    on('#gSo1', () => spinSo(1)); on('#gSo10', () => spinSo(10));
    on('#gWelcome', claimWelcome);
    on('#gCode', () => claimCode($('#codeInp') ? $('#codeInp').value : ''));
    { const ci = $('#codeInp'); if (ci) ci.onkeydown = e => { if (e.key === 'Enter') claimCode(ci.value); }; }
    on('#gTowerOut', () => { towerExit(false); refreshGift(); }); on('#gReborn', doReborn);
    document.querySelectorAll('#mBody [data-lv]').forEach(x => x.onclick = () => claimLvMs(+x.dataset.lv));
    document.querySelectorAll('#mBody [data-q]').forEach(x => x.onclick = () => { claimQuest(+x.dataset.q); refreshGift(); });
    document.querySelectorAll('#mBody [data-w]').forEach(x => x.onclick = () => { claimWeekQuest(+x.dataset.w); refreshGift(); });
    document.querySelectorAll('#mBody [data-t]').forEach(x => x.onclick = () => { r.title = r.title === x.dataset.t ? '' : x.dataset.t; R.dirty = true; save(); refreshGift(); });
    document.querySelectorAll('#mBody [data-e]').forEach(x => x.onclick = () => eventBuy(+x.dataset.e));
    document.querySelectorAll('#mBody .petpick [data-p]').forEach(x => x.onclick = () => petAdopt(+x.dataset.p));
  });
}

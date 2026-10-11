// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { uiSfx } from './audio';
import {
  H,
  R,
  alive,
  expFor,
  heal,
  makeEnemy,
  stageLevel,
  zoneIdx,
  zoneOf,
} from './combat';
import { backFromTown } from './control';
import { invMax } from './invs';
import {
  $,
  DETAIL_SLOT,
  FAC,
  FD_LEVEL_COST,
  J,
  MAX_LEVEL,
  MON,
  PET_BENCH_BUFF,
  PET_EQ_BUFF,
  PET_GEAR_POWER,
  PET_LV,
  PET_SKILL_CD,
  PET_SKILL_MAX,
  PET_SKILL_NAMES,
  PET_SKILL_RAD,
  PET_SLOTS,
  REALM_CD,
  REALM_HT_CHANCE,
  REALM_KILLS,
  RAR_COL,
  SERIES,
  SERIES_COL,
  SERIES_ELEM,
  SINH,
  SK,
  STAR_ATK_PCT,
  STAR_COST,
  STAR_MAX,
  STAR_NAMES,
  STAR_REQ_LV,
  STAGES,
  TEAM_CHAIN_PCT,
  TEAM_SAME_ATK,
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
  petElemOf,
  pick,
  rnd,
  soLevelCost,
  wpick,
} from './core';
import { itemPower, makeItem, sexPart } from './loot';
import {
  JFX,
  MON_SCALE,
  NAME_COL,
  addText,
  burst,
  dirOf,
  drawAnim,
  img,
  label,
  setAct,
  skillFx,
  stepAct,
} from './render';
import { S, save } from './save';
import { enoughToActive, makeSetItem, tower2SetReward } from './sets';
import { potStock } from './shop';
import { addAttr, autoSpendAttrs, sexReqOk } from './stats';
import { addItem, closeModal, findItem, itemHTML, log, modal, refresh, setInvDirty, toast } from './ui';
import { obsSteer } from './mapobs';
import { codexModal } from './guide';
import { matAdd, matHave, HT_MAX } from './recipes';
import { WB_EVERY, WB_FIRST, WB_MIN_LV } from './worldboss';
import { thanMaBind, thanMaBody } from './horse';
import { tamPhapModal, tpPending, applyWeekMod } from './depth';
import { TOWER2, t2mul, tp2Pending, tower2Bonuses, tower2Floor, tower2Level, tower2OptionModal, tower2Unlocked } from './tower2';
import { localISODay } from './journal';
import { actBind, actBody } from './activities';

/* ======================= PHAN THUONG NGOAI GAME GOC (docs/DE_XUAT.md) =======================
   1 diem danh 7/30 ngay · 2 nhiem vu ngay · 3 thanh tuu + danh hieu · 4 trum Hoang Kim dinh ky · 5 thuong offline theo moc
   6 thap thu thach · 7 chuyen sinh (toi da 5 lan) · 8 dong hanh · 9 su kien theo mua · 10 ruong Phuc Duyen */
'use strict';
const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const today = () => dayKey(new Date());
const weekKey = d => { const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()); t.setDate(t.getDate() - (t.getDay() + 6) % 7); return dayKey(t); };   // Thu Hai cua tuan: doi tuan -> key doi
export const GB_EVERY = 1800, GB_RETRY = 300;     // trum Hoang Kim: moi 30 phut choi; thua thi 5 phut sau quay lai
export const REBORN_LV = MAX_LEVEL, REBORN_MAX = 10;  // chuyen sinh toi da 10 lan (TS1-TS5 tam phap, TS6-TS10 diem Thap II — theo ban vinarpg)
const FD_COST = 10;
export function RW() { // trang thai phan thuong trong file luu (tao / bo sung truong khi nap file cu)
  const r = S.rw || (S.rw = {});
  r.stat = Object.assign({ kills: 0, bosses: 0, goldBoss: 0, picked: 0, towerBest: 0, reborn: 0, chests: 0, tokens: 0, wboss: 0 }, r.stat || {});
  r.login = Object.assign({ last: '', streak: 0, total: 0, got: {}, claimed: true }, r.login || {});
  r.ach = r.ach || {}; r.title = r.title || ''; r.fd = r.fd || 0; if (r.gbT == null) r.gbT = GB_EVERY;
  r.pet = r.pet || null;
  /* Roster Dong hanh (docs/PET-MO-RONG.md): rw.pets theo tid, rw.pet = cung tham chieu voi entry
     ra tran (rw.team[0]) — mutate qua rw.pet tu dong cap nhat roster, khong diverge. */
  if (!r.pets || typeof r.pets !== 'object') r.pets = {};
  if (r.pet && typeof r.pet === 'object' && !r.pets[r.pet.tid]) r.pets[r.pet.tid] = r.pet;   // save cu 1 pet -> roster
  if (!r.team || !Array.isArray(r.team) || r.team.length !== 3) r.team = [null, null, null];
  r.team = r.team.map(t => (t && r.pets[t]) ? t : null);                                    // chi giu loai da so huu
  if (!r.pet || r.pets[r.pet.tid] !== r.pet) r.pet = r.team[0] ? r.pets[r.team[0]] : null;
  r.team[0] = r.pet ? r.pet.tid : null;
  if (!r.pet) { const first = Object.keys(r.pets)[0]; if (first) { r.pet = r.pets[first]; r.team[0] = first; } }
  { const used = new Set(r.pet ? [r.pet.tid] : []);                                        // 1 loai chi dung 1 cho
    r.team = r.team.map((t, i) => i === 0 ? r.team[0] : (t && !used.has(t) ? (used.add(t), t) : null)); }
  for (const tid in r.pets) {
    const p = r.pets[tid]; if (!p || typeof p !== 'object') { delete r.pets[tid]; continue; }
    p.lvl = Math.max(1, Math.floor(+p.lvl) || 1); p.xp = Math.max(0, +p.xp || 0);
    if (!(p.star >= 0)) p.star = 0;
    if (!p.eq || typeof p.eq !== 'object') p.eq = {};
  }
  if (r.pet && (!r.pet.eq || typeof r.pet.eq !== 'object')) r.pet.eq = {};
  r.petSeen = r.petSeen && typeof r.petSeen === 'object' ? r.petSeen : {};
  if (r.pet) r.petSeen[r.pet.tid] = 1;
  r.realmCd = r.realmCd && typeof r.realmCd === 'object' ? r.realmCd : {};
  r.petF = Object.assign({ elemOnly: 0, keep: 1 }, r.petF && typeof r.petF === 'object' ? r.petF : {});
  r.codexPet = r.codexPet && typeof r.codexPet === 'object' ? r.codexPet : {};
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
export const unlocked = lv => S.lvl >= lv || RW().stat.reborn > 0;
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
export const ACH = [
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
export function goldBossTick(dt) { if (S.fac && !R.town && !R.tower && !R.wbArena && !R.petRealm) RW().gbT -= dt; }   // wbArena/petRealm: hai boss và bí cảnh không chạy song song
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
  petRealmAbort(true);                                   // vao thap: nghi bi canh
  R.tower = { floor: Math.max(1, RW().stat.towerBest - 4) }; R.enemies = []; R.corpses = []; R.spawnT = 0.5;
  R.banner = { t: 2, text: `Tháp thử thách · tầng ${R.tower.floor}`, sub: 'Gục ngã là rời tháp' }; closeModal(true);
}
const towerLevel = f => Math.min(MAX_LEVEL, 10 + f * 4);
export function towerSpawn() {
  const f = R.tower.floor, is2 = R.tower.id === 2, L = is2 ? tower2Level(f) : towerLevel(f), z = ZONES[Math.min(ZONES.length - 1, Math.floor(f / (is2 ? 12 : 3)))], boss = f % 5 === 0;
  R.enemies = []; R.stall = 0;
  const n = boss ? 1 : 3 + (f % 3);
  for (let i = 0; i < n; i++) {
    const [x, y] = inWorld(H.x + rnd(-260, 260), H.y + rnd(-220, 220)), e = makeEnemy(boss ? z.boss : pick(z.m), L, boss ? 'boss' : 'elite', x, y);
    if (is2) { const m = t2mul(f, e.cls); e.hp = e.max = e.max * m.hp; e.dmg *= m.dmg; e.towerId = 2; e.towerFloor = f; applyWeekMod(e); }
    R.enemies.push(e);
  }
}
export function towerCleared() {
  const r = RW(), f = R.tower.floor, is2 = R.tower.id === 2;
  if (is2) {
    if (f > (r.stat.tower2Best || 0)) {
      r.stat.tower2Best = f;
      if (f % 5 === 0) {
        const it = tower2SetReward(f, 'milestone');   // mốc 5 tầng: chance bộ Tháp II (tầng 200→Thiên Cực, 180→bộ vàng)
        grant({ fd: 50, gold: 2000 * f }, `Tháp II tầng ${f}`);
        if (it) { addItem(it, true, true, true); log(`🎁 Tháp II tầng ${f}: <b style="color:${RAR_COL[it.r]}">${esc(it.n)}</b>`); }
      } else grant({ fd: 5, gold: 2000 * f }, `Tháp II tầng ${f}`);
    }
    questTick('tower'); achCheck();
    const b = tower2Bonuses();
    heal(R.P.life * (0.3 + b.heal), true); R.mana = Math.min(R.P.mana, R.mana + R.P.mana * 0.3);
    R.tower.floor++; R.spawnT = 1.5;
    return;
  }
  if (f > r.stat.towerBest) { r.stat.towerBest = f; grant(f % 5 === 0 ? { set: 1, fd: 10 } : { gold: 200 * f, fd: 2 }, `Tháp tầng ${f}`); }
  questTick('tower'); achCheck();
  heal(R.P.life * 0.3, true); R.mana = Math.min(R.P.mana, R.mana + R.P.mana * 0.3);
  R.tower.floor++; R.spawnT = 1.5; R.banner = { t: 1.5, text: `Tầng ${R.tower.floor}`, sub: `Quái cấp ${towerLevel(R.tower.floor)}` };
}
export function towerExit(dead) {
  if (!R.tower) return;
  if (R.tower.id === 2) {
    const f = R.tower.floor, r = RW();
    if (dead) r.tower2Floor = tower2Floor(Math.max(1, f - TOWER2.lossFloors));   // guc: lui 10 tang
    else r.tower2Floor = tower2Floor(Math.max(1, f - 1));                          // roi chieu: lam lai tang nay
    r.stat.tower2Best = Math.max(r.stat.tower2Best || 0, f - 1);
    log(`${dead ? 'Gục ở' : 'Rời'} Tháp II tầng ${f}. Sẽ vào lại từ tầng ${r.tower2Floor}. Kỷ lục: tầng ${r.stat.tower2Best}`);
    R.tower = null; R.enemies = []; S.wave = 1; R.spawnT = 0.5; R.zoneShown = null; save(); refresh();
    return;
  }
  log(`${dead ? 'Gục ở' : 'Rời'} tháp thử thách tầng ${R.tower.floor}. Kỷ lục: ${RW().stat.towerBest}`);
  R.tower = null; R.enemies = []; S.wave = 1; R.spawnT = 0.5; R.zoneShown = null;
}
/* Vao Thap II: can chuyen sinh 5, vao tu con tro tower2Floor (mac dinh ky luc + 1) */
export function tower2Start() {
  if (R.town) backFromTown();
  petRealmAbort(true);
  if (!tower2Unlocked()) { toast(`Tháp II mở ở chuyển sinh ${TOWER2.reborn}`); return; }
  const r = RW(), f = tower2Floor(r.tower2Floor == null ? (r.stat.tower2Best || 0) + 1 : r.tower2Floor);
  r.tower2Floor = f;
  R.tower = { id: 2, floor: f }; R.enemies = []; R.corpses = []; R.spawnT = 0.5;
  closeModal(true); refresh();
}

/* ---------- 7. chuyen sinh (level_exp.txt co 5 cot chuyen sinh -> toi da 5 lan) ---------- */
export function rebornBonus() { const n = S.rw && S.rw.stat ? S.rw.stat.reborn || 0 : 0; return { xp: 0.2 * n, dmg: 0.1 * n }; }
function doReborn() {
  const r = RW();
  if (S.lvl < REBORN_LV || r.stat.reborn >= REBORN_MAX) return;
  if (!confirm('Chuyển sinh: về cấp 1, giữ trang bị và võ công. Tiếp tục?')) return;
  r.stat.reborn++;
  if (r.stat.reborn <= 5) r.tpPend = (r.tpPend | 0) + 1;      // TS1-TS5: tam phap
  else r.tp2Pend = (r.tp2Pend | 0) + 1;                        // TS6-TS10: diem Thap II
  S.lvl = 1; S.xp = 0; S.attr = { str: 0, dex: 0, vit: 0, eng: 0 }; S.attrPts = r.stat.reborn * 50;
  S.stage = 1; S.wave = 1; S.push = true; R.tower = null; R.enemies = []; R.dirty = true; R.zoneShown = null;
  log(`<b class="up">Chuyển sinh lần ${r.stat.reborn}!</b> +${r.stat.reborn * 20}% kinh nghiệm, +${r.stat.reborn * 10}% sát thương`);
  if (S.autoPts === true) autoSpendAttrs();
  achCheck(); closeModal(true); refresh(); save();
  if (tpPending()) tamPhapModal();                   // chon tam phap ngay sau khi chuyen sinh
  if (tp2Pending()) tower2OptionModal();
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
  const star = p.star | 0;
  atk *= 1 + STAR_ATK_PCT * star / 100;                        // pham chat: moi sao +12%
  if (p === (S.rw && S.rw.pet) && teamSameOk()) atk *= 1 + TEAM_SAME_ATK / 100;   // Tam Dong Khi: 3 con cung he
  return { lvl, elem, star, atk, crit: clamp(crit, 0, 60), cd: clamp(1.2 / (1 + aspd / 100), 0.5, 3), power };
}
/* He cua 3 con trong doi hinh [ra tran, ho menh 1, ho menh 2] */
function teamElems() {
  const r = S.rw; if (!r || !Array.isArray(r.team)) return [];
  return r.team.map(tid => (tid && MON[tid]) ? petElemOf(tid) : null);
}
/* Tam Tuong Sinh: 3 con tao chuoi sinh ke tiep (Kim->Thuy->Moc->Hoa->Tho hoac doan nao do chuoi) */
export function teamChainOk() {
  const es = teamElems();
  return es.length === 3 && es.every(e => e != null) && SINH[es[0]] === es[1] && SINH[es[1]] === es[2];
}
export function teamSameOk() {
  const es = teamElems();
  return es.length === 3 && es[0] != null && es[0] === es[1] && es[1] === es[2];
}
function petChoices() {
  const zs = ZONES.slice(0, zoneIdx(Math.min(S.maxStage, STAGES)) + 1);
  return [...new Set(zs.flatMap(z => z.m))].filter(t => MON[t] && MON[t].anim).slice(0, 20);
}
function petGrouped() { const g = [[], [], [], [], []]; for (const t of petChoices()) g[petElemOf(t)].push(t); return g; }
/* Moi loai la 1 con rieng trong roster; nhan loai = chuyen con do ra tran (giu nguyen cap/eq cua no) */
function petAdopt(tid) {
  const r = RW();
  if (!r.pets[tid]) r.pets[tid] = { tid, lvl: 1, xp: 0, eq: {}, star: 0 };
  r.petSeen[tid] = 1;
  r.team[0] = tid; r.pet = r.pets[tid];
  R.petPos = null; R.petLoot = null; R.dirty = true;
  toast(`Đồng hành: ${MON[tid].n} · hệ ${SERIES[petElemOf(tid)]}`);
  save(); refresh(); refreshGift();
}
/* Doi thanh vien doi hinh: i=0 ra tran (pet.roster), i=1..2 ho menh (khong trung loai) */
export function teamSet(i, tid) {
  const r = RW(); tid = tid ? +tid : null;
  if (i === 0) {
    if (!tid || !r.pets[tid]) return;
    r.team = r.team.map(t => t === tid ? null : t);          // ha loai nay khoi cho khac truoc khi ra tran
    r.team[0] = tid; r.pet = r.pets[tid]; R.petPos = null; R.petLoot = null;
  } else {
    if (r.team[i] === tid) tid = null;
    if (tid && (r.team[0] === tid || r.team[3 - i] === tid)) { toast('Loài này đã trong đội hình'); return; }
    if (tid && !r.pets[tid]) return;
    r.team[i] = tid || null;
  }
  R.dirty = true; save(); refresh();
}
function petDmg(p) { return petStats(p).atk; }
/* ---------- ky nang Dong hanh theo loài (port tu rewards.js goc) ----------
   Moi loài pet co bo ky nang rieng: chiêu dau mo san, chiêu thu hai o cap 30.
   Loài không co trong PET_SKILLS giữ chiêu AoE hệ (tính năng cũ) làm fallback. */
const petSkillIcon = id => (SK[id] && SK[id].ic) || '';
const PET_SKILLS = {
  11: [
    { key: 'boarCharge', n: 'Sơn Trư Xung Kích', d: 'Húc mục tiêu gây sát thương mạnh.', ic: petSkillIcon(34), fx: 14, kind: 'strike', mult: 1.8, cd: 8, col: '#ffd36a' },
    { key: 'boarQuake', n: 'Chấn Địa', d: 'Dậm đất gây sát thương lan và choáng.', ic: petSkillIcon(41), fx: 41, kind: 'stunArea', mult: 1.05, splash: 0.55, rad: 86, stun: 0.65, cd: 14, lv: 30, col: '#ffc45c' },
  ],
  12: [
    { key: 'hedgehogSpines', n: 'Cương Châm', d: 'Phóng gai và khiến mục tiêu trúng độc.', ic: petSkillIcon(73), fx: 65, kind: 'poison', mult: 0.8, dot: 1.15, cd: 8, col: '#9fe36a' },
    { key: 'hedgehogVolley', n: 'Vạn Châm', d: 'Bắn gai trúng nhiều kẻ địch quanh mục tiêu.', ic: petSkillIcon(54), fx: 105, kind: 'area', mult: 1.05, splash: 0.72, rad: 100, cd: 14, lv: 30, col: '#a9e875' },
  ],
  42: [
    { key: 'deerRenewal', n: 'Linh Lộc Hồi Xuân', d: 'Gây sát thương nhẹ và hồi sinh lực cho chủ nhân.', ic: petSkillIcon(93), fx: 80, kind: 'heal', mult: 0.6, heal: 0.055, cd: 9, col: '#8fe3ad' },
    { key: 'deerCalm', n: 'Thanh Tâm', d: 'Gây sát thương và hồi sinh lực, nội lực.', ic: petSkillIcon(166), fx: 82, kind: 'restore', mult: 0.8, heal: 0.035, mana: 0.04, cd: 15, lv: 30, col: '#9ee8c2' },
  ],
  43: [
    { key: 'whiteBoarCharge', n: 'Bạch Trư Húc', d: 'Lao tới gây sát thương lớn lên một kẻ địch.', ic: petSkillIcon(14), fx: 14, kind: 'strike', mult: 2.2, cd: 9, col: '#f2d8bd' },
    { key: 'whiteBoarGuard', n: 'Thiết Bì', d: 'Hồi một phần sinh lực cho chủ nhân.', ic: petSkillIcon(92), fx: 91, kind: 'heal', mult: 0.45, heal: 0.085, cd: 16, lv: 30, col: '#e6d6c4' },
  ],
  31: [
    { key: 'goldCatClaws', n: 'Kim Trảo Liên Kích', d: 'Liên tiếp đánh mục tiêu hai lần.', ic: petSkillIcon(47), fx: 30, kind: 'multi', hits: 2, mult: 0.85, cd: 8, col: '#ffd34f' },
    { key: 'goldCatShadow', n: 'Tốc Ảnh', d: 'Lướt qua và đánh tối đa ba kẻ địch.', ic: petSkillIcon(336), fx: 336, kind: 'chain', hits: 3, mult: 1.05, falloff: 0.72, rad: 150, cd: 14, lv: 30, col: '#ffe477' },
  ],
  5: [
    { key: 'grayWolfFang', n: 'Lang Nha', d: 'Cắn mục tiêu, mạnh hơn khi mục tiêu còn ít máu.', ic: petSkillIcon(125), fx: 34, kind: 'execute', mult: 1.5, at: 0.35, finisher: 1.35, cd: 8, col: '#b9d7f3' },
    { key: 'grayWolfPursuit', n: 'Truy Sát', d: 'Tấn công dồn dập và có thể làm choáng.', ic: petSkillIcon(128), fx: 172, kind: 'stun', mult: 1.25, stun: 0.8, cd: 14, lv: 30, col: '#9fc8ef' },
  ],
  6: [
    { key: 'redWolfFlame', n: 'Xích Diệm Trảo', d: 'Cào xé và đốt mục tiêu theo thời gian.', ic: petSkillIcon(141), fx: 145, kind: 'poison', mult: 1, dot: 1.3, cd: 8, col: '#ff8b5c' },
    { key: 'redWolfBlaze', n: 'Cuồng Hỏa', d: 'Phóng hỏa khí gây sát thương lan.', ic: petSkillIcon(148), fx: 141, kind: 'area', mult: 1.25, splash: 0.68, rad: 105, cd: 14, lv: 30, col: '#ff744d' },
  ],
  34: [
    { key: 'lynxPounce', n: 'Liệp Ảnh', d: 'Bổ nhào gây sát thương chí mạng.', ic: petSkillIcon(249), fx: 249, kind: 'strike', mult: 2.35, cd: 9, col: '#d7bdff' },
    { key: 'lynxPhantom', n: 'Ảo Bộ', d: 'Đánh nhanh khiến mục tiêu choáng.', ic: petSkillIcon(113), fx: 172, kind: 'stun', mult: 1.35, stun: 0.9, cd: 14, lv: 30, col: '#c9a8ff' },
  ],
  33: [
    { key: 'bearPaw', n: 'Hùng Chưởng', d: 'Vỗ mạnh, gây sát thương lan và choáng.', ic: petSkillIcon(20), fx: 41, kind: 'stunArea', mult: 1.25, splash: 0.62, rad: 92, stun: 0.7, cd: 9, col: '#d6ad83' },
    { key: 'bearFury', n: 'Cuồng Nộ', d: 'Tấn công rồi hồi sinh lực cho chủ nhân.', ic: petSkillIcon(271), fx: 91, kind: 'heal', mult: 1.1, heal: 0.055, cd: 15, lv: 30, col: '#e8b780' },
  ],
  36: [
    { key: 'monkeyPebbles', n: 'Phi Thạch', d: 'Ném đá trúng tối đa ba kẻ địch.', ic: petSkillIcon(302), fx: 336, kind: 'chain', hits: 3, mult: 1.05, falloff: 0.7, rad: 180, cd: 8, col: '#d8c39a' },
    { key: 'monkeyCombo', n: 'Khỉ Quyền', d: 'Đánh liên hoàn ba lần vào mục tiêu.', ic: petSkillIcon(359), fx: 50, kind: 'multi', hits: 3, mult: 0.65, cd: 14, lv: 30, col: '#ead4a6' },
  ],
  9: [
    { key: 'foxFire', n: 'Hồ Hỏa', d: 'Gọi hồ hỏa tấn công cả nhóm địch.', ic: petSkillIcon(169), fx: 186, kind: 'area', mult: 1.35, splash: 0.8, rad: 112, cd: 9, col: '#ff9cda' },
    { key: 'foxConfusion', n: 'Mê Tung', d: 'Đánh lạc hướng và làm choáng mục tiêu.', ic: petSkillIcon(90), fx: 113, kind: 'stun', mult: 1.15, stun: 1.05, cd: 15, lv: 30, col: '#f2a8ff' },
  ],
  27: [
    { key: 'batBloodClaw', n: 'Huyết Trảo', d: 'Cắn hút máu, hồi sinh lực cho chủ nhân.', ic: petSkillIcon(65), fx: 65, kind: 'leech', mult: 1.35, heal: 0.045, cd: 8, col: '#e38cff' },
    { key: 'batSoulDrain', n: 'Hút Hồn', d: 'Hút sinh lực và nội lực từ mục tiêu.', ic: petSkillIcon(69), fx: 68, kind: 'restore', mult: 1.05, heal: 0.04, mana: 0.06, cd: 14, lv: 30, col: '#c99bff' },
  ],
  45: [
    { key: 'spiderBite', n: 'Tơ Độc', d: 'Cắn mục tiêu và gây độc theo thời gian.', ic: petSkillIcon(63), fx: 63, kind: 'poison', mult: 0.9, dot: 1.1, cd: 8, col: '#9bd879' },
    { key: 'spiderWeb', n: 'Thiên La Địa Võng', d: 'Rải tơ lên nhiều mục tiêu, gây sát thương và làm chậm.', ic: petSkillIcon(105), fx: 105, kind: 'area', mult: 0.9, splash: 0.6, rad: 100, slow: 0.48, slowDur: 2.4, poison: 0.35, cd: 16, lv: 30, col: '#b3e38a' },
  ],
  21: [
    { key: 'greenSnakeVenom', n: 'Nọc Xanh', d: 'Đưa nọc độc vào mục tiêu, sát thương kéo dài.', ic: petSkillIcon(63), fx: 63, kind: 'poison', mult: 1, dot: 1.2, cd: 8, col: '#79dd76' },
    { key: 'greenSnakeCorrode', n: 'Nọc Ăn Mòn', d: 'Làm mục tiêu suy yếu, nhận thêm sát thương trong chốc lát.', ic: petSkillIcon(385), fx: 385, kind: 'expose', mult: 1.25, expose: 1.12, exposeDur: 3.5, cd: 15, lv: 30, col: '#a5ed8b' },
  ],
  24: [
    { key: 'goldenEagleDive', n: 'Ưng Kích', d: 'Lao xuống đánh nhanh một mục tiêu.', ic: petSkillIcon(50), fx: 50, kind: 'multi', hits: 2, mult: 0.75, cd: 8, col: '#ffe08a' },
    { key: 'goldenEagleRain', n: 'Thiên Vũ', d: 'Bắn loạt đạn xuyên qua nhiều kẻ địch.', ic: petSkillIcon(336), fx: 336, kind: 'chain', hits: 4, mult: 0.82, falloff: 0.78, rad: 180, cd: 14, lv: 30, col: '#fff0a8' },
  ],
  13: [
    { key: 'elephantCharge', n: 'Voi Xung Trận', d: 'Húc mạnh, gây sát thương lan và choáng ngắn.', ic: petSkillIcon(138), fx: 138, kind: 'stunArea', mult: 1.35, splash: 0.62, rad: 105, stun: 0.55, cd: 9, col: '#d9c59b' },
    { key: 'elephantGuard', n: 'Thiết Bì Hộ Chủ', d: 'Tấn công rồi giảm sát thương chủ nhân phải chịu.', ic: petSkillIcon(91), fx: 91, kind: 'guard', mult: 0.8, guard: 0.18, guardDur: 4.5, cd: 17, lv: 30, col: '#c4d4b0' },
  ],
  148: [
    { key: 'leopardHunt', n: 'Liệp Sát', d: 'Đánh chí mạng, mạnh hơn khi mục tiêu gần hết máu.', ic: petSkillIcon(249), fx: 249, kind: 'execute', mult: 1.45, at: 0.4, finisher: 1.45, cd: 9, col: '#f2c47e' },
    { key: 'leopardBleed', n: 'Huyết Trảo', d: 'Xé rách mục tiêu, gây chảy máu theo thời gian.', ic: petSkillIcon(145), fx: 145, kind: 'bleed', mult: 1.05, bleed: 1.25, bleedDur: 3.5, cd: 14, lv: 30, col: '#f28b72' },
  ],
  2: [
    { key: 'whiteTigerClaw', n: 'Bạch Hổ Trảo', d: 'Vồ tới gây sát thương lớn lên một mục tiêu.', ic: petSkillIcon(317), fx: 317, kind: 'execute', mult: 1.6, at: 0.35, finisher: 1.5, cd: 9, col: '#f6e4c2' },
    { key: 'whiteTigerRoar', n: 'Hổ Khiếu', d: 'Gầm vang, tăng sát thương của chủ nhân và đồng hành.', ic: petSkillIcon(186), fx: 186, kind: 'rage', mult: 0.9, rage: 1.1, rageDur: 5, cd: 19, lv: 30, col: '#ffe7aa' },
  ],
};
const PET_SKILL_DEFAULT = [
  { key: 'companionStrike', n: 'Cường Kích', d: 'Tấn công mạnh hơn vào mục tiêu.', fx: 34, kind: 'strike', mult: 1.5, cd: 9, col: '#9fe36a' },
  { key: 'companionRenewal', n: 'Hồi Xuân', d: 'Tấn công và hồi sinh lực cho chủ nhân.', fx: 91, kind: 'heal', mult: 0.75, heal: 0.04, cd: 15, lv: 30, col: '#9fe36a' },
];
function petSkills(tid) { return PET_SKILLS[tid] || PET_SKILL_DEFAULT; }
export function petSkillRows(tid, lvl = 1) {
  return petSkills(tid).map(s => `<div class="petskill${lvl >= (s.lv || 1) ? '' : ' lock'}"><div class="petskill-head">${s.ic ? `<img src="${esc(s.ic)}" alt="">` : ''}<b>${esc(s.n)}</b></div><small>${esc(s.d)}${s.lv && lvl < (s.lv || 1) ? ` · mở ở cấp ${s.lv}` : ''}</small></div>`).join('');
}
/* Vai trò giúp người chơi chọn đồng hành theo nhu cầu chiến đấu, không cần đoán từ tên chiêu. */
const PET_ROLES = {
  11: { tags: ['Khống chế', 'Đánh lan'], fit: 'Hợp khi bị nhiều quái áp sát: dậm đất đánh quanh mình và làm choáng.' },
  12: { tags: ['Đánh lan', 'Độc'], fit: 'Hợp khi cần dọn nhóm quái; gai gây độc và chiêu cấp 30 bắn trúng nhiều mục tiêu.' },
  42: { tags: ['Hồi phục', 'Hỗ trợ'], fit: 'Hợp khi muốn trụ lâu: thường xuyên hồi sinh lực, rồi hồi thêm nội lực ở cấp 30.' },
  43: { tags: ['Dồn sát thương', 'Hồi phục'], fit: 'Hợp khi muốn vừa đánh mạnh một mục tiêu vừa có một lần hồi sinh lực.' },
  31: { tags: ['Liên kích', 'Đánh lan'], fit: 'Hợp khi muốn dồn nhiều đòn nhanh và lướt đánh tiếp các mục tiêu gần.' },
  5: { tags: ['Kết liễu', 'Choáng'], fit: 'Hợp khi săn mục tiêu yếu máu: đòn cắn đau hơn lúc gần hết máu, chiêu sau có thể làm choáng.' },
  6: { tags: ['Độc', 'Đánh lan'], fit: 'Hợp khi đánh nhóm đông: đốt mục tiêu đơn lẻ rồi phóng hỏa khí gây sát thương lan.' },
  34: { tags: ['Dồn sát thương', 'Choáng'], fit: 'Hợp khi cần áp sát một mục tiêu, gây cú bổ mạnh rồi khóa chân bằng choáng.' },
  33: { tags: ['Đánh lan', 'Choáng', 'Hồi phục'], fit: 'Hợp khi cần khống chế đám đông nhưng vẫn có thêm hồi phục cho chủ nhân.' },
  36: { tags: ['Đánh nhiều mục tiêu', 'Liên kích'], fit: 'Hợp khi quái đứng thành nhóm: ném đá nhiều mục tiêu và đánh liên hoàn khi lên cấp 30.' },
  9: { tags: ['Đánh lan', 'Khống chế'], fit: 'Hợp khi dọn bầy quái: hồ hỏa đánh cả nhóm, chiêu sau làm choáng mục tiêu.' },
  27: { tags: ['Hút máu', 'Hồi nội lực'], fit: 'Hợp khi cần tự hồi phục trong lúc đánh: hút sinh lực và nội lực từ địch.' },
  45: { tags: ['Độc', 'Làm chậm', 'Đánh lan'], fit: 'Hợp khi muốn ghìm nhóm quái: tơ độc đánh lan và làm chậm chúng.' },
  21: { tags: ['Độc', 'Tăng sát thương'], fit: 'Hợp khi săn trùm hoặc mục tiêu trâu máu: nọc độc kéo dài và khiến địch nhận thêm sát thương.' },
  24: { tags: ['Tấn công nhanh', 'Đánh lan'], fit: 'Hợp khi muốn đánh liên tục và chuyển đòn qua nhiều kẻ địch.' },
  13: { tags: ['Chống chịu', 'Khống chế'], fit: 'Hợp khi cần thêm phòng thủ: húc choáng diện rộng và giảm sát thương chủ nhân phải chịu.' },
  148: { tags: ['Kết liễu', 'Chảy máu'], fit: 'Hợp khi tập trung hạ một mục tiêu: mạnh hơn lúc địch yếu và gây chảy máu.' },
  2: { tags: ['Kết liễu', 'Tăng sát thương'], fit: 'Hợp khi săn mục tiêu lớn: vồ kết liễu rồi tăng sát thương cho cả chủ nhân và pet.' },
};
function petRole(tid) { return PET_ROLES[tid] || { tags: ['Tấn công'], fit: 'Đồng hành hỗ trợ chủ nhân bằng các đòn đánh và kỹ năng riêng.' }; }
export function petRoleTags(tid) { return petRole(tid).tags.map(tag => `<span class="pet-role-tag">${esc(tag)}</span>`).join(''); }
/* Dùng lại sprite sheet chiêu môn phái cho đồng hành, xuất phát từ vị trí pet. */
function petSkillFx(source, target, skillId) {
  if (!source || !target || !skillId || !JFX.f[skillId]) return;
  skillFx(source, target, { id: skillId, parts: { phys: 1 } });
}
const STUN_IMM_ELITE = 1.5, STUN_IMM_BOSS = 3;   // giây miễn nhiễm choáng tính từ lúc bị choáng
function petSkillHit(e, dmg, col) {
  if (!e || e.hp <= 0 || !(dmg > 0)) return;
  const expose = e.petExposeT > 0 ? (e.petExposeMult || 1) : 1;   // Nọc Ăn Mòn: địch nhận thêm sát thương
  const rage = R.petRageT > 0 ? (R.petRageMult || 1) : 1;         // Hổ Khiếu: pet đánh mạnh hơn
  const dealt = dmg * expose * rage * tower2Bonuses(e).dmg;
  e.hp -= dealt; e.hitT = 0.12;
  addText(e.x, e.y - e.r - 8, fmt(dealt), col || '#9fe36a', 12);
}
function petSkillHeal(amount, color) {
  if (!(amount > 0)) return;
  const got = Math.min(amount, Math.max(0, R.P.life - R.life));
  if (got > 1) { R.life += got; addText(H.x, H.y - 42, '+' + fmt(got), color || '#8fe3ad', 11); }
}
function petSkillStun(e, seconds) {
  if (!e || e.hp <= 0 || e.stunImm > 0) return;
  const duration = e.cls === 'boss' ? Math.min(seconds, 0.5) : seconds;   // trùm chỉ choáng toi da 0.5s
  e.stun = Math.max(e.stun || 0, duration);
  e.stunImm = e.cls === 'boss' ? STUN_IMM_BOSS : e.cls === 'elite' ? STUN_IMM_ELITE : 0;
}
function petSkillSlow(e, seconds, factor) {
  if (!e || e.hp <= 0) return;
  const boss = e.cls === 'boss', elite = e.cls === 'elite';
  const duration = seconds * (boss ? 0.4 : elite ? 0.7 : 1);
  const slowFactor = boss ? Math.max(0.82, factor) : elite ? Math.max(0.65, factor) : factor;
  const active = e.petSlowT > 0;
  e.petSlowT = Math.max(e.petSlowT || 0, duration);
  e.petSlowFactor = active ? Math.min(e.petSlowFactor || 1, slowFactor) : slowFactor;
}
function petSkillExpose(e, seconds, multiplier) {
  if (!e || e.hp <= 0) return;
  const boss = e.cls === 'boss';
  const active = e.petExposeT > 0;
  e.petExposeT = Math.max(e.petExposeT || 0, seconds * (boss ? 0.7 : 1));
  const next = boss ? Math.min(multiplier, 1.06) : multiplier;
  e.petExposeMult = active ? Math.max(e.petExposeMult || 1, next) : next;
}
function petSkillPoison(e, dose, seconds = 3) {   // gộp vào doc dang co (dung chung truong cua combat.ts)
  if (!e || e.hp <= 0 || !(dose > 0)) return;
  const left = e.poison > 0 ? e.poisonDmg * e.poison : 0;
  e.poisonDmg = (left + dose * tower2Bonuses(e).dmg) / seconds; e.poison = seconds;
}
function petSkillBleed(e, dose, seconds = 3) {
  if (!e || e.hp <= 0 || !(dose > 0)) return;
  const left = e.petBleedT > 0 ? e.petBleedDmg * e.petBleedT : 0;
  e.petBleedDmg = (left + dose * tower2Bonuses(e).dmg) / seconds; e.petBleedT = seconds;
}
function petCastSkill(s, p, target) {
  const pos = R.petPos || H;
  addText(pos.x, pos.y - 34, s.n + '!', s.col, 10);
  if (s.fx) petSkillFx(pos, target || H, s.fx);
  const base = petDmg(p);
  if (s.heal) burst(H.x, H.y - 18, s.col);
  if (s.kind === 'heal' || s.kind === 'restore') petSkillHeal(R.P.life * s.heal, s.col);
  if (s.kind === 'restore' && s.mana) {
    const got = Math.min(R.P.mana * s.mana, Math.max(0, R.P.mana - R.mana));
    if (got > 1) { R.mana += got; addText(H.x, H.y - 56, '+' + fmt(got) + ' NL', '#83d7ff', 10); }
  }
  if (s.kind === 'heal' || s.kind === 'restore') { if (target && target.hp > 0) petSkillHit(target, base * (s.mult || 0), s.col); return; }
  if (!target || target.hp <= 0) return;
  let mult = s.mult || 0;
  let hitTargets = [target];
  if (s.kind === 'execute' && target.hp <= target.max * s.at) mult *= s.finisher || 1.3;
  if (s.kind === 'multi') {
    for (let i = 0; i < (s.hits || 2) && target.hp > 0; i++) petSkillHit(target, base * mult, s.col);
  } else if (s.kind === 'area' || s.kind === 'stunArea') {
    const nearby = alive().filter(e => e !== target && Math.hypot(e.x - target.x, e.y - target.y) <= s.rad);
    hitTargets = [target, ...nearby];
    petSkillHit(target, base * mult, s.col);
    for (const e of nearby) petSkillHit(e, base * mult * (s.splash || 0.6), s.col);
  } else if (s.kind === 'chain') {
    hitTargets = [target, ...alive().filter(e => e !== target && Math.hypot(e.x - target.x, e.y - target.y) <= s.rad)
      .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))].slice(0, s.hits || 3);
    hitTargets.forEach((e, i) => petSkillHit(e, base * mult * (i ? s.falloff || 0.7 : 1), s.col));
  } else {
    petSkillHit(target, base * mult, s.col);
  }
  for (const e of hitTargets) {
    if (s.kind === 'poison' || s.poison) petSkillPoison(e, base * (s.dot || s.poison || 1));
    if (s.slow) petSkillSlow(e, s.slowDur || 2, s.slow);
    if (s.expose) petSkillExpose(e, s.exposeDur || 3, s.expose);
    if (s.bleed) petSkillBleed(e, base * s.bleed, s.bleedDur || 3);
    if (s.stun) petSkillStun(e, s.stun * (s.kind === 'stunArea' && e !== target ? 0.75 : 1));
  }
  if (s.guard) {
    R.petGuardT = Math.max(R.petGuardT || 0, s.guardDur || 4);
    R.petGuardMult = Math.min(R.petGuardMult || 1, 1 - clamp(s.guard, 0, 0.4));
    burst(H.x, H.y - 18, '#b9d8b0');
    addText(H.x, H.y - 52, 'Hộ Chủ', '#c9e9bd', 10);
  }
  if (s.rage) {
    R.petRageT = Math.max(R.petRageT || 0, s.rageDur || 4);
    R.petRageMult = Math.max(R.petRageMult || 1, s.rage);
    burst(H.x, H.y - 18, s.col || '#ffe7aa');
  }
  if (s.heal && s.kind !== 'heal' && s.kind !== 'restore') petSkillHeal(R.P.life * s.heal, s.col);   // leech: hoi sau khi danh
}
/* Dem nguoc trang thai ky nang pet tren địch + chủ (gốc nam trong enemyTick cua
   combat.js; dot nay tu quet o day de khong phai sua combat.ts — file cua agent COMBAT). */
function petSweepStatus(dt) {
  if (R.petGuardT > 0) { R.petGuardT = Math.max(0, R.petGuardT - dt); if (!R.petGuardT) R.petGuardMult = 1; }
  if (R.petRageT > 0) { R.petRageT = Math.max(0, R.petRageT - dt); if (!R.petRageT) R.petRageMult = 1; }
  for (const e of R.enemies) {
    if (e.stunImm > 0) e.stunImm = Math.max(0, e.stunImm - dt);
    if (e.petSlowT > 0) e.petSlowT = Math.max(0, e.petSlowT - dt);
    if (e.petExposeT > 0) e.petExposeT = Math.max(0, e.petExposeT - dt);
    if (e.petBleedT > 0) { const elapsed = Math.min(dt, e.petBleedT); e.petBleedT = Math.max(0, e.petBleedT - dt); e.hp -= e.petBleedDmg * elapsed; }
  }
}
export function petTick(dt) {
  petSweepStatus(dt);   // dem nguoc trang thai ky nang pet (chay truoc early-return de luon duoc quet)
  const p = S.rw && S.rw.pet; if (!p || R.town || !MON[p.tid]) { R.petPos = null; R.petLoot = null; return; }
  const pp = R.petPos || (R.petPos = { x: H.x - 30, y: H.y + 10, t: 0, act: 'st', actT: 0, dir: 0 });
  /* Nhat do auto (loot.ts dat R.petLoot): pet uu tien di nhat thay nguoi; xong moi quay lai danh quai */
  const lt = R.petLoot && R.ground.indexOf(R.petLoot) >= 0 ? R.petLoot : null; if (!lt) R.petLoot = null;
  const t = lt ? null : alive().sort((a, b) => Math.hypot(a.x - pp.x, a.y - pp.y) - Math.hypot(b.x - pp.x, b.y - pp.y))[0];
  const goal = lt || t || { x: H.x - 36, y: H.y + 12 }, d = Math.hypot(goal.x - pp.x, goal.y - pp.y), reach = lt ? 16 : t ? t.r + 14 : 10;
  pp.moving = d > reach;
  if (pp.moving) {
    obsSteer(pp, goal.x, goal.y, 170 * dt); pp.dir = dirOf(goal.x - pp.x, goal.y - pp.y);   // di vong vat can nhu nhan vat
    const d1 = Math.hypot(goal.x - pp.x, goal.y - pp.y);
    pp._stk = d1 >= d - 0.5 ? (pp._stk || 0) + 1 : 0;      // khong tien duoc (ket duong): dem frame
    if (pp._stk > 30) { pp.x = H.x - 30; pp.y = H.y + 10; pp._stk = 0; pp._pp = null; }   // ket: dich ve canh chu roi di lai
  }
  if (!lt && Math.hypot(H.x - pp.x, H.y - pp.y) > 500) { pp.x = H.x - 30; pp.y = H.y + 10; }   // lac xa: dich chuyen ve canh chu (khong ap dung khi dang di nhat xa)
  pp.t -= dt;
  /* Ky nang chu dong (mo tu 1 sao): tu dung khi co quai trong ban kinh, hoi chieu PET_SKILL_CD giay.
     Cast theo bo ky nang rieng cua loài (hoäi chieu rieng tung chiêu, luu o pp.skillCd);
     luon chon chiêu khac làn truoc de hai chiêu deu co co hoi cast. */
  R.petSkillCd = Math.max(0, (R.petSkillCd || 0) - dt);
  pp.skillCd = pp.skillCd || {};
  for (const k of Object.keys(pp.skillCd)) pp.skillCd[k] = Math.max(0, pp.skillCd[k] - dt);
  if (!lt && (p.star | 0) >= 1 && R.petSkillCd <= 0) {
    const st0 = petStats(p);
    const near = alive().filter(e => Math.hypot(e.x - pp.x, e.y - pp.y) <= PET_SKILL_RAD + e.r).slice(0, PET_SKILL_MAX);
    if (near.length) { R.petSkillCd = PET_SKILL_CD; castPetSkill(pp, st0, near); }
  }
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
/* Ky nang dong hanh: loài co PET_SKILLS thì cast theo loài (choáng / làm chậm /
   hut phòng / doc / ri mau / hoi mau theo chiêu); loài không co giữ chiêu AoE hệ. */
function castPetSkill(pp, st, targets) {
  const p = S.rw && S.rw.pet;
  if (p && PET_SKILLS[p.tid] && targets && targets.length) {
    const ready = petSkills(p.tid).filter(s => p.lvl >= (s.lv || 1) && (pp.skillCd[s.key] || 0) <= 0);
    const skill = ready.find(s => s.key !== pp.lastPetSkill) || ready[0];
    if (skill) {
      pp.skillCd[skill.key] = skill.cd;
      pp.lastPetSkill = skill.key;
      petCastSkill(skill, p, targets[0]);
      return;
    }
  }
  const el = SERIES_ELEM[st.elem] || 'phys', nm = PET_SKILL_NAMES[st.elem] || 'Chiêu';
  addText(pp.x, pp.y - 46, nm + '!', SERIES_COL[st.elem], 12);
  for (const e of targets) {
    let dmg = st.atk * (2 + 0.5 * (st.star | 0)) * rnd(0.9, 1.1);
    const adv = counters(st.elem, e.series);
    if (adv) dmg *= 1.25; else if (counters(e.series, st.elem)) dmg *= 0.85;
    dmg = Math.max(1, dmg * (100 - clamp(e.res[el] || 0, -100, 95)) / 100);
    e.hp -= dmg; e.hitT = 0.15;
    addText(e.x, e.y - e.r - 6, fmt(dmg) + (adv ? ' ⚡' : ''), SERIES_COL[st.elem], 14);
  }
  burst(pp.x, pp.y, SERIES_COL[st.elem]);
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
/* Giu lai mon DANG THAT SU can cho pet — khac thi ban nhu thuong (neu khong, tu ban do thua bi phong toa).
   Chi 2 truong hop duoc giu: (1) o DANG TRONG: mon tot nhat trong tui cho o do; (2) co do roi: mon tot hon mon dang gắn.
   Tat bang toggle "Giữ đồ phù hợp cho Đồng hành" (rw.petF.keep) o the Dong hanh. */
export function petWants(it) {
  const r = S.rw, p = r && r.pet;
  if (!r || !r.petF || r.petF.keep === 0) return false;         // nguoi choi tat giu do pet
  if (!p) return false;                                         // chua dan pet nao: khong giu do cho pet (truoc day doc p.tid -> crash null)
  const slot = petSlotFor(it); if (!slot || !petUnlocked()) return false;
  if (S.inv.length >= invMax() - 6) return false;               // tui gan day: nhuong cho, ban nhu thuong
  const elem = petElemOf(p.tid);
  const okElem = x => !r.petF.elemOnly || x.s === elem;
  if (!okElem(it)) return false;                               // bo loc: chi giu do cung he pet
  const cur = p.eq && p.eq[slot];
  if (!cur) {
    let best = it;                                             // o trong: chi giu mon TOT NHAT trong tui cho o do
    for (const x of S.inv) if (x !== it && petFits(slot, x) && okElem(x) && itemPower(x) > itemPower(best)) best = x;
    return best === it;
  }
  return itemPower(it) > itemPower(cur);                       // co do: chi giu mon tot hon mon dang gan
}
function petEquip(slot, it, quiet) {
  const p = petCur(); if (!p || !petUnlocked() || !petFits(slot, it) || !S.inv.includes(it)) return;
  const old = p.eq[slot]; S.inv = S.inv.filter(x => x !== it); if (old) S.inv.unshift(old);
  p.eq[slot] = it; R.dirty = true; setInvDirty(true); save();
  if (!quiet) { closeModal(true); refresh(); toast('Gắn cho Đồng hành: ' + it.n); }
}
function petUnequip(slot) {
  const p = petCur(); if (!p || !p.eq || !p.eq[slot]) return;
  if (S.inv.length >= invMax()) { toast('Hành trang đầy'); return; }
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
/* ---------- 8c. tien hoa sao + nap linh luc + auto-gan do ---------- */
/* Tien hoa (len sao): can cap + Huyen Tinh + luong; moi sao +12% sat thuong pet, 1 sao mo ky nang */
export function petEvolve() {
  const p = petCur(); if (!p || !petUnlocked()) return;
  const star = p.star | 0;
  if (star >= STAR_MAX) { toast('Đã đạt Hoàn Mỹ'); return; }
  const c = STAR_COST[star];
  if ((p.lvl || 1) < STAR_REQ_LV[star]) { toast(`Cần Đồng hành cấp ${STAR_REQ_LV[star]} (hiện ${p.lvl})`); return; }
  if (matHave('ht', c.ht) < c.n) { toast(`Cần ${c.n} Huyền Tinh cấp ${c.ht} (có ${matHave('ht', c.ht)})`); return; }
  if (S.gold < c.gold) { toast('Không đủ ngân lượng'); return; }
  matAdd('ht', c.ht, -c.n); S.gold -= c.gold; p.star = star + 1;
  log(`Đồng hành <b>${esc(MON[p.tid].n)}</b> tiến hoá lên <b style="color:#ffb52e">${STAR_NAMES[p.star]}</b>${p.star === 1 ? ' — mở kỹ năng ' + PET_SKILL_NAMES[petElemOf(p.tid)] + '!' : ''}`);
  toast(`Tiến hoá: ${STAR_NAMES[p.star]}`); uiSfx('learn');
  R.dirty = true; save(); refresh();
}
/* Nap linh luc: tien te co san doi lay +1 cap cho pet */
export function petFeed(kind) {
  const p = petCur(); if (!p || !petUnlocked()) return;
  const need = 20 + p.lvl * 12, r = RW();
  if (kind === 'so') { const c = soLevelCost(p.lvl); if (r.so.n < c) { toast(`Cần ${c} Vỏ Sò (có ${r.so.n})`); return; } r.so.n -= c; }
  else { if (r.fd < FD_LEVEL_COST) { toast(`Cần ${FD_LEVEL_COST} Phúc Duyên (có ${r.fd})`); return; } r.fd -= FD_LEVEL_COST; }
  p.xp += need;
  while (p.xp >= 20 + p.lvl * 12) { p.xp -= 20 + p.lvl * 12; p.lvl++; }
  log(`Nạp linh lực: Đồng hành ${esc(MON[p.tid].n)} lên cấp <b>${p.lvl}</b>`);
  uiSfx('learn'); R.dirty = true; save(); refresh();
}
/* Tu gann do tot nhat cho tung o (moi 30s quet cung bo tu dong cua nhan vat; im lang) */
export function petAutoEquip() {
  if (S.autoPet === false || !petUnlocked() || !S.rw || !S.rw.pet) return 0;
  const p = S.rw.pet, eq = p.eq || (p.eq = {}); let n = 0;
  for (const [k] of PET_SLOTS) {
    const cur = eq[k]; let best = null;
    for (const it of S.inv) if (petFits(k, it) && (!best || itemPower(it) > itemPower(best))) best = it;
    if (best && (!cur || itemPower(best) > itemPower(cur) * 1.05)) { petEquip(k, best, true); n++; }
  }
  if (n) { setInvDirty(true); R.dirty = true; save(); }
  return n;
}
/* ---------- 8d. Ngu Hanh Bi Canh: 5 cua theo he, ep he quai, thuong nguyen lieu tien hoa ---------- */
export function petRealmEnter(elem) {
  const r = RW(); if (!petUnlocked() || !r.pet) return;
  if (R.tower || R.wbArena) { toast('Đang trong Tháp / Boss Thế Giới'); return; }
  if ((r.realmCd[elem] || 0) > Date.now()) { toast(`Bí Cảnh ${SERIES[elem]} đang hồi (${Math.ceil((r.realmCd[elem] - Date.now()) / 60000)} phút)`); return; }
  if (R.town) backFromTown();
  R.petRealm = { elem, got: 0, need: REALM_KILLS };
  R.enemies = []; R.corpses = []; R.spawnT = 0.5; R.zoneShown = null; R.stall = 0;
  R.banner = { t: 2.5, text: `Bí Cảnh ${SERIES[elem]}`, sub: `Hạ ${REALM_KILLS} quái hệ ${SERIES[elem]}` };
  log(`Vào <b style="color:${SERIES_COL[elem]}">Bí Cảnh ${SERIES[elem]}</b> — hạ ${REALM_KILLS} quái hệ này để nhận thưởng.`);
  closeModal(true); refresh(); save();
}
export const petRealmActive = () => !!R.petRealm;
export function petRealmAbort(quiet) {
  if (!R.petRealm) return;
  R.petRealm = null; R.enemies = []; R.spawnT = 0.5; R.zoneShown = null;
  if (!quiet) log('<span class="dim">Rời Bí Cảnh Ngũ Hành.</span>');
}
export function petRealmSpawn() {
  const z = zoneOf(Math.min(S.stage, STAGES)), L = stageLevel(S.stage), pr = R.petRealm;
  R.enemies = []; R.stall = 0;
  const around = (r0, r1) => { const a = rnd(0, Math.PI * 2), r = rnd(r0, r1); return inWorld(H.x + Math.cos(a) * r, H.y + Math.sin(a) * r); };
  const n = 2 + irnd(0, 2) + (Math.random() < 0.3 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const [x, y] = around(140, 240);
    const e = makeEnemy(pick(z.m), L, Math.random() < 0.15 ? 'elite' : 'normal', x, y);
    e.series = pr.elem;                                    // ep he theo bi canh
    R.enemies.push(e);
  }
}
function petRealmWin() {
  const elem = R.petRealm.elem, r = RW();
  r.realmCd[elem] = Date.now() + REALM_CD * 1000;
  const tier = String(clamp(Math.round(S.lvl / 12) + 1, 1, 10));
  const got = grant({ gold: 800 + S.lvl * 20, mat: { g: 'ht', k: tier, n: 2 + irnd(0, 2) }, so: irnd(1, 3) }, `Bí Cảnh ${SERIES[elem]}`);
  R.petRealm = null; R.enemies = []; R.spawnT = 0.5; R.zoneShown = null;
  R.banner = { t: 2, text: 'Bí Cảnh hoàn thành!', sub: `Hồi sau ${Math.round(REALM_CD / 60)} phút` };
  log(`<b style="color:${SERIES_COL[elem]}">Bí Cảnh ${SERIES[elem]} hoàn thành!</b> ${got.join(', ')}`);
  save(); refresh();
}
/* Goi tu rwOnKill: dem kill trong bi canh + roi Huyen Tinh theo ti le */
function petRealmOnKill(e) {
  const pr = R.petRealm; if (!pr) return;
  pr.got++;
  if (Math.random() < REALM_HT_CHANCE) {
    const k = String(clamp(Math.round(S.lvl / 12) + 1, 1, 10));
    matAdd('ht', k, 1); addText(e.x, e.y - 40, '+1 Huyền Tinh ' + k, '#8fc6ff', 10);
  }
  if (pr.got >= pr.need) petRealmWin();
}
/* ---------- 8e. duc Thu Boi (o Rèn đồ): mon petOnly chi Dong hanh mac duoc ---------- */
export function petForgeCost() {
  const tier = String(clamp(Math.round(S.lvl / 12) + 1, 1, 10));
  return { tier, ht: 30, gold: 3000 };
}
export function petForgeItem() {
  const p = petCur(); if (!p || !petUnlocked()) { toast('Cần chọn Đồng hành trước'); return null; }
  const c = petForgeCost();
  if (matHave('ht', c.tier) < c.ht) { toast(`Cần ${c.ht} Huyền Tinh cấp ${c.tier} (có ${matHave('ht', c.tier)})`); return null; }
  if (S.gold < c.gold) { toast('Không đủ ngân lượng'); return null; }
  const detail = wpick([[0, 30], [1, 10], [2, 20], [3, 8], [4, 8], [5, 6], [6, 6], [7, 4], [8, 4], [9, 4]], x => x[1])[0];
  let it = null;
  for (let k = 0; k < 8 && !it; k++) it = makeItem(detail, irnd(0, 5), clamp(Math.round(S.lvl / 12) + 1, 1, 10), 4);
  if (!it) { toast('Đúc thất bại (không có mẫu đồ phù hợp)'); return null; }
  matAdd('ht', c.tier, -c.ht); S.gold -= c.gold;
  it.s = petElemOf(p && p.tid); it.petOnly = 1; it.n = 'Thú Bội · ' + it.n;
  const rq = (it.req || []).find(q => q[0] === 37); if (rq && rq[1] >= 0) rq[1] = it.s;   // dong bo yeu cau he theo he pet
  addItem(it, true, true, true);
  log(`Đúc <b style="color:${RAR_COL[it.r]}">${esc(it.n)}</b> (hệ ${SERIES[it.s]}) — chỉ Đồng hành mặc được`);
  uiSfx('learn'); R.dirty = true; setInvDirty(true); save();
  return it;
}
/* ---------- 8f. Bach khoa Dong hanh: thuong khi du bo loai cua mot he ---------- */
function realmSpeciesOf(elem) { const out = []; for (const tid in MON) if (MON[tid].anim && petElemOf(+tid) === elem) out.push(+tid); return out; }
export function petCodexClaim(elem) {
  const r = RW(); if (r.codexPet[elem]) { toast('Đã nhận thưởng hệ này'); return; }
  const list = realmSpeciesOf(elem);
  if (!list.length || !list.every(t => r.petSeen[t])) { toast('Chưa gặp đủ loài của hệ này'); return; }
  r.codexPet[elem] = 1;
  grant({ fd: 10 }, `Bách khoa Đồng hành · đủ bộ hệ ${SERIES[elem]}`);
  save(); refresh();
}
export function renderPet() {
  const el = $('#t-pet'); if (!el) return;
  if (!petUnlocked()) { el.innerHTML = `<h3>Đồng hành</h3><p class="desc">Đồng hành mở khóa ở cấp ${PET_LV} (hoặc sau chuyển sinh). Đồng hành đi theo, cùng đánh quái, lên cấp theo số quái hạ, mang trang bị để cộng thuộc tính cho nhân vật.</p>`; return; }
  const r = RW(), p = petCur(), st = p && MON[p.tid] ? petStats(p) : null, need = p ? 20 + p.lvl * 12 : 0;
  const slots = PET_SLOTS.map(([k, vi]) => `<div class="slot" data-pslot="${k}">${p && p.eq && p.eq[k] ? petCell(p.eq[k]) : `<span>${vi}</span>`}</div>`).join('');
  const star = p ? (p.star | 0) : 0;
  const starTxt = '★'.repeat(star) + '<span class="dim">' + '★'.repeat(STAR_MAX - star) + '</span>';
  /* doi hinh: ra tran + 2 ho menh */
  const owned = Object.keys(r.pets);
  const opt = (sel, allowEmpty) => `<option value=""${!sel ? ' selected' : ''}>— trống —</option>` + owned.map(t => `<option value="${t}"${sel === +t ? ' selected' : ''}>${esc(MON[t].n)} · Lv${r.pets[t].lvl} · ${SERIES[petElemOf(+t)]}</option>`).join('');
  const teamRow = (i, vi) => `<div class="teamrow"><span>${vi}</span><select data-team="${i}">${i === 0 ? opt(r.team[0], false) : opt(r.team[i], true)}</select></div>`;
  const chain = teamChainOk(), same = teamSameOk();
  /* bien canh */
  const realmBtns = SERIES.map((nm, e) => {
    const cd = (r.realmCd[e] || 0) - Date.now();
    return `<button class="btn sm" data-realm="${e}" ${cd > 0 ? 'disabled' : ''} style="border-color:${SERIES_COL[e]}">${nm}${cd > 0 ? ` · ${Math.ceil(cd / 60000)}′` : ''}</button>`;
  }).join('');
  /* tien hoa */
  const c = STAR_COST[star] || null;
  const evoOk = p && star < STAR_MAX && (p.lvl || 1) >= STAR_REQ_LV[star] && matHave('ht', c.ht) >= c.n && S.gold >= c.gold;
  const evoTxt = star >= STAR_MAX ? 'Đã Hoàn Mỹ' : `Cần cấp ${STAR_REQ_LV[star]} · ${c.n} Huyền Tinh ${c.ht} (có ${matHave('ht', c.ht)}) · ${fmt(c.gold)} lượng`;
  const skName = PET_SKILL_NAMES[petElemOf(p && p.tid)] || '';
  const groups = petGrouped().map((list, e) => list.length ? `<div class="peGroup"><h4 style="color:${SERIES_COL[e]}">Hệ ${SERIES[e]}</h4><div class="petpick">${list.map(t => `<button data-p="${t}" class="${p && p.tid === t ? 'on' : ''}">${MON[t].img ? `<img src="${esc(MON[t].img)}" alt="">` : ''}<b>${esc(MON[t].n)}</b></button>`).join('')}</div></div>` : '').join('');
  const body = p && st ? `<div class="card stats">
      <span>Đang dẫn</span><span><b style="color:${SERIES_COL[st.elem]}">${esc(MON[p.tid].n)}</b></span>
      <span>Hệ</span><span style="color:${SERIES_COL[st.elem]}">${SERIES[st.elem]}</span>
      <span>Phẩm chất</span><span style="color:#ffb52e">${starTxt} ${STAR_NAMES[star]}</span>
      <span>Cấp</span><span>${p.lvl}</span><span>Kinh nghiệm</span><span>${Math.floor(p.xp)}/${need}</span>
      <span>Sát thương</span><span>${fmt(st.atk)}/đòn</span><span>Chu kỳ đánh</span><span>${st.cd.toFixed(2)}s</span>
      <span>Chí mạng</span><span>${Math.round(st.crit)}%</span><span>Sức mạnh trang bị</span><span>${fmt(st.power)}</span>
      <span>Kỹ năng</span><span>${star >= 1 ? `<b style="color:${SERIES_COL[st.elem]}">${esc(skName)}</b> · nổ ${fmt(st.atk * (2 + 0.5 * star))} × 3 mục tiêu · hồi ${PET_SKILL_CD}s` : '<span class="dim">Tiến hoá 1★ để mở</span>'}</span></div>
    <div class="btnrow"><button class="btn" id="pEvo" ${evoOk ? '' : 'disabled'} title="${esc(evoTxt)}">Tiến hoá ${star < STAR_MAX ? `→ ${STAR_NAMES[star + 1]}` : ''}</button>
      <button class="btn" id="pFeedSo">Nạp +1 cấp · ${soLevelCost(p.lvl)} 🐚</button>
      <button class="btn" id="pFeedFd">Nạp +1 cấp · ${FD_LEVEL_COST} Phúc Duyên</button></div>
    <p class="dim small">${esc(evoTxt)}</p>
    <h3>Kỹ năng theo loài <small>${petRoleTags(p.tid)}</small></h3>
    <div class="petskills">${petSkillRows(p.tid, p.lvl)}</div>
    <p class="dim small">${esc(petRole(p.tid).fit)} Chiêu thứ hai mở ở cấp 30. Pet không thuộc loài trên dùng chiêu AoE hệ.</p>
    <h3>Đội hình <small>${chain ? '<b style="color:#ffb52e">Tam Tương Sinh: +5% sát thương</b>' : same ? '<b style="color:#ffb52e">Tam Đồng Khí: pet +15% sát thương</b>' : 'ra trận + 2 hộ mệnh'}</small></h3>
    <div class="card">${teamRow(0, 'Ra trận')}${teamRow(1, 'Hộ mệnh 1')}${teamRow(2, 'Hộ mệnh 2')}
      <p class="dim small">Hộ mệnh không đánh nhưng trang bị của chúng cộng ${Math.round(PET_BENCH_BUFF * 100)}% thuộc tính vào nhân vật. 3 con tương sinh (Kim→Thủy→Mộc→Hỏa→Thổ) hoặc đồng hệ tạo trận pháp.</p></div>
    <h3>Trang bị cho Đồng hành <small>cộng ${Math.round(PET_EQ_BUFF * 100)}% thuộc tính vào nhân vật</small></h3>
    <div class="eqgrid">${slots}</div>
    <p class="dim small">Chạm ô trống để gắn món trong hành trang; chạm món đang gắn để xem/tháo. Đồng hành tương khắc hệ quái: +25% sát thương (⚡). Ra trận, Đồng hành tự đi nhặt đồ auto theo bộ lọc ở thẻ Hành trang thay nhân vật.</p>
    <div class="card lootf">
      <label><input type="checkbox" id="cAutoPet" ${S.autoPet === false ? '' : 'checked'}> Tự gắn đồ tốt hơn cho Đồng hành (mỗi 30 giây)</label>
      <label><input type="checkbox" id="cPetKeep" ${r.petF.keep === 0 ? '' : 'checked'}> Giữ trong túi món tốt hơn đồ Đồng hành đang gắn (tắt = tự bán như thường)</label>
      <label><input type="checkbox" id="cPetElem" ${r.petF.elemOnly ? 'checked' : ''}> Chỉ giữ đồ cùng hệ <b style="color:${SERIES_COL[st.elem]}">${SERIES[st.elem]}</b> cho Đồng hành (bỏ chọn = giữ mọi hệ)</label></div>
    <h3>Ngũ Hành Bí Cảnh <small>hạ ${REALM_KILLS} quái đúng hệ → Huyền Tinh + lượng + Vỏ Sò</small></h3>
    <div class="btnrow">${realmBtns}</div>
    <p class="dim small">Trong bí cảnh mọi quái đều thuộc hệ đã chọn (dễ khai thác tương khắc), mỗi quái 25% rớt Huyền Tinh. Xong một cửa nghỉ ${Math.round(REALM_CD / 60)} phút.</p>
    <div class="btnrow"><button class="btn" id="pForge">Đúc Thú Bội · 30 Huyền Tinh ${petForgeCost().tier} + ${fmt(petForgeCost().gold)} lượng</button>
      <button class="btn" id="pCodex">Bách khoa Đồng hành</button></div>
    <p class="dim small">Thú Bội: món 4 dòng hệ Đồng hành, chỉ nó mặc được (nhân vật không mặc được).</p>`
    : '<p class="desc">Chưa chọn loài Đồng hành — chọn một loài bên dưới (mỗi loài là một con riêng, lên cấp riêng).</p>';
  el.innerHTML = `<h3>Đồng hành <small>${Object.keys(r.pets).length} loài sở hữu</small></h3>${body}<h3>Chọn loài <small>theo hệ ngũ hành — mỗi loài một con riêng</small></h3>${groups}`;
  el.querySelectorAll('[data-pslot]').forEach(b => b.onclick = () => {
    const k = b.dataset.pslot, it = p && p.eq && p.eq[k];
    if (it) petItemModal(it, k); else petPickModal(k);
  });
  el.querySelectorAll('#t-pet .petpick [data-p]').forEach(x => x.onclick = () => petAdopt(+x.dataset.p));
  el.querySelectorAll('[data-team]').forEach(s => s.onchange = () => teamSet(+s.dataset.team, s.value || null));
  const q = id => el.querySelector(id);
  if (q('#pEvo')) q('#pEvo').onclick = () => petEvolve();
  if (q('#pFeedSo')) q('#pFeedSo').onclick = () => petFeed('so');
  if (q('#pFeedFd')) q('#pFeedFd').onclick = () => petFeed('fd');
  if (q('#pForge')) q('#pForge').onclick = () => { const it = petForgeItem(); if (it) refresh(); };
  if (q('#pCodex')) q('#pCodex').onclick = () => codexModal('pet');
  if (q('#cAutoPet')) q('#cAutoPet').onchange = e => { S.autoPet = e.target.checked; if (S.autoPet) petAutoEquip(); save(); renderPet(); };
  if (q('#cPetKeep')) q('#cPetKeep').onchange = e => { r.petF.keep = e.target.checked ? 1 : 0; setInvDirty(true); save(); renderPet(); };
  if (q('#cPetElem')) q('#cPetElem').onchange = e => { r.petF.elemOnly = e.target.checked ? 1 : 0; setInvDirty(true); save(); renderPet(); };
  el.querySelectorAll('[data-realm]').forEach(b => b.onclick = () => petRealmEnter(+b.dataset.realm));
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
  petRealmOnKill(e);
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
export function giftText(g) {
  const p = [];
  if (g.gold) p.push(`${fmt(g.gold * (1 + S.lvl / 10))} lượng`); if (g.pot) p.push(`${g.pot.n} bình thuốc`); if (g.fd) p.push(`${g.fd} Phúc Duyên`);
  if (g.item) p.push(`đồ ${g.item} dòng`); if (g.set) p.push('đồ Hoàng Kim'); if (g.pts) p.push(`${g.pts} tiềm năng`);
  return p.join(', ');
}
/* ---------- TAI XIU (cuoc xu xac 3 mặt, thiet ke tu ban vinarpg) ---------- */
const TX_LUOT = 10, TX_BO_BA = 30, BLESS_LUCKY = 10;
/* Lời chúc (quà hiếm của Tài Xỉu): +10 may mắn trong 1 giờ. Nhiều lời chúc không cộng dồn. */
export function blessLucky() {
  const b = S.rw && S.rw.bless; if (!b || !b.length) return 0;
  const now = Date.now(); return b.some(x => x.until > now) ? BLESS_LUCKY : 0;
}
/* Hết hạn lời chúc: bỏ khỏi file lưu và tính lại chỉ số (gọi định kỳ từ vòng lặp) */
export function blessSweep() {
  const b = S.rw && S.rw.bless; if (!b || !b.length) return;
  const now = Date.now(), keep = b.filter(x => x.until > now);
  if (keep.length !== b.length) { S.rw.bless = keep; R.dirty = true; }
}
const txNgay = () => localISODay();                    // gio may, cung moc voi diem danh / thap
function txState() {
  const r = RW();
  if (!r.tx || r.tx.ngay !== txNgay()) r.tx = { ngay: txNgay(), luot: 0 };
  return r.tx;
}
const txLuotMax = () => TX_LUOT + (txState().bonus || 0);
export const txLuotCon = () => Math.max(0, txLuotMax() - txState().luot);
const txCuocMax = () => 20000 + S.lvl * 4000;
const txCuocMin = () => Math.round(txCuocMax() / 10);   // = mức cược thấp nhất trên giao diện
function txQua(bac) {                       // bac 1 = van thuong, 2 = bo ba
  const roll = irnd(1, 100);
  if (roll <= 30) { const n = irnd(1, 2) * bac; matAdd('misc', 'thbt', n); return n + ' Tinh Hồng Bảo Thạch'; }
  if (roll <= 55) { const n = irnd(1, 3) * bac; matAdd('misc', 'wc', n); return n + ' Thủy Tinh Trắng'; }
  if (roll <= 75) { const n = irnd(1, 2) * bac; matAdd('misc', 'mys', n); return n + ' Thần Bí Khoáng Thạch'; }
  if (roll <= 88) { const lvl = clamp(irnd(1, 4) * bac, 1, HT_MAX); matAdd('ht', lvl, 1); return 'Huyền Tinh cấp ' + lvl; }
  if (roll <= 93) { const n = 3 * bac; S.attrPts += n; return n + ' điểm tiềm năng'; }
  if (roll <= 97) { const n = 2 * bac; S.skPts += n; return n + ' điểm võ công'; }
  if (roll <= 99) { const xp = Math.round(expFor(S.lvl) * 0.25 * bac); S.xp += xp; return 'Kinh nghiệm +' + fmt(xp); }
  const r = RW(); (r.bless = r.bless || []).push({ until: Date.now() + 3600000, ten: 'Lời chúc: may mắn +10 trong 1 giờ' });
  return 'MỘT LỜI CHÚC: may mắn +10 trong 1 giờ';
}
export function taiXiu(cua, cuoc) {
  cuoc = Math.floor(cuoc);
  const t = txState();
  if (txLuotCon() <= 0) return { ok: false, msg: 'Hết lượt hôm nay (' + txLuotMax() + ' lượt) — mai quay lại' };
  if (!['tai', 'xiu', 'boba'].includes(cua)) return { ok: false, msg: 'Cửa không hợp lệ' };
  if (!(cuoc > 0)) return { ok: false, msg: 'Mức cược không hợp lệ' };
  if (cuoc < txCuocMin()) return { ok: false, msg: 'Cược tối thiểu ' + fmt(txCuocMin()) + ' lượng (quà thắng không phụ thuộc mức cược)' };
  if (cuoc > txCuocMax()) return { ok: false, msg: 'Trần cược ' + fmt(txCuocMax()) + ' lượng' };
  if (S.gold < cuoc) return { ok: false, msg: 'Không đủ ngân lượng' };
  t.luot++;
  S.gold -= cuoc;
  const x = [irnd(1, 6), irnd(1, 6), irnd(1, 6)], tong = x[0] + x[1] + x[2];
  const boBa = x[0] === x[1] && x[1] === x[2];
  const thang = cua === 'boba' ? boBa : (!boBa && (cua === 'tai' ? tong >= 11 : tong <= 10));
  const dau = 'Xúc xắc ' + x.join('-') + ' = ' + tong;
  if (!thang) return { ok: true, thang: false, xucXac: x, tong, msg: dau + ' — thua ' + fmt(cuoc) + ' lượng' };
  const heSo = cua === 'boba' ? TX_BO_BA : 2, tienThang = cuoc * heSo;
  S.gold += tienThang;
  const qua = txQua(cua === 'boba' ? 2 : 1);
  R.dirty = true;
  return { ok: true, thang: true, xucXac: x, tong, tienThang, qua, msg: dau + ' — THẮNG ' + fmt(tienThang) + ' lượng · nhận: ' + qua };
}
function txBody(r) {
  const con = txLuotCon(), maxc = txCuocMax(), muc = [Math.round(maxc / 10), Math.round(maxc / 4), maxc];
  const ok = c => con > 0 && S.gold >= c;
  return `<p class="desc">Tài Xỉu 3 xúc xắc · cược ngân lượng · còn <b>${con}/${txLuotMax()}</b> lượt hôm nay · trần cược ${fmt(maxc)} lượng.</p>
    <div class="card"><b>Luật</b> <small class="dim">Xỉu 4–10 (×2) · Tài 11–17 (×2) · Bộ ba (3 mặt giống nhau) ×${TX_BO_BA}. Bộ ba KHÔNG tính cho Tài/Xỉu.</small></div>
    <div class="card"><b>Đặt cược</b> <small class="dim">thắng còn nhận quà hỗ trợ ngẫu nhiên: Huyền Tinh, Thủy Tinh Trắng, Thần Bí Khoáng Thạch, Tinh Hồng Bảo Thạch, điểm tiềm năng, điểm võ công, kinh nghiệm — hoặc MỘT LỜI CHÚC</small>
      ${muc.map(c => `<div class="btnrow"><small>${fmt(c)} lượng</small><button class="btn" data-tx="xiu:${c}" ${ok(c) ? '' : 'disabled'}>Xỉu</button><button class="btn" data-tx="tai:${c}" ${ok(c) ? '' : 'disabled'}>Tài</button><button class="btn red" data-tx="boba:${c}" ${ok(c) ? '' : 'disabled'}>Bộ ba</button></div>`).join('')}
    </div>
    ${r.txLog && r.txLog.length ? `<div class="card"><b>Ván gần đây</b>${r.txLog.slice(0, 6).map(s => `<div class="row"><small>${esc(s)}</small></div>`).join('')}</div>` : ''}`;
}
function giftBody(r) {
  if (giftTab === 'tm') return thanMaBody();
  if (giftTab === 'tx') return txBody(r);
  const act = actBody(giftTab); if (act) return act;
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
      <div class="btnrow">${R.tower ? '<button class="btn red" id="gTowerOut">Rời tháp</button>' : !unlocked(TOWER_LV) ? `<button class="btn" disabled>Cần cấp ${TOWER_LV}</button>` : `<button class="btn" id="gTower">Vào tháp (từ tầng ${Math.max(1, r.stat.towerBest - 4)})</button>`}</div>
      <h3>Tháp II <small>siêu khó · 2.000 tầng</small></h3>
      <p class="desc">Mở ở chuyển sinh 5. Quái mạnh gấp nhiều lần theo tầng, gục lùi 10 tầng; mỗi 10 tầng lần đầu nhận 1 món bộ <b>Thiên Cực</b>. Điểm chuyển sinh TS6–TS10 chỉ tác dụng ở đây.</p>
      <p>Kỷ lục: <b>tầng ${r.stat.tower2Best || 0}</b>${R.tower && R.tower.id === 2 ? ` · đang ở tầng ${R.tower.floor}` : ''}</p>
      <div class="btnrow">${R.tower && R.tower.id === 2 ? '<button class="btn red" id="gTowerOut">Rời tháp</button>' : !tower2Unlocked() ? `<button class="btn" disabled>Cần chuyển sinh ${TOWER2.reborn}</button>` : `<button class="btn" id="gTower2">Vào Tháp II (tầng ${tower2Floor(r.tower2Floor == null ? (r.stat.tower2Best || 0) + 1 : r.tower2Floor)})</button>`}</div>`;
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
/* Mo hop qua tang dung the chi dinh (hang nut nhanh the Giang ho) */
export function openGiftTab(tab) { giftTab = tab; giftModal(); }

/* Danh hieu tren the Nhan vat: tien do + bang chon danh hieu (cach rieng so voi tab Thanh tuu) */
export function titleProgress() {
  const r = RW(), withTitle = ACH.filter(a => a[4]);
  return { owned: withTitle.filter(([id]) => r.ach[id]).length, total: withTitle.length };
}
export function titleWorn() {
  const r = RW(), t = r.title && ACH.find(a => a[0] === r.title && a[4]);
  return t ? { id: t[0], n: t[1], attr: t[4] } : null;
}
export function titleModal() {
  const r = RW();
  const rows = ACH.filter(a => a[4]).map(([id, n, , , t]) => {
    const got = !!r.ach[id], worn = r.title === id;
    return `<div class="qrow${got ? '' : ' lock'}"><span><b>${n}</b><small>danh hiệu: ${escRich(attrText(t[0], [t[1], 0, 0]))}</small></span><small></small><button class="btn sm" data-tt="${id}" ${got ? '' : 'disabled'}>${worn ? 'Tháo' : 'Đeo'}</button></div>`;
  }).join('');
  const pr = titleProgress();
  modal(`<h3>Danh hiệu <small>${pr.owned}/${pr.total}</small></h3><p class="desc">Đeo một danh hiệu để cộng chỉ số. Danh hiệu nhận từ thành tựu và thử thách nhân vật.</p>${rows || '<small class="dim">Chưa có danh hiệu nào</small>'}<div class="btnrow"><button class="btn" id="ttClose">Đóng</button></div>`, () => {
    document.querySelectorAll('#mBody [data-tt]').forEach(x => x.onclick = () => { r.title = r.title === x.dataset.tt ? '' : x.dataset.tt; R.dirty = true; save(); refresh(); titleModal(); });
    $('#ttClose').onclick = () => closeModal(true);
  });
}
export function giftModal() {
  if (!S.fac) return;
  const r = RW(), tabs = [['newbie', 'Tân thủ'], ['code', 'Mã quà'], ['login', 'Điểm danh'], ['lvms', 'Mốc cấp'], ['quest', 'Nhiệm vụ'], ['ach', 'Thành tựu'], ['chest', 'Phúc Duyên'], ['so', 'Quay Sò'], ['event', 'Sự kiện'], ['tower', 'Tháp'], ['tx', 'Tài Xỉu'], ['pet', 'Đồng hành'], ['tm', 'Thần Mã'], ['yt', 'Dã Tẩu'], ['guild', 'Bang hội'], ['tk', 'Tống Kim'], ['reborn', 'Chuyển sinh']];
  modal(`<h3>Phần thưởng <small>Phúc Duyên ${r.fd}</small></h3><div class="dtabs" id="giftTabs">${tabs.map(([k, n]) => `<button data-g="${k}" class="${k === giftTab ? 'on' : ''}">${n}</button>`).join('')}</div>${giftBody(r)}`, () => {
    document.querySelectorAll('#mBody #giftTabs button').forEach(x => x.onclick = () => { giftTab = x.dataset.g; giftModal(); });
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    on('#gLogin', () => { claimLogin(); refreshGift(); }); on('#gChest', openChest); on('#gTower', towerStart);
    on('#gSo1', () => spinSo(1)); on('#gSo10', () => spinSo(10));
    on('#gWelcome', claimWelcome);
    on('#gCode', () => claimCode($('#codeInp') ? $('#codeInp').value : ''));
    { const ci = $('#codeInp'); if (ci) ci.onkeydown = e => { if (e.key === 'Enter') claimCode(ci.value); }; }
    on('#gTowerOut', () => { towerExit(false); refreshGift(); }); on('#gTower2', () => { tower2Start(); refreshGift(); }); on('#gReborn', doReborn);
    document.querySelectorAll('#mBody [data-lv]').forEach(x => x.onclick = () => claimLvMs(+x.dataset.lv));
    document.querySelectorAll('#mBody [data-q]').forEach(x => x.onclick = () => { claimQuest(+x.dataset.q); refreshGift(); });
    document.querySelectorAll('#mBody [data-w]').forEach(x => x.onclick = () => { claimWeekQuest(+x.dataset.w); refreshGift(); });
    document.querySelectorAll('#mBody [data-t]').forEach(x => x.onclick = () => { r.title = r.title === x.dataset.t ? '' : x.dataset.t; R.dirty = true; save(); refreshGift(); });
    document.querySelectorAll('#mBody [data-e]').forEach(x => x.onclick = () => eventBuy(+x.dataset.e));
    document.querySelectorAll('#mBody [data-tx]').forEach(x => x.onclick = () => {
      const [cua, c] = x.dataset.tx.split(':');
      const res = taiXiu(cua, +c);
      if (res.xucXac) { const rr = RW(); rr.txLog = [res.msg, ...(rr.txLog || [])].slice(0, 20); }
      toast(res.msg); save(); refreshGift();
    });
    document.querySelectorAll('#mBody .petpick [data-p]').forEach(x => x.onclick = () => petAdopt(+x.dataset.p));
    /* cac tab phu gan CUOI + boc loi: mot module loi khong duoc lam chet bind loi cua cac tab chinh */
    try { thanMaBind(refreshGift); } catch (e) { console.error('thanMaBind', e); }
    try { actBind(refreshGift); } catch (e) { console.error('actBind', e); }
  });
}

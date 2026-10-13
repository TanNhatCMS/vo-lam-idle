// @ts-nocheck — HOẠT ĐỘNG GIANG HỒ — port cơ chế nguồn v107 (gộp 1 máy trạng thái j.dg
// với 3 kind: 'dg' phó bản, 'boat' đi thuyền, 'wb' Boss tuần — như bản gốc).
// Số liệu gốc: XC=2 lượt phó bản/ngày, Vw=3 chuyến thuyền/ngày, Hw=4 đoạn, Uw=240s,
// ZC=3 lượt Boss tuần/tuần, QC=75s, boss tuần hp×60; hạng theo thời gian (S≤50%,
// A≤75%) và theo % máu boss (S 100/A 50/B 20/C 5); thưởng theo bảng rw+iw của nguồn.
'use strict';
import { H, R, makeEnemy, stageLevel } from './combat';
import { obsLoad } from './mapobs';
import { FAC, J, MAX_LEVEL, MON, W, WORLD, ZONES, clamp, esc, fmt, irnd, pick, rnd } from './core';
import { S, save } from './save';
import { RW, grant } from './rewards';
import { closeModal, log, modal, toast } from './ui';
import { img, snapCamera, addText } from './render';
import { playMusic, uiSfx } from './audio';
import { dropToGround, makeItem } from './loot';
import { makeSetItem } from './sets';
import { knbGain } from './ktc';
import { uiBump } from './store';

/* ---------- hằng số gốc ---------- */
export const DG_TRIES = 2;          // XC — lượt mỗi phó bản mỗi ngày
export const BOAT_TRIES = 3;        // Vw — chuyến đò mỗi ngày
export const BOAT_ROOMS = 4;        // Hw — đoạn sông
export const BOAT_LIMIT = 240;      // Uw — giây mỗi chuyến
export const BOAT_LV = 30;          // Ww — cấp mở đi thuyền
export const BOAT_DROP_X = 5;       // Gw — Huyền Tinh/đá rơi ×5 trên thuyền
export const WB_TRIES = 3;          // ZC — lượt Boss tuần mỗi tuần
export const WB_LIMIT = 75;         // QC — giây mỗi lượt
export const WB_HP_X = 60;          // $C — máu Boss tuần ×60
export const WB_MIN_LV = 20;
const ROOM_LV_SPAN = 10;            // dw — quái mạnh dần qua phòng (+10 cấp)
const ELITE_HP = 0.6, ELITE_DMG = 0.55;              // JC / qC
const ARENA_MAP = 224;              // không có map riêng cho phó bản trong media -> dùng bí cảnh sa mạc (như Boss Thế Giới)

/* ---------- 7 phó bản (bảng KC của nguồn) ---------- */
export const DUNGEONS = [
  { id: 'dvc', map: 140, n: 'Dược Vương Cốc', lv: 20, rooms: 5, limit: 120, bossMul: 5, set: 0.2, horse: 0.08, fd: 8, item: 5, gold: 2500, knb: 2, pot: 5, d: 'Hang dược thảo bị độc nhân chiếm giữ. 4 phòng tinh anh, phòng 5 là trùm.' },
  { id: 'tbk', map: 50, n: 'Thiên Bảo Khố', lv: 50, rooms: 6, limit: 150, bossMul: 6, set: 0.35, horse: 0.12, fd: 12, item: 6, gold: 6e3, knb: 3, pot: 8, d: 'Kho báu triều đình, lính canh tinh nhuệ. 5 phòng tinh anh, phòng 6 là trùm.' },
  { id: 'lal', map: 8, n: 'Lâm An Hoàng Lăng', lv: 80, rooms: 7, limit: 210, bossMul: 7, set: 0.5, horse: 0.18, fd: 18, item: 6, gold: 12e3, knb: 4, pot: 10, d: 'Lăng mộ hoàng tộc, cơ quan trùng trùng. 6 phòng tinh anh, phòng 7 là trùm.' },
  { id: 'pdq', map: 206, n: 'Phong Đô Quỷ Thành', lv: 110, rooms: 7, limit: 240, bossMul: 7, set: 0.55, horse: 0.2, fd: 22, item: 6, gold: 2e4, knb: 5, pot: 12, d: 'Thành ma nơi âm khí ngút trời. 6 phòng tinh anh, phòng 7 là trùm.' },
  { id: 'kct', map: 4, n: 'Kiếm Các Thục Đạo', lv: 140, rooms: 8, limit: 270, bossMul: 8, set: 0.6, horse: 0.22, fd: 26, item: 6, gold: 3e4, knb: 6, pot: 14, d: 'Đường Thục hiểm trở, sơn tặc trấn ải. 7 phòng tinh anh, phòng 8 là trùm.' },
  { id: 'mcb', map: 225, n: 'Mạc Cao Bí Cảnh', lv: 170, rooms: 8, limit: 300, bossMul: 7, set: 0.65, horse: 0.25, fd: 30, item: 6, gold: 45e3, knb: 7, pot: 16, d: 'Hang động cổ giữa sa mạc, cao thủ ẩn tu. 7 phòng tinh anh, phòng 8 là trùm.' },
  { id: 'hsl', map: 212, n: 'Hoa Sơn Luận Kiếm', lv: 190, rooms: 9, limit: 330, bossMul: 7, set: 0.7, horse: 0.28, fd: 35, item: 6, gold: 6e4, knb: 8, pot: 20, d: 'Đỉnh Hoa Sơn, quần hùng tranh phong. 8 phòng tinh anh, phòng 9 là trùm.' },
];
/* thưởng rương theo hạng (bảng rw của nguồn) + hệ số thưởng cơ bản (iw) */
const RANK_CHEST = { S: { gold: 1e4, fd: 50, set: 1, knb: 15, pts: 3 }, A: { gold: 6e3, fd: 30, set: 1, knb: 10 }, B: { gold: 3e3, fd: 20, item: 6, knb: 6 }, C: { gold: 1500, fd: 10, item: 5, knb: 3 } };
const RANK_MUL = { S: 1.5, A: 1.2, B: 1 };
const WB_RANKS = [['S', 1], ['A', 0.5], ['B', 0.2], ['C', 0.05]];

/* ---------- khoá ngày / tuần ---------- */
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export function isoWeekKey(d = new Date()) {                // tuần bắt đầu thứ Hai
  const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - (t.getDay() + 6) % 7);
  return `${t.getFullYear()}-W${String(Math.ceil(((t - new Date(t.getFullYear(), 0, 1)) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}
export function dgSaveState() {                              // ow() của nguồn
  const r = RW(), s = r.dgSave = r.dgSave || {};
  if (s.day !== dayKey()) { s.day = dayKey(); s.runs = {}; s.boat = 0; }
  if (s.week !== isoWeekKey()) { s.week = isoWeekKey(); s.wbTries = 0; s.wbBest = 0; s.wbHp = 0; s.wbRank = ''; s.wbClaimed = false; }
  s.runs = s.runs || {};
  return s;
}
function dgRec() {                                           // sổ kỷ lục (rec.dgClear/dgBest/dgRank)
  const r = RW(), c = r.dgRec = r.dgRec || {};
  for (const k of ['dgClear', 'dgBest', 'dgRank']) c[k] = c[k] || {};
  return c;
}
const runsLeft = d => Math.max(0, DG_TRIES - (dgSaveState().runs[d.id] || 0));
export const dungeonReady = () => !!S.fac;
export const boatReady = () => !!S.fac;
export const weekBossReady = () => !!S.fac;

/* ---------- bí cảnh (khuôn goBossArena của worldboss) ---------- */
function busy() { return !!(R.dg || R.tower || R.tk || R.tyvo || R.wbArena || R.deadT > 0); }
function dgZoneOf(map) { return W.zones.find(z => z.id === map) || W.zones.find(z => z.id === ARENA_MAP) || W.zones[0]; }
function dgEnter(mapId) {
  R.town = false; R.dgArena = true; R.enemies = []; R.corpses = []; R.pickTarget = null; R.moveTo = null;
  obsLoad(dgZoneOf(mapId).id);
  H.x = WORLD.w / 2; H.y = WORLD.h / 2; snapCamera();
  R.bgImg = img(dgZoneOf(mapId).bg); playMusic(dgZoneOf(mapId).id);
}
function dgExitArena() {
  if (!R.dgArena) return;
  R.dgArena = false; R.dg = null; R.enemies = []; R.corpses = []; R.spawnT = 0.5;
  const z = W.zones.find(z2 => z2.id === zoneIdOfStage()) || W.zones[0];
  obsLoad(z.id); H.x = WORLD.w / 2; H.y = WORLD.h / 2; snapCamera();
  R.bgImg = z.bg ? img(z.bg) : null; playMusic(z.id);
  R.banner = { t: 1.6, text: 'Trở lại ải', sub: z.n };
  uiBump();
}
function zoneIdOfStage() { const st = Math.min(S.stage, S.maxStage || S.stage); const z = ZONES.find(z2 => st >= z2.lo && st <= z2.hi) || ZONES[ZONES.length - 1]; return z ? z.id : ARENA_MAP; }
const zoneForLv = t => ZONES.find(z => t >= z.lo && t <= z.hi) || ZONES.find(z => t <= z.hi) || ZONES[ZONES.length - 1];
const mobForLv = t => { const z = zoneForLv(t); const m = (z.m || []).filter(id => MON[id]); return m.length ? m : [MON[0] ? 0 : (z.m || [])[0] || 0]; };
function spot(minR, maxR) {                                  // bw() của nguồn: điểm trống quanh nhân vật
  for (let i = 0; i < 20; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(minR, maxR);
    const x = clamp(H.x + Math.cos(a) * r, 40, WORLD.w - 40), y = clamp(H.y + Math.sin(a) * r, 60, WORLD.h - 40);
    return [x, y];
  }
  return [H.x + 24, H.y + 24];
}
const roomLv = run => clamp(Math.round(run.lv + ROOM_LV_SPAN * (run.room - 1) / Math.max(1, run.rooms - 1)), 1, 200);

/* ---------- sinh quái theo phòng (xw của nguồn) ---------- */
function spawnRoom() {
  const run = R.dg; if (!run) return;
  R.enemies = [];
  if (run.kind === 'boat') {
    const bossSeg = run.room >= BOAT_ROOMS;
    const tid = MON[674] ? 674 : pick(mobForLv(run.L));
    if (bossSeg) {
      const [bx, by] = spot(200, 250);
      const b = makeEnemy(tid, run.L + 2, 'boss', bx, by);
      b.hp = b.max = b.max * 3; b.dmg *= 1.2; b.n = 'Thủy Tặc Đầu Lĩnh';
      R.enemies.push(b);
    }
    const n = bossSeg ? 3 : 5 + run.room;
    for (let i = 0; i < n; i++) {
      const [x, y] = spot(120, 280);
      const e = makeEnemy(tid, run.L, bossSeg || i < run.room ? 'elite' : 'normal', x, y);
      e.n = 'Thủy Tặc'; R.enemies.push(e);
    }
    return;
  }
  if (run.kind === 'wb') {
    const [bx, by] = spot(200, 240);
    const b = makeEnemy(run.tid, run.L, 'boss', bx, by);
    b.hp = b.max = b.max * WB_HP_X; b.dmg *= 1.1; b.wbBoss = true; b.n = 'Boss tuần · ' + b.n;
    run.boss = b; R.enemies.push(b);
    return;
  }
  const lv = roomLv(run);
  if (run.room >= run.rooms) {
    const [bx, by] = spot(220, 260);
    const b = makeEnemy(pick(mobForLv(lv).filter(id => MON[id])), lv, 'boss', bx, by);
    b.hp = b.max = b.max * (run.d.bossMul / 2); b.dmg *= 1.25; b.n = 'Trấn thủ · ' + b.n;
    R.enemies.push(b);
  }
  const n = run.room >= run.rooms ? 2 : 3 + Math.floor(run.room / 3);
  for (let i = 0; i < n; i++) {
    const [x, y] = spot(100, 240);
    const e = makeEnemy(pick(mobForLv(lv)), lv, 'elite', x, y);
    e.dmg *= ELITE_DMG; e.hp = e.max = e.max * ELITE_HP;
    R.enemies.push(e);
  }
}

/* ---------- vào / ra ---------- */
function guardBusy() { if (busy()) { toast('Hãy kết thúc hoạt động hiện tại và hồi phục trước'); return true; } return false; }
export function dungeonStart(id) {
  const d = DUNGEONS.find(x => x.id === id);
  if (!d || !S.fac) return false;
  if (guardBusy()) return false;
  if (S.lvl < d.lv && RW().stat.reborn <= 0) { toast(`Cần cấp ${d.lv}`); return false; }
  if (runsLeft(d) <= 0) { toast('Hết lượt phó bản hôm nay'); return false; }
  dgSaveState().runs[d.id] = (dgSaveState().runs[d.id] || 0) + 1; save();
  dgEnter(d.map);
  R.dg = { kind: 'dg', d, rooms: d.rooms, room: 1, t: 0, limit: d.limit, lv: Math.min(200, d.lv + ROOM_LV_SPAN) };
  R.banner = { t: 2.4, text: d.n, sub: `${d.rooms} phòng · ${d.limit} giây · quái cấp ${d.lv}–${d.lv + ROOM_LV_SPAN}` };
  log(`🏯 Dịch chuyển vào phó bản <b>${esc(d.n)}</b>.`);
  uiSfx('levelup'); spawnRoom();
  return true;
}
export function boatStart() {
  if (!S.fac) return false;
  if (guardBusy()) return false;
  const s = dgSaveState();
  if (S.lvl < BOAT_LV && RW().stat.reborn <= 0) { toast(`Cần cấp ${BOAT_LV}`); return false; }
  if (s.boat >= BOAT_TRIES) { toast('Hết chuyến đò hôm nay'); return false; }
  s.boat++; save();
  dgEnter(337);
  R.dg = { kind: 'boat', rooms: BOAT_ROOMS, room: 1, t: 0, limit: BOAT_LIMIT, lv: clamp(Math.max(S.lvl, stageLevel(Math.max(1, S.maxStage - 10))) + 1, 1, MAX_LEVEL) };
  R.banner = { t: 2.6, text: 'Phong Lăng Độ', sub: `${BOAT_ROOMS} đoạn sông · Thủy Tặc chặn đường` };
  log(`⛵ Lên thuyền: Huyền Tinh và đá thuộc tính rơi ×${BOAT_DROP_X}.`);
  uiSfx('levelup'); spawnRoom();
  return true;
}
export function weekBossStart() {
  if (!S.fac) return false;
  if (guardBusy()) return false;
  const s = dgSaveState();
  if (S.lvl < WB_MIN_LV && RW().stat.reborn <= 0) { toast(`Cần cấp ${WB_MIN_LV}`); return false; }
  if (s.wbTries >= WB_TRIES) { toast('Hết lượt Boss tuần'); return false; }
  s.wbTries++; save();
  const tid = weekBossTid();
  dgEnter(224);
  R.dg = { kind: 'wb', rooms: 1, room: 1, t: 0, limit: WB_LIMIT, lv: clamp(Math.max(S.lvl, stageLevel(Math.max(1, S.maxStage - 10))) + 3, 1, MAX_LEVEL), tid, dmg: 0, week: isoWeekKey() };
  R.banner = { t: 2.4, text: 'Boss tuần · ' + (MON[tid] ? MON[tid].n : 'Trùm'), sub: `${WB_LIMIT} giây · gây sát thương để xếp hạng` };
  log(`⚔ Khiêu chiến <b style="color:#ff8a5a">${esc(MON[tid] ? MON[tid].n : 'Boss tuần')}</b> — sát thương cộng dồn qua các lượt trong tuần.`);
  uiSfx('levelup'); spawnRoom();
  return true;
}
export function weekBossTid() {                              // mw() của nguồn: xoay trùm vùng theo tuần
  const bosses = [...new Set(ZONES.map(z => z.boss).filter(id => MON[id]))];
  if (!bosses.length) return ZONES[0] && ZONES[0].boss;
  const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const wk = Math.floor(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) / 6048e5);
  return bosses[(wk % bosses.length + bosses.length) % bosses.length];
}
/* Hạ trùm trong phó bản/thuyền: đất rơi thưởng — gọi từ waveCleared */
export function dgVictory() {
  const run = R.dg; if (!run) return;
  if (run.kind === 'wb') { wbEnd(true); return; }
  const d = new Date(), secs = Math.round(run.t);
  const rank = run.t <= run.limit * 0.5 ? 'S' : run.t <= run.limit * 0.75 ? 'A' : 'B';
  const mul = RANK_MUL[rank] || 1;
  const rec = dgRec();
  rec.dgClear[run.d.id] = (rec.dgClear[run.d.id] || 0) + 1;
  if (rec.dgBest[run.d.id] == null || secs < rec.dgBest[run.d.id]) rec.dgBest[run.d.id] = secs;
  if (!rec.dgRank[run.d.id] || 'SAB'.indexOf(rank) < 'SAB'.indexOf(rec.dgRank[run.d.id])) rec.dgRank[run.d.id] = rank;
  const gold = Math.round(run.d.gold * mul);
  S.gold += gold;
  knbGain(Math.round(run.d.knb * mul) + (RANK_CHEST[rank].knb || 0));
  grant({ fd: Math.round(run.d.fd * mul) + (RANK_CHEST[rank].fd || 0) }, `Phó bản ${run.d.n} · hạng ${rank}`);
  if (RANK_CHEST[rank].pts) S.attrPts += RANK_CHEST[rank].pts;
  for (let i = 0; i < run.d.item; i++) { const it = makeItem(irnd(0, 9), 0, clamp(Math.round(S.lvl / 12) + 1, 1, 10), irnd(2, 5)); dropToGround(it, H); }
  if (RANK_CHEST[rank].set && Math.random() < run.d.set) dgSetDrop(run);
  log(`🏆 Qua <b>${esc(run.d.n)}</b> · hạng <b style="color:#ffd24a">${rank}</b> (${secs}s) · +${fmt(gold)} lượng, +${Math.round(run.d.knb * mul)} KNB`);
  R.banner = { t: 3, text: `Qua ${run.d.n} · hạng ${rank}`, sub: `${secs} giây · còn ${runsLeft(run.d)} lượt hôm nay` };
  uiSfx('levelup');
  if (run.kind === 'boat') { const rec2 = RW().dgRec = RW().dgRec || {}; rec2.boatN = (rec2.boatN || 0) + 1; }
  dgExitArena(); save();
}
function dgSetDrop(run) {                                    // món bộ Hoàng Kim/Bạch Kim (khuôn wbSetDrop)
  const lvCap = Math.max(S.lvl, run.lv || run.L || S.lvl) + 10, fid = FAC[S.fac] ? FAC[S.fac].id : -1;
  const reqOf = (r, id) => (r.req.find(q => q[0] === id) || [0, -1])[1];
  const kind = Math.random() < 0.25 ? 'platina' : 'gold';
  let pool = (J.sets[kind] || []).filter(r => reqOf(r, 36) <= lvCap);
  if (!pool.length) return;
  const it = makeSetItem(kind, pick(pool), 8);
  if (it) { dropToGround(it, H); log(`<b style="color:${'#ffd24a'}">${esc(it.n)}</b> (bộ ${kind === 'gold' ? 'Hoàng Kim' : 'Bạch Kim'}) rơi ra!`); }
}
/* Boss tuần kết thúc: cộng dồn sát thương, xếp hạng theo % máu (Aw của nguồn) */
function wbEnd(killed) {
  const run = R.dg; if (!run || run.kind !== 'wb') return;
  const s = dgSaveState();
  const max = run.boss ? run.boss.max : 1;
  const dmg = Math.round(killed ? max : Math.max(run.dmg, run.boss ? run.boss.max - Math.max(0, run.boss.hp) : 0));
  const rank = WB_RANKS.find(([, f]) => dmg >= max * f - 0.5)?.[0] || '';
  if (run.week === s.week) {
    const ratio = s.wbHp > 0 ? s.wbBest / s.wbHp : 0;
    if (dmg / max > ratio) { s.wbBest = dmg; s.wbHp = max; }
    if (rank && (!s.wbRank || 'SABC'.indexOf(rank) < 'SABC'.indexOf(s.wbRank))) s.wbRank = rank;
  }
  log(`Boss tuần: ${fmt(dmg)} sát thương (${Math.round(dmg / max * 100)}%) · hạng ${rank || 'chưa đạt'}`);
  R.banner = { t: 3, text: killed ? 'Hạ Boss tuần!' : 'Kết thúc Boss tuần', sub: `${fmt(dmg)} sát thương · hạng ${rank || '—'}` };
  dgExitArena(); save();
}
/* Nhận rương tuần (jw của nguồn): 1 lần/tuần theo hạng tốt nhất */
export function weekBossClaim() {
  const s = dgSaveState();
  if (s.wbClaimed) { toast('Rương tuần này đã nhận'); return false; }
  if (!s.wbRank) { toast('Chưa có kết quả Boss tuần để nhận rương'); return false; }
  const c = RANK_CHEST[s.wbRank] || RANK_CHEST.C;
  s.wbClaimed = true;
  S.gold += c.gold || 0;
  knbGain(c.knb || 0);
  grant({ fd: c.fd || 0 }, `Rương Boss tuần · hạng ${s.wbRank}`);
  if (c.pts) S.attrPts += c.pts;
  log(`📬 Nhận rương Boss tuần (hạng ${s.wbRank}): +${fmt(c.gold)} lượng, +${c.knb} KNB, +${c.fd} Phúc Duyên`);
  toast('Đã nhận rương Boss tuần');
  save();
  return true;
}
export const weekBossChestReady = () => { const s = dgSaveState(); return !s.wbClaimed && !!s.wbRank; };
export function weekBossBadge() { return weekBossChestReady() ? '!' : (unlockedCheck(WB_MIN_LV) && dgSaveState().wbTries < WB_TRIES ? String(WB_TRIES - dgSaveState().wbTries) : ''); }
const unlockedCheck = lv => S.lvl >= lv || (RW().stat && RW().stat.reborn > 0);

/* ---------- tick (Cw của nguồn): đồng hồ + giám sát sát thương boss tuần ---------- */
export function dgTick(dt) {
  const run = R.dg; if (!run) return;
  run.t += dt;
  if (run.kind === 'wb' && run.boss) run.dmg = Math.max(run.dmg, run.boss.max - Math.max(0, run.boss.hp));
  if (run.kind === 'wb' && run.week !== isoWeekKey()) { wbEnd(false); return; }
  if (run.t >= run.limit) {
    if (run.kind === 'wb') wbEnd(false);
    else { toast('Hết thời gian'); R.banner = { t: 2, text: 'Hết thời gian', sub: 'Phó bản kết thúc' }; dgExitArena(); save(); }
  }
}
/* Hạ hết quái trong phòng (ww của nguồn) — gọi từ waveCleared */
export function dgRoomCleared() {
  const run = R.dg; if (!run) return;
  if (run.kind === 'wb') { wbEnd(true); return; }
  if (run.room >= run.rooms) { dgVictory(); return; }
  run.room++;
  R.life = Math.min(R.P.life, R.life + R.P.life * 0.25); R.mana = Math.min(R.P.mana, R.mana + R.P.mana * 0.3);
  R.spawnT = 1.5;
  const label = run.kind === 'boat' ? 'đoạn' : 'phòng';
  R.banner = { t: 1.4, text: `${label === 'đoạn' ? 'Đoạn' : 'Phòng'} ${run.room}/${run.rooms}`, sub: run.kind === 'boat' ? 'Thủy Tặc chặn đường' : `Quái cấp ${roomLv(run)} · còn ${Math.ceil(run.limit - run.t)} giây` };
  addText(H.x, H.y - 50, `${label === 'đoạn' ? 'Đoạn' : 'Phòng'} ${run.room}/${run.rooms}!`, '#ffd24a', 12);
  spawnRoom();
}
/* Gục ngã trong hoạt động (heroDeath): phó bản/thuyền thua, boss tuần giữ sát thương */
export function dgFail() {
  const run = R.dg; if (!run) return;
  if (run.kind === 'wb') { wbEnd(false); return; }
  toast('Thất bại — phó bản kết thúc');
  dgExitArena(); save();
}
/* Nhân rơi ×5 trên thuyền (Zw của nguồn) — gọi từ loot khi tính rơi nguyên liệu */
export const boatDropMul = () => (R.dg && R.dg.kind === 'boat' ? BOAT_DROP_X : 1);

/* ---------- body các tab (Bw/Lw/rT/Rw của nguồn) ---------- */
export function dungeonBody(r) {
  const s = dgSaveState(), rec = dgRec();
  const cards = DUNGEONS.map(d => {
    const left = runsLeft(d), open = S.lvl >= d.lv || r.stat.reborn > 0;
    const best = rec.dgBest[d.id], rk = rec.dgRank[d.id], cl = rec.dgClear[d.id] || 0;
    return `<div class="dg-card"><div class="dg-card-head"><b>${esc(d.n)}</b><small>Cần cấp ${d.lv} · ${d.rooms} phòng · ${d.limit}s</small></div>
      <p class="desc small">${esc(d.d)}</p>
      <div class="dg-rewards"><span>+${fmt(Math.round(d.gold * RANK_MUL.S))} lượng</span><span>+${d.knb}–${Math.round(d.knb * RANK_MUL.S)} KNB</span><span>+${d.fd} Phúc Duyên</span>${d.set ? `<span>${Math.round(d.set * 100)}% đồ bộ</span>` : ''}</div>
      ${cl ? `<small class="dim">Kỷ lục: hạng ${rk || '—'} · nhanh nhất ${best}s · vượt ${cl} lần</small>` : ''}
      <footer><span>${open ? `<b>${left}/${DG_TRIES}</b> lượt còn` : 'Chưa mở khóa'}</span>
      <button class="btn" data-dg="${d.id}" ${open && left && !busy() ? '' : 'disabled'}>${open ? (left ? 'Vào phó bản' : 'Hết lượt') : `Cần cấp ${d.lv}`}</button></footer></div>`;
  }).join('');
  return `<p class="desc">Vào phó bản theo lượt — mỗi ngày ${DG_TRIES} lượt mỗi bản. Hoàn thành càng nhanh hạng càng cao (S ≤ 50% giờ, A ≤ 75%), thưởng càng lớn.</p>${cards}`;
}
export function dungeonBind(reload) {
  document.querySelectorAll('#mBody [data-dg]').forEach(b => b.onclick = () => { if (dungeonStart(b.dataset.dg)) closeModal(); });
}
export function boatBody(r) {
  const s = dgSaveState(), rec = r.dgRec || {};
  const left = Math.max(0, BOAT_TRIES - (s.boat || 0));
  return `<div class="dg-card"><div class="dg-card-head"><b>Phong Lăng Độ</b><small>Cần cấp ${BOAT_LV} · ${BOAT_ROOMS} đoạn sông · ${BOAT_LIMIT}s</small></div>
    <p class="desc small">Lên đò dọc sông — Thủy Tặc chặn đường từng đoạn, đoạn cuối <b>Thủy Tặc Đầu Lĩnh</b> chờ sẵn. Trong chuyến, <b>Huyền Tinh và đá thuộc tính rơi ×${BOAT_DROP_X}</b>.</p>
    ${rec.boatN ? `<small class="dim">Đã vượt ${rec.boatN} chuyến từ trước tới nay.</small>` : ''}
    <footer><span>${S.lvl >= BOAT_LV || r.stat.reborn > 0 ? `<b>${left}/${BOAT_TRIES}</b> chuyến còn hôm nay` : 'Chưa mở khóa'}</span>
    <button class="btn" data-boat-go ${(!busy() && left && (S.lvl >= BOAT_LV || r.stat.reborn > 0)) ? '' : 'disabled'}>${S.lvl >= BOAT_LV || r.stat.reborn > 0 ? (left ? 'Lên thuyền' : 'Hết chuyến đò hôm nay') : `Cần cấp ${BOAT_LV}`}</button></footer></div>
    <details class="dg-rules"><summary>Quy tắc</summary><p>${BOAT_TRIES} chuyến mỗi ngày, trừ chuyến khi lên thuyền. Hết giờ hoặc gục ngã kết thúc chuyến — giữ phần thưởng đã rơi.</p></details>`;
}
export function boatBind(reload) {
  const b = document.querySelector('#mBody [data-boat-go]');
  if (b) b.onclick = () => { if (boatStart()) closeModal(); };
}
export function weekBossBody(r) {
  const s = dgSaveState(), tid = weekBossTid();
  const name = MON[tid] ? MON[tid].n : 'Trùm';
  const pct = s.wbHp > 0 ? Math.round(s.wbBest / s.wbHp * 100) : 0;
  return `<div class="dg-card"><div class="dg-card-head"><b>Boss tuần: ${esc(name)}</b><small>${WB_LIMIT}s mỗi lượt · máu ×${WB_HP_X}</small></div>
    <p class="desc small">Mỗi tuần một trùm · một rương thưởng. ${WB_TRIES} lượt mỗi tuần, trừ lượt khi vào. Gục, hết giờ hoặc rời trận vẫn giữ sát thương đã gây ra — kết quả tính theo <b>phần trăm sinh lực của boss</b>. Boss và lượt làm mới vào thứ Hai.</p>
    ${s.wbHp > 0 ? `<small class="dim">Kết quả tốt nhất tuần này: ${fmt(s.wbBest)} sát thương (${pct}%) · hạng <b>${s.wbRank || '—'}</b></small>` : ''}
    <footer><span>${S.lvl >= WB_MIN_LV || r.stat.reborn > 0 ? `<b>${WB_TRIES - s.wbTries}/${WB_TRIES}</b> lượt còn tuần này` : 'Chưa mở khóa'}</span>
    <button class="btn" data-wb-go ${(!busy() && s.wbTries < WB_TRIES && (S.lvl >= WB_MIN_LV || r.stat.reborn > 0)) ? '' : 'disabled'}>${S.lvl >= WB_MIN_LV || r.stat.reborn > 0 ? (s.wbTries < WB_TRIES ? 'Khiêu chiến' : 'Hết lượt tuần này') : `Cần cấp ${WB_MIN_LV}`}</button></footer></div>
    <div class="dg-card"><div class="dg-card-head"><b>Rương tuần</b><small>Nhận 1 lần mỗi tuần theo hạng tốt nhất</small></div>
    <p class="desc small">Hạng S: +10.000 lượng · +15 KNB · +50 Phúc Duyên · 1 món đồ bộ · +3 điểm tiềm năng. Hạng càng thấp rương càng nhẹ.</p>
    <footer><span>${s.wbRank ? `Hạng tuần này: <b>${s.wbRank}</b>` : 'Chưa có kết quả'}</span>
    <button class="btn" data-wb-claim ${weekBossChestReady() ? '' : 'disabled'}>${s.wbClaimed ? 'Đã nhận' : 'Nhận rương'}</button></footer></div>`;
}
export function weekBossBind(reload) {
  const go = document.querySelector('#mBody [data-wb-go]');
  if (go) go.onclick = () => { if (weekBossStart()) closeModal(); };
  const claim = document.querySelector('#mBody [data-wb-claim]');
  if (claim) claim.onclick = () => { if (weekBossClaim()) reload(); };
}

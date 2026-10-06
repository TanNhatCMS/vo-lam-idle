// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { npcSfx, skillSfx, uiSfx } from './audio';
import { autoBuyWeapon, autoForge } from './auto';
import { manual, moveManual, townTick } from './control';
import {
  $,
  CRIT_MULT,
  ELEM,
  ELEM_COL,
  J,
  MAX_HIT,
  MAX_LEVEL,
  MAX_RESIST,
  MIN_HIT,
  MON,
  PLAYER_RES_MAX,
  PTS_PER_LEVEL,
  RAR_COL,
  SERIES_COL,
  SKILL_PTS_PER_LEVEL,
  STAGES,
  W,
  WAVES,
  ZONES,
  ZONE_STAGES,
  clamp,
  counters,
  esc,
  fmt,
  inWorld,
  irnd,
  pick,
  rnd,
  wpick,
} from './core';
import { checkHints } from './guide';
import { curseMod, skillSysTick } from './skillsys';
import { thanMaOnKill } from './horse';
import { dexMark, tpStacks } from './depth';
import { guildBuff, tkCleared, tkExit, tkSpawn, ytTick } from './activities';
import { tower2Bonuses } from './tower2';
import { jxSync } from './look';
import { jrAdd, jrDeath } from './journal';
import { onLevelUp, onStageChange, onZoneChange } from './loop';
import { dropToGround, moneyDrop, rollDrops, updateGround } from './loot';
import { obsChase, obsFrame, obsSteer } from './mapobs';
import { allDrops } from './recipes';
import { addText, burst, dirOf, fxLine, img, skillFx } from './render';
import {
  GB_RETRY,
  RW,
  goldBossDue,
  goldBossTick,
  petAutoEquip,
  petRealmAbort,
  petRealmActive,
  petRealmSpawn,
  petTick,
  questTick,
  rebornBonus,
  rwOnKill,
  spawnGoldBoss,
  towerCleared,
  towerExit,
  towerSpawn,
} from './rewards';
import { backFromBossArena, wbTick, wbVictory } from './worldboss';
import { S } from './save';
import { rollSetDrop } from './sets';
import { takeStock } from './shop';
import { calc, power } from './stats';
import { autoEquipAll, log, sweepJunk } from './ui';
import type { GameState, Hero } from './types';

/* ======================= CHIEN DAU (KNpc::CheckHitTarget / CalcDamage) ======================= */
'use strict';
export const R: GameState = { corpses: [], lootWait: 0, ground: [], pickTarget: null, enemies: [], P: null, life: 1, mana: 1, atkT: 0, deadT: 0, spawnT: 0, kills: 0, t0: Date.now(), logs: [], fx: [], txt: [], dirty: true, stall: 0, farm: 0 };
export const AR: { [k: string]: any; w: number; h: number; top: number; bot: number; } = { w: 400, h: 520, top: 70, bot: 470 };
export const H: Hero = { x: 768, y: 768, face: 1 };

/* ---------- vung / ai ---------- */
export const zoneIdx = st => Math.min(ZONES.length - 1, Math.floor((st - 1) / ZONE_STAGES));
export const zoneOf = st => ZONES[zoneIdx(st)];
export const inZone = st => ((st - 1) % ZONE_STAGES) + 1;
export function stageLevel(st) {
  if (st > STAGES) return Math.min(MAX_LEVEL, 160 + Math.floor((st - STAGES) / 2));   // ai sau vung cuoi kep o cap toi da: nhip len cap 99 (tests: pacing) da hieu chinh voi kep nay; bo kep thi cap 99 mat > 60 gio
  const z = zoneOf(st); return Math.round(z.lo + (inZone(st) - 1) * (z.hi - z.lo) / (ZONE_STAGES - 1));
}
export const isBossStage = st => inZone(st) === ZONE_STAGES;

/* ---------- quai: Npcs.txt khong co chi so theo cap -> cong thuc rieng cua game (docs/CONG_THUC.md) ---------- */
export const POISON_TIME = 3;
export const CLS = { normal: { hp: 1, dmg: 1, xp: 1, r: 17 }, elite: { hp: 2.5, dmg: 1.3, xp: 3, r: 21 }, boss: { hp: 9, dmg: 1.7, xp: 20, r: 30 } };
/* Do kho (chon o the Khac): Thuong la can bang chuan cua cac bo kiem thu. De / Kho doi mau, sat thuong quai va thuong kinh nghiem / ngan luong */
export const DIFFS = [{ n: 'Dễ', hp: 0.75, dmg: 0.7, rew: 0.8, d: 'Quái yếu hơn (máu −25%, sát thương −30%), thưởng −20%' }, { n: 'Thường', hp: 1, dmg: 1, rew: 1, d: 'Cân bằng chuẩn' }, { n: 'Khó', hp: 1.4, dmg: 1.35, rew: 1.25, d: 'Quái mạnh hơn (máu +40%, sát thương +35%), thưởng +25%' }];
export const diffOf = () => S && S.chal === 'hard' ? DIFFS[2] : DIFFS[(S && [0, 1, 2].includes(S.diff)) ? S.diff : 1];   // thu thach Huyet chien: Khó co dinh
function enemyStats(L, cls) {
  const c = CLS[cls];
  return { hp: (18 + 8 * L + 0.55 * L * L) * c.hp, dmg: (2 + 1.0 * L + 0.006 * L * L) * c.dmg, ar: 30 + L * 9, def: 8 + L * 3.2 };
}
/* Nhip len cap (docs/CONG_THUC.md): truoc day cap 150 chi mat ~2 gio choi. Den cap 30 giu nguyen (vao game nhanh),
   sau do kinh nghiem nhan duoc chia cho 1 + 200 x ((cap - 30) / 120)^1.4  (cap 60: /30, cap 90: /77, cap 150: /201)
   -> cap 150 mat vai ngay choi (tests: pacing). */
const XP_SLOW_FROM = 30, XP_SLOW_K = 200, XP_SLOW_P = 1.4;
const xpSlow = L => L <= XP_SLOW_FROM ? 1 : 1 + XP_SLOW_K * Math.pow((L - XP_SLOW_FROM) / 120, XP_SLOW_P);
export function expFor(L) { return J.exp[clamp(L, 1, MAX_LEVEL) - 1] / (10 + L * 1.4); }
export function makeEnemy(tid, L, cls, x, y) {
  const m = MON[tid], z = zoneOf(S.stage), st = enemyStats(L, cls), D = diffOf(); st.hp *= D.hp; st.dmg *= D.dmg;
  const series = wpick([0, 1, 2, 3, 4], i => z.sw[i] + 1);
  const res = {}; ELEM.forEach((e, i) => { res[e] = Math.min(m.rmax[i] || 75, L * 0.35 + (cls === 'boss' ? 10 : 0)); });
  return { id: Math.random(), tid, n: m.n, img: m.img ? img(m.img) : null, sz: m.sz, L, cls, series, res,
    hp: st.hp, max: st.hp, dmg: st.dmg, ar: st.ar, def: st.def, x, y, r: CLS[cls].r,
    spd: (30 + (m.run || 6) * 4) * (cls === 'boss' ? 0.7 : 1), atkCd: rnd(0.5, 1.5), cd: 1.2 + 18 / Math.max(8, m.spd || 18) * 0.5,
    ranged: Math.random() < 0.2 && cls !== 'boss', stun: 0, poison: 0, poisonDmg: 0, hitT: 0, face: 1 };
}
function spawnWave() {
  if (R.petRealm) { petRealmSpawn(); return; }             // Bi canh Ngu Hanh: quai ep he, khong sinh theo vung
  R.enemies = []; R.stall = 0;
  const z = zoneOf(S.stage), L = stageLevel(S.stage);
  // quai xuat hien quanh nhan vat (ngoai tam nhin mot chut) roi tien lai
  const around = (r0, r1) => { const a = rnd(0, Math.PI * 2), r = rnd(r0, r1); return inWorld(H.x + Math.cos(a) * r, H.y + Math.sin(a) * r); };
  const sx = () => (R.sp = around(140, 240))[0], sy = () => R.sp[1];
  if (S.wave === WAVES && isBossStage(S.stage)) {
    const bp = around(220, 260); R.enemies.push(makeEnemy(z.boss, L + 1, 'boss', bp[0], bp[1]));
    R.enemies.push(makeEnemy(pick(z.m), L, 'elite', sx(), sy()));
    log(`<b class="boss">${esc(MON[z.boss].n)}</b> xuất hiện!`);
  } else {
    const n = 2 + irnd(0, 2) + (inZone(S.stage) > 5 ? 1 : 0);
    for (let i = 0; i < n; i++) R.enemies.push(makeEnemy(pick(z.m), L, S.wave === WAVES && i === 0 ? 'elite' : 'normal', sx(), sy()));
  }
  if (z.id !== R.zoneShown) { R.zoneShown = z.id; R.banner = { t: 2.4, text: z.n, sub: `Cấp ${z.lo}–${z.hi}` }; if (typeof onZoneChange === 'function') onZoneChange(z); }
}

/* ---------- cong thuc trung / sat thuong ---------- */
export function hitPercent(ar, def, ignore = 0) {
  const d = def * (100 - Math.min(ignore, 100)) / 100;
  let p = ar + d === 0 ? 50 : ar * 100 / (ar + d);
  if (p > MAX_HIT + 4) p = MAX_HIT;
  return Math.max(MIN_HIT, p);
}
/* Mot phan sat thuong (vat ly / nguyen to) vao muc tieu: ngu hanh -> khang -> nhan (100 - khang)% */
export function applyPart(dmg, e, attackerSeries, targetSeries, targetRes, targetResMax, series5) {
  let res = targetRes[e];
  if (counters(attackerSeries, targetSeries)) res -= series5;           // ta khac dich: dich giam khang
  else if (counters(targetSeries, attackerSeries)) res += series5;      // dich khac ta: dich tang khang
  res = clamp(res, -targetResMax, Math.min(targetResMax, MAX_RESIST));
  return dmg * (100 - res) / 100;
}
function heroHit(a, e) {
  const cm = curseMod(e);   // bua hai: giam phong thu / khang / chinh xac cua dich
  const resCm = cm ? Object.fromEntries(ELEM.map(x => [x, (e.res[x] || 0) + (cm.res[x] || 0)])) : e.res;
  if (a.useAR && Math.random() * 100 >= hitPercent(R.P.ar, e.def + (cm ? cm.def : 0), a.ignore)) { addText(e.x, e.y - e.r - 8, 'Trượt', '#aaa', 11); return 0; }
  const crit = Math.random() * 100 < a.crit;
  let tot = 0, best = 'phys', bv = 0;
  for (const el in a.parts) {
    let d = a.parts[el] * rnd(0.85, 1.15);
    if (el === 'poison') { // doc cong don: phan chua gay cua lan truoc + lan moi, trai deu 3 giay (KNpc::ReceiveDamage gop 2 luong doc)
      const left = e.poison > 0 ? e.poisonDmg * e.poison : 0;
      e.poisonDmg = (left + applyPart(d, 'poison', a.series, e.series, resCm, 75, a.series5)) / POISON_TIME; e.poison = POISON_TIME; continue; }
    d = applyPart(d, el, a.series, e.series, resCm, 75, a.series5);
    if (crit && el === 'phys') d *= CRIT_MULT;
    tot += d; if (d > bv) { bv = d; best = el; }
  }
  // ngu hanh tang cuong / khang (five_elements_enhance_v) cong tru truc tiep
  if (counters(a.series, e.series)) tot += R.P.series5;
  if (e.cls === 'boss' || e.cls === 'elite') tot *= 1 + tpStacks().tru * 0.06;   // tam phap Pha Trum
  tot *= tower2Bonuses(e).dmg;                             // TS6 Khai Son: +dame Thap II
  tot = Math.max(1, tot);
  e.hp -= tot; e.hitT = 0.12; if (e.act !== 'at') { e.act = 'hurt'; e.actT = 0; npcSfx(MON[e.tid].anim, 'hurt', 0.3); }
  if (a.stun && Math.random() * 100 < a.stun) e.stun = 0.8;
  if (R.P.leech) heal(tot * R.P.leech / 100, true);
  if (R.P.manaLeech) R.mana = Math.min(R.P.mana, R.mana + tot * R.P.manaLeech / 100);
  const k = counters(a.series, e.series) ? ' ⚡' : '';
  addText(e.x, e.y - e.r - 6, fmt(tot) + k, crit ? '#ffe14a' : ELEM_COL[best], crit ? 16 : 12);
  return tot;
}
function enemyHit(e) {
  const cm = curseMod(e);   // bua hai: dich giam sat thuong va chinh xac
  if (Math.random() * 100 >= hitPercent(e.ar + (cm ? cm.ar : 0), R.P.def)) { addText(H.x, H.y - 30, 'Né', '#9cf', 11); return; }
  const el = e.series === 1 && Math.random() < 0.4 ? 'poison' : e.series === 2 && Math.random() < 0.4 ? 'cold' : e.series === 3 && Math.random() < 0.4 ? 'fire' : e.series === 4 && Math.random() < 0.3 ? 'light' : 'phys';
  let d = e.dmg * rnd(0.8, 1.2) * (cm ? 1 + cm.dmg / 100 : 1) * (1 - tpStacks().ho * 0.01) * tower2Bonuses(e).taken;   // Ho The hoa giai + TS6 Ho Thap
  d = applyPart(d, el, e.series, R.P.series, R.P.res, PLAYER_RES_MAX, 10);
  if (R.P.res5 && !counters(e.series, R.P.series)) d = Math.max(1, d - R.P.res5); // ngu hanh khang (five_elements_resist_v)
  R.life -= d; R.hurtT = 0.25; if (H.act !== 'at' && Math.random() < 0.3) { H.act = 'hurt'; H.actT = 0; }
  if (R.P.retMelee || R.P.retMeleeP) { const ret = R.P.retMelee + d * R.P.retMeleeP / 100; if (ret > 0) { e.hp -= ret; } }
  addText(H.x + rnd(-10, 10), H.y - 36, '-' + fmt(d), '#ff6a5a', 12);
}
export function heal(v, quiet) { const b = R.life; R.life = Math.min(R.P.life, R.life + v); if (!quiet && R.life - b > 1) addText(H.x, H.y - 44, '+' + fmt(R.life - b), '#7f7', 11); }

/* ---------- tu dung thuoc (potion.txt): hoi dan theo thoi gian, tru ngan luong ---------- */
export const POT_TIER_LV = [0, 1, 20, 40, 70, 100]; // cap nhan vat mo khoa bac thuoc 1..5
export function bestPotion(kind) {
  let best = null;
  for (const p of J.potions) if (p.kind === kind && S.lvl >= (POT_TIER_LV[p.tier] || 999) && potPrice(p) <= S.gold && (!best || p.tier > best.tier)) best = p;
  return best;
}
/* Gia thuoc tang theo cap nhan vat (cho tieu ngan luong: potion.txt gia co dinh, quai cap cao roi nhieu ngan luong) */
export const potPrice = p => Math.round(p.price * (1 + S.lvl / 25));
function autoPotion(dt) {
  R.hot = R.hot || { life: 0, mana: 0, lifeT: 0, manaT: 0 };
  const h = R.hot, P = R.P;
  for (const k of ['life', 'mana']) {
    if (h[k + 'T'] > 0) { const d = Math.min(dt, h[k + 'T']); h[k + 'T'] -= dt; if (k === 'life') R.life = Math.min(P.life, R.life + h.life * d); else R.mana = Math.min(P.mana, R.mana + h.mana * d); }
  }
  if (S.potOff) return;
  const needLife = R.life < P.life * 0.5, needMana = P.main.cost > 0 && R.mana < P.main.cost * 2;
  h.cd = Math.max(0, (h.cd || 0) - dt);
  for (const [k, need] of [['life', needLife], ['mana', needMana]]) {
    // binh thuong: 1 binh moi lan hoi xong; nguy kich (< 30% mau): uong them binh chong len, cach nhau 1 giay
    const urgent = k === 'life' && R.life < P.life * 0.3 && h.cd <= 0;
    if (!need || (h[k + 'T'] > 0 && !urgent)) continue;
    const own = takeStock(k), p = own || bestPotion(k); if (!p) continue;
    usePotion(k, p, !!own);
    if (k === 'life') h.cd = 1;
  }
}
export function usePotion(k, p, free) { // mua va uong ngay: hoi dan trong p.dur giay, cong don phan con lai cua binh truoc
  R.hot = R.hot || { life: 0, mana: 0, lifeT: 0, manaT: 0 };
  const h = R.hot;
  if (!free) S.gold -= potPrice(p);
  S.potUsed = (S.potUsed || 0) + 1; questTick('pots');
  const left = h[k + 'T'] > 0 ? h[k] * h[k + 'T'] : 0;
  h[k + 'T'] = p.dur; h[k] = (left + p.total) / p.dur;
}

/* ---------- vong lap ---------- */
export const alive = () => R.enemies.filter(e => e.hp > 0);
function nearest(list) { let b = null, bd = 1e9; for (const e of list) { const d = Math.hypot(e.x - H.x, e.y - H.y); if (d < bd) { bd = d; b = e; } } return b; }
/* Xoay chieu tu dong khi farm quai thuong (gap trum / tinh anh thi danh chieu chinh): luan phien cac chieu tan cong dang gan o 1..4 (luon co 2 chieu manh nhat, them chieu >= 40% DPS chieu manh nhat);
   chieu het noi luc thi bo qua, khong chieu nao du noi luc thi danh thuong. Tat: danh moi chieu chinh nhu truoc. */
function rotPool(P) {
  if (S.rot === false || window.NO_ROT) return [];   // NO_ROT: chi dung de so sanh A / B trong test
  const ids = (S.slots || []).filter(Boolean), pool = P.actives.filter(a => ids.includes(a.id));
  if (pool.length < 2) return [];
  const byDps = pool.slice().sort((a, b) => b.dps - a.dps), top = byDps[0].dps, keep = new Set(byDps.filter((a, i) => i < 2 || a.dps >= top * 0.4));   // it nhat 2 chieu manh nhat, them chieu >= 40% DPS chieu manh nhat
  return ids.map(id => pool.find(a => a.id === id)).filter(a => a && keep.has(a));
}
function pickAttack(P, hard) {
  const pool = hard ? [] : rotPool(P);                  // gap trum / tinh anh: danh chieu chinh manh nhat (khong xoay) de khong mat DPS
  if (pool.length < 2) return R.mana >= P.main.cost ? P.main : P.basic;
  const n = pool.length; R.rotI = (R.rotI || 0) % n;
  for (let k = 0; k < n; k++) { const a = pool[(R.rotI + k) % n]; if (R.mana >= a.cost) { R.rotI = (R.rotI + k + 1) % n; return a; } }
  return P.basic;
}
function heroAttack() {
  const P = R.P, list = alive(); if (!list.length) return 0.3;
  const a = pickAttack(P, list.some(e => e.cls === 'boss' || e.cls === 'elite' || e.goldBoss));
  const t = nearest(list);
  const d = Math.hypot(t.x - H.x, t.y - H.y) - t.r;
  if (d > a.rad) { R.moveTo = manual() ? null : t; return 0.05; }   // tu dieu khien: chi danh quai trong tam, khong tu chay toi
  R.moveTo = null;
  R.mana -= a.cost;
  const c = a.around ? H : t, splash = a.around ? a.rad + 40 : 110; // form 7: quanh nguoi danh
  const targets = list.filter(e => e !== t && Math.hypot(e.x - c.x, e.y - c.y) < (a.targets > 1 ? splash : 0)).slice(0, a.targets - 1);
  targets.unshift(t);
  for (const e of targets) { heroHit(a, e); skillFx(H, e, a); }
  H.face = t.x >= H.x ? 1 : -1; H.dir = dirOf(t.x - H.x, t.y - H.y); H.act = 'at'; H.actT = 0;
  if (a.id) skillSfx(a.id); else npcSfx(W.hero[S.fac] && W.hero[S.fac].anim, 'at', 0.4);
  return 1 / a.rate;
}
function enemyAI(e, dt) {
  if (e.stun > 0) { e.stun -= dt; return; }
  if (e.regen > 0 && e.hp < e.max) e.hp = Math.min(e.max, e.hp + e.max * e.regen * dt);   // bien the tuan: Hoi huyet
  if (e.poison > 0) { e.poison -= dt; e.hp -= e.poisonDmg * dt; }
  const d = Math.hypot(H.x - e.x, H.y - e.y), reach = e.ranged ? 200 : e.r + 24;
  e.face = H.x >= e.x ? 1 : -1; e.dir = dirOf(H.x - e.x, H.y - e.y);
  e.moving = d > reach;
  if (e.moving) obsChase(e, H.x, H.y, e.spd * dt);
  e.atkCd -= dt;
  if (d <= reach + 4 && e.atkCd <= 0) { const cm2 = curseMod(e); e.atkCd = e.cd * (cm2 ? Math.max(0.5, Math.min(2, 1 + cm2.slow / 100)) : 1); enemyHit(e); e.act = 'at'; e.actT = 0; npcSfx(e.animKey || MON[e.tid].anim, 'at', 0.35); if (e.ranged) fxLine(e, H, { parts: { phys: 1 } }); }
}
export function tick(dt) {
  obsFrame();
  skillSysTick(dt);
  if ((R.sweepT = (R.sweepT || 0) + dt) > 30) { R.sweepT = 0; autoEquipAll(); petAutoEquip(); sweepJunk(); autoBuyWeapon(); autoForge(); checkHints(); }
  if (R.dirty) recalc();
  const P = R.P;
  if (R.deadT > 0) { R.deadT -= dt; if (R.deadT <= 0) { R.life = P.life; R.mana = P.mana; S.wave = 1; if (R.wbArena) backFromBossArena(); else spawnWave(); } return; }
  R.life = Math.min(P.life, R.life + P.regen * dt); R.mana = Math.min(P.mana, R.mana + P.manaRegen * dt);
  autoPotion(dt);
  if (R.hurtT > 0) R.hurtT -= dt;
  if (R.tpCd > 0) R.tpCd -= dt;
  if (R.potCd) { R.potCd.life = Math.max(0, R.potCd.life - dt); R.potCd.mana = Math.max(0, R.potCd.mana - dt); }
  goldBossTick(dt); petTick(dt); wbTick(dt);                              // phan thuong: trum Hoang Kim, dong hanh, Boss The Gioi (rewards/worldboss)
  if (R.town) { townTick(dt); return; }                                // trong thanh (Tho Dia Phu)
  R.activeT = (R.activeT || 0) + dt;                                    // thoi gian danh quai thuc (khong tinh tab an, trong thanh, Luyen Cong) -> S.kps
  const looting = updateGround(dt);                       // di nhat do (cham tay, hoac het quai + khop bo loc)
  if (!R.enemies.length) {
    if (looting && R.lootWait < 8) { R.lootWait += dt; return; }   // doi nhat xong (toi da 8 giay) moi goi dot moi
    if (R.spawnT > 0) { R.spawnT -= dt; return; }
    R.lootWait = 0;
    if (R.wbArena) return;                                 // bí cảnh boss: không sinh đợt quái thường
    if (R.tower) towerSpawn(); else if (R.tk) tkSpawn(); else { spawnWave(); if (goldBossDue()) spawnGoldBoss(); }
    return;
  }
  if (manual()) moveManual(dt);                             // tu dieu khien: joystick / phim / diem cham
  if (!(looting && !R.petLoot && (R.pickTarget || R.autoPick))) {   // pet dang di nhat thay (R.petLoot) thi nguoi van danh quai
    if (manual()) { /* dung yen hoac di theo tay, khong tu chay toi quai */ }
    else if (R.moveTo && R.moveTo.hp > 0) {
      obsSteer(H, R.moveTo.x, R.moveTo.y, 150 * P.speed * dt);
    }
    R.atkT -= dt; if (R.atkT <= 0) R.atkT = heroAttack();
  }
  for (const e of alive()) enemyAI(e, dt);
  killCheck();
  R.stall += dt; if (R.stall > 45) stallOut();
  if (R.life <= 0) heroDeath();
}
/* Dot quai qua lau (danh khong noi): truoc day chi goi lai dot moi -> o ai trum, nhan vat yeu danh lai trum mai mai, khong
   tien khong lui (ket vinh vien o ai 30/40/50). Nay: lui 1 ai va luyen cong nhu khi guc (khong mat mau), thap thi roi thap. */
function stallOut() {
  R.stall = 0;
  if (R.wbArena) { log('<span class="dim">Đánh mãi không hạ Boss Thế Giới — nên rèn đồ, uống thuốc rồi thử lại.</span>'); return; }
  if (R.tower) { towerExit(false); return; }
  const boss = R.enemies.some(e => !e.dead && e.cls === 'boss');
  if (boss || S.wave === WAVES) {
    if (R.enemies.some(e => e.goldBoss && !e.dead)) RW().gbT = GB_RETRY;
    log('<span class="dim">Đánh mãi không hạ được, lui về luyện công.</span>');
    if (S.stage > 1) { S.stage--; S.push = false; R.farm = 0; }
    S.wave = 1; if (typeof onStageChange === 'function') onStageChange();
  } else log('<span class="dim">Đợt quái kéo dài quá lâu, gọi đợt mới.</span>');
  spawnWave();
}
function killCheck() {
  for (const e of R.enemies) if (e.hp <= 0 && !e.dead) { e.dead = true; onKill(e); npcSfx(MON[e.tid].anim, 'die', 0.5); if (!R.quiet) { e.act = 'die'; e.actT = 0; R.corpses.push(e); } }
  if (R.enemies.length && R.enemies.every(e => e.dead)) { R.enemies = []; waveCleared(); }
}
function onKill(e) {
  R.kills++; S.totalKills = (S.totalKills || 0) + 1;
  const lvDiff = e.L - S.lvl, mult = lvDiff < -10 ? 0.2 : lvDiff < -5 ? 0.6 : 1;
  const gx = expFor(e.L) * CLS[e.cls].xp * mult * diffOf().rew;
  gainXp(gx);
  const g = Math.round(moneyDrop(e) * diffOf().rew); S.gold += g;
  jrAdd('kills', 1); jrAdd('xp', gx); jrAdd('gold', g);      // so tay: thong ke theo gio choi that
  thanMaOnKill(e);                                         // ngua dang cuoi nhan kinh nghiem
  dexMark(e.tid);                                          // bach khoa: quai da ha
  if (R.tk) R.tk.kills++;
  ytTick('kills', 1);
  if (e.cls === 'boss') ytTick('bosses', 1);
  burst(e.x, e.y, SERIES_COL[e.series]);
  for (const it of rollDrops(e)) dropToGround(it, e);
  for (const m of allDrops(e)) log(`Nhặt được <b style="color:${RAR_COL[3]}">${esc(m)}</b>`);
  const gold = rollSetDrop(e); if (gold) { dropToGround(gold, e); log(`<b style="color:${RAR_COL[gold.r]}">${esc(gold.n)}</b> rơi ra!`); }
  if (e.cls === 'boss') log(`Hạ <b class="boss">${esc(e.n)}</b> (+${fmt(g)} lượng)`);
  rwOnKill(e);
}
export function gainXp(x) {
  if (S.lvl >= MAX_LEVEL) return;
  S.xp += x * (1 + rebornBonus().xp + guildBuff().xp / 100) / xpSlow(S.lvl);    // chuyen sinh +20%/lan, bang hoi +0.5%/cap; nhip len cap sau cap 30
  while (S.lvl < MAX_LEVEL && S.xp >= J.exp[S.lvl - 1]) {
    S.xp -= J.exp[S.lvl - 1]; S.lvl++;
    S.attrPts += PTS_PER_LEVEL; S.skPts += SKILL_PTS_PER_LEVEL;
    R.dirty = true; uiSfx('levelup'); log(`<b class="up">Lên cấp ${S.lvl}!</b> +${PTS_PER_LEVEL} tiềm năng, +${SKILL_PTS_PER_LEVEL} kỹ năng`);
    if (typeof onLevelUp === 'function') onLevelUp();
  }
}
function waveCleared() {
  if (R.wbArena) { wbVictory(); return; }                  // hạ Boss Thế Giới: thưởng Vỏ Sò, không cộng ải
  if (R.tk) { tkCleared(); return; }                       // Tong Kim: dot kep tiep / chien thang
  if (R.tower) { towerCleared(); return; }                 // thap thu thach: len tang, khong doi ai
  heal(R.P.life * 0.15, true); R.mana = Math.min(R.P.mana, R.mana + R.P.mana * 0.2); // dieu tuc giua cac dot
  if (S.wave < WAVES) { S.wave++; R.spawnT = 1.2; return; }
  S.wave = 1;
  if (!S.push && ++R.farm >= 3 && R.life > R.P.life * 0.6) { S.push = true; R.farm = 0; log('Đủ mạnh, thử vượt ải tiếp.'); }
  if (S.push) {
    S.stage++; S.maxStage = Math.max(S.maxStage, S.stage); questTick('stages'); ytTick('stages', 1);
    if (inZone(S.stage) === 1 && S.stage <= STAGES) log(`Tiến vào <b>${esc(zoneOf(S.stage).n)}</b>`);
  }
  if (typeof onStageChange === 'function') onStageChange();
}
function heroDeath() {
  if (R.enemies.some(e => e.goldBoss && !e.dead)) RW().gbT = GB_RETRY;   // thua trum Hoang Kim: 5 phut sau quay lai
  petRealmAbort(true);                                   // guc trong bi canh: roi ra, khong mat cooldown
  jrDeath(R.tower ? 'Luyện Công' : R.wbArena ? 'Boss Thế Giới' : 'đánh ải');   // so tay: nhat ky lan guc
  R.deadT = 3; R.life = 0; R.enemies = [];
  log('<span class="bad">Bạn đã trọng thương.</span>');
  if (R.tk) { tkExit(true, false); return; }               // gục ở Tống Kim: kết thúc trận, vẫn nhận lệnh
  if (R.tower) { towerExit(true); return; }               // gục trong thap: roi thap, khong lui ai
  if (R.wbArena) { log('<span class="dim">Boss Thế Giới vẫn chờ ở bí cảnh — hồi sức rồi vào lại.</span>'); return; }
  if (S.stage > 1) { S.stage--; S.push = false; R.farm = 0; log(`Lùi về ải ${S.stage} để luyện công.`); }
  if (typeof onStageChange === 'function') onStageChange();
}
export function recalc() {
  try { jxSync(); } catch (e) { /* look: loi thi bo qua, ve hinh cu */ }
  const fl = R.P ? R.life / R.P.life : 1, fm = R.P ? R.mana / R.P.mana : 1;
  R.P = calc();
  R.life = Math.min(R.P.life, R.P.life * fl); R.mana = Math.min(R.P.mana, R.P.mana * fm);
  R.power = power(R.P); R.dirty = false;
}

/* ---------- mo phong nhanh (kiem thu, tien trinh offline) ---------- */
function simulate(seconds, step = 0.05) { const q = R.quiet; R.quiet = true; for (let t = 0; t < seconds; t += step) tick(step); R.quiet = q; }

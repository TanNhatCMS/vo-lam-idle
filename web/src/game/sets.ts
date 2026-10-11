// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { R, zoneIdx } from './combat';
import {
  $,
  FAC,
  FACTIONS,
  J,
  STAGES,
  clamp,
  irnd,
  pick,
} from './core';
import { S } from './save';
import { sexReqOk, slotOfEquipped } from './stats';
import { towerIs2 } from './tower2';

/* ======================= DO HOANG KIM / BACH KIM (KItemGenerator::Gen_GoldEquipment, KItemList) ======================= */
'use strict';
const GOLD_EXT = 2; // MAX_ITEM_MAGICATTRIB (8) - MAX_ITEM_NORMAL_MAGICATTRIB (6): 2 dong mo rong theo bo
/* gia tri = min + (max - min) * cap_sinh / MAX_ITEM_LUCK (10) */
function geValue(idx, g) {
  const m = J.ge[idx]; if (!m) return null;
  return { a: m.a, p: m.p.map(([lo, hi]) => (lo === -1 && hi === -1 ? -1 : Math.round(lo + (hi - lo) * g / 10))), pre: 1 };
}
export function makeSetItem(kind, row, luck) {
  const g = () => clamp(irnd(Math.min(10, luck), 10), 0, 10);
  const it = { uid: S.uid++, d: row.d, k: row.k, n: row.n, ic: row.ic || '', lvl: row.lvl, s: row.s, price: row.price,
    base: row.base.map(x => x.slice()), req: row.req.map(x => x.slice()), r: kind === 'gold' ? 4 : 5,
    set: { kind, grp: row.grp, n1: row.n1 || 99, n2: row.n2 || 99, sid: row.sid } };
  it.mag = row.mag.map(i => geValue(i, g())).filter(Boolean);
  it.ext = row.ext.map(i => geValue(i, g())).filter(Boolean);
  return it;
}
/* Roi do bo: chu yeu tu trum; uu tien bo cua mon phai nhan vat (requiremenpai), yeu cau cap khong qua xa cap nhan vat */
export function rollSetDrop(e) {
  if (e.towerId === 2 && towerIs2()) return tower2SetReward(e.towerFloor, e.cls);   // trung Thap II: do bo theo bac tang (sets.js goi tower2SetReward khi ha trung thuong)
  const chance = e.cls === 'boss' ? 0.05 + zoneIdx(Math.min(S.stage, STAGES)) * 0.004 : e.cls === 'elite' ? 0.004 : 0.0002;
  if (Math.random() >= chance) return null;
  const kind = e.L >= 100 && Math.random() < 0.2 ? 'platina' : 'gold';
  const lvCap = Math.max(S.lvl, e.L) + 10, fid = FAC[S.fac] ? FAC[S.fac].id : -1;
  const reqOf = (r, id) => (r.req.find(q => q[0] === id) || [0, -1])[1];
  let pool = J.sets[kind].filter(r => reqOf(r, 36) <= lvCap && sexReqOk(r.req));
  const mine = pool.filter(r => reqOf(r, 39) === fid);
  if (mine.length && Math.random() < 0.7) pool = mine;
  if (!pool.length) return null;
  return makeSetItem(kind, pick(pool), R.P ? Math.min(10, Math.floor(R.P.lucky / 10)) : 0);
}
/* IsEnoughToActive: co mot bo dang mac du NeedToActive2 mon -> mo het dong an cua MOI trang bi */
export function setCounts(eq) {
  const c = {};
  for (const k in eq) {
    const it = eq[k]; if (!it || !it.set || k === 'horse') continue;
    if (k === 'ring1' && eq.ring2 && eq.ring2.set && eq.ring2.set.grp === it.set.grp && eq.ring2.set.sid === it.set.sid) continue; // 2 nhan giong nhau tinh 1
    c[it.set.grp] = (c[it.set.grp] || 0) + 1;
  }
  return c;
}
export function enoughToActive(eq) {
  const c = setCounts(eq);
  for (const k in eq) { const it = eq[k]; if (it && it.set && c[it.set.grp] >= it.set.n2) return true; }
  return false;
}
/* GetGoldEquipEnhance: so dong mo rong = so mon cung bo / NeedToActive1 (du bo hoac ngua: ca 2) */
export function goldEnhance(it, eq) {
  const slot = slotOfEquipped(it, eq); if (!slot) return 0;
  if (slot === 'horse' || enoughToActive(eq)) return GOLD_EXT;
  return Math.min(GOLD_EXT, Math.floor((setCounts(eq)[it.set.grp] || 0) / Math.max(1, it.set.n1)));
}
/* Thien Cuc: bo do rieng Thap II — dong mau "Dang Long" yeu cau cap 180, doi ten + grp 10000+ (row ao) */
export const TOWER2_SET_ROWS = J.sets.gold.filter(r => r.n.startsWith("Đằng Long") && r.req.some(([id, v]) => id === 36 && v === 180))
  .map(r => Object.assign({}, r, { n: r.n.replace(/^Đằng Long/, "Thiên Cực"), grp: 10000 + r.grp, tower2: true }));
export function setMembers(it) { return it.set.grp >= 10000 ? TOWER2_SET_ROWS.filter(r => r.grp === it.set.grp) : J.sets[it.set.kind].filter(r => r.grp === it.set.grp); }

/* ======================= BO DO THAP II (tower2SetTier/Reward/DropChance, sets.js) ======================= */
/* Chi sinh do moi cua phai choi duoc hoac do khong gioi han phai; van loc gioi tinh. */
const SET_DROP_FACTIONS = new Set(FACTIONS.map(f => f.id));
export const setDropEligible = row => sexReqOk(row.req) && row.req.every(([id, v]) => id !== 39 || v < 0 || SET_DROP_FACTIONS.has(v));
/* Ty le roi do bo trong Thap II giam 5 lan de cham nhip (TOWER2_DROP_SCALE). */
export const TOWER2_DROP_SCALE = 0.2;
export const tower2DropChance = (rate, e) => rate * (e && e.towerId === 2 && towerIs2() ? TOWER2_DROP_SCALE : 1);
/* Bo Thien Cuc cap 200 chi co xac suat tu tang 50; bac duoc chon truoc, so luong hang trang bi khong tac dong den do hiem. */
const TOWER2_SET_MIN_FLOOR = 50;
const TOWER2_SET_BASE_RATES = Object.freeze({
  normal: Object.freeze({ lv180: 0.02, lv200: 0.0002 }),
  elite: Object.freeze({ lv180: 0.10, lv200: 0.001 }),
  boss: Object.freeze({ lv180: 0.30, lv200: 0.005 }),
  milestone: Object.freeze({ lv180: 0.98, lv200: 0.02 }),
});
const TOWER2_SET_RATES = Object.freeze(Object.fromEntries(Object.entries(TOWER2_SET_BASE_RATES).map(([source, rates]) => [source,
  Object.freeze({ lv180: rates.lv180 * TOWER2_DROP_SCALE, lv200: rates.lv200 * TOWER2_DROP_SCALE })])));
export function tower2SetTier(floor, source) {
  const rates = TOWER2_SET_RATES[source]; if (!rates) return 0;
  const p200 = floor >= TOWER2_SET_MIN_FLOOR ? rates.lv200 : 0, roll = Math.random();
  if (roll < p200) return 200;
  return roll < p200 + rates.lv180 ? 180 : 0;
}
/* Thuong do bo Thap II: pool theo bac (200 = Thien Cuc, 180 = bo vang req 180), uu tien 80% bo cua mon phai nhan vat. */
export function tower2SetReward(floor, source) {
  const tier = tower2SetTier(floor, source); if (!tier) return null;
  let pool = (tier === 200 ? TOWER2_SET_ROWS : J.sets.gold.filter(r => r.req.some(([id, v]) => id === 36 && v === 180))).filter(setDropEligible);
  const fid = FAC[S.fac] ? FAC[S.fac].id : -1, mine = pool.filter(r => r.req.some(([id, v]) => id === 39 && v === fid));
  if (mine.length && Math.random() < 0.8) pool = mine;
  return pool.length ? makeSetItem('gold', pick(pool), R.P ? Math.max(5, Math.floor(R.P.lucky / 10)) : 5) : null;
}
/* Hook debug/test E2E: gom cac ham bo Thap II tren window.__T2 (goc JS la function toan cuc,
   port dang module nen can dia chi nay de test goi truc tiep). Khong doc S/R o top-level. */
if (typeof window !== 'undefined') (window as any).__T2 = {
  tower2SetTier, tower2SetReward, tower2DropChance, setDropEligible, rollSetDrop,
};

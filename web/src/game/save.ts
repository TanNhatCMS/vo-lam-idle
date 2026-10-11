// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { autoBuyWeapon, autoForge } from './auto';
import { R, expFor, gainXp, stageLevel } from './combat';
import {
  $,
  DETAIL_SLOT,
  FAC,
  INV_MAX,
  MAX_LEVEL,
  PET_SLOT_KEYS,
  PTS_PER_LEVEL,
  SK,
  STAGES,
  clamp,
} from './core';
import { moneyDrop, rollDrops, saveGround } from './loot';
import { mats } from './recipes';
import { offlineChests, petAutoEquip, REBORN_MAX } from './rewards';
import { potStock } from './shop';
import { sexReqOkFor } from './stats';
import { addItem, autoEquipAll, sweepJunk } from './ui';
import type { SaveState } from './types';

/* ======================= LUU GAME (localStorage 'jxidle') ======================= */
'use strict';
const SAVE_V = 1, OFFLINE_MAX = 8 * 3600;
/* 3 slot nhan vat: slot 0 giu khoa cu 'jxidle' (tuong thich file luu truoc day), slot 1, 2 = 'jxidle_2', 'jxidle_3'.
   Con tro 'jxidle_slot' = chi so slot dang choi, hoac 'menu' (hien man hinh chon nhan vat o lan vao tiep theo). */
export const SLOT_N = 3, SLOT_PTR = 'jxidle_slot';
export let SLOT = 0, SAVE_LOCK = false;                 // SAVE_LOCK: dang xoa / doi nhan vat -> moi lan save() (pagehide, an tab...) bi chan, khong ghi lai nhan vat vua xoa
const slotKey = i => i === 0 ? 'jxidle' : 'jxidle_' + (i + 1);
const saveKey = () => slotKey(SLOT);
/* S luon co san (save mac dinh ngay luc nap module): cac island React co the
   goi ham game (bam nut, chuyen tab) trong khoang chong React mount -> boot(),
   hoac khi HMR nap lai module (dev) — doc S.fac=null -> cac ham early-return
   thay vi crash "Cannot read properties of undefined (reading 'eq'/'fac'/...)". */
export let S: SaveState = newSave();                 // newSave khai bao ben duoi hoist duoc
/* Gan lai bien cap module — module khac (loop.js, ui.js) khong gan duoc bien import truc tiep */
export function setSlot(v) { SLOT = v; }
export function setSaveLock(v) { SAVE_LOCK = v; }
export function setS(v) { S = v; }
const FEMALE_FAC = ['emei', 'cuiyan'];       // phai nu: trang phuc nu; con lai nam
export function newSave() {
  return { v: SAVE_V, name: 'Tân thủ', fac: null, sex: 0, lvl: 1, xp: 0, gold: 0, attrPts: 0, attr: { str: 0, dex: 0, vit: 0, eng: 0 }, attrBonusEarned: 0, attrPotentialV: 1,
    skPts: 1, sk: {}, main: 0, eq: {}, inv: [], stage: 1, maxStage: 1, wave: 1, push: true, uid: 1, autoSell: 0,
    kps: 0.2, totalKills: 0, autoEquip: true, autoPts: false, diff: 1, autoForge: false, autoBuy: true, tut: 0, hints: {}, bakAt: 0, potOff: false, potUsed: 0, potStock: { life: {}, mana: {} }, ctrl: 'auto', joy: 'fixed', slots: [0, 0, 0, 0], fieldMode: false,
    autoFind: true, autoBossPriority: true, autoRange: 'medium', autoSkillSlots: [true, true, true, true],
    autoHpPotion: true, hpPotionAt: 50, autoMpPotion: true, mpPotionAt: 30, autoTownHp: false, townHpAt: 20,
    invExpansions: 0, invOrder: [], invSort: 'new',
    snd: { on: true, vol: 0.7, music: true, mvol: 0.4 }, lootF: { mode: 'custom', minRar: 2, minReqLvl: 1, groups: [], series: [], auto: true, equipment: true, materials: true, white: false, skipLowSets: false, always: false }, ground: [], mats: { ht: {}, ore: {}, shard: {}, misc: {} }, setSeen: {}, last: Date.now() };
}
/* Chu ky file luu (cyrb53 + muoi): phat hien sua tay localStorage / ma xuat. Khong ngan duoc nguoi quyet tam (game chay hoan toan o may nguoi choi) nhung chan sua vo tinh va nhap ma da bi doi. */
const SAVE_SALT = 'jx-idle-v1:';
function sigOf(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57; const s = SAVE_SALT + str;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export function pack(state) {
  if (state && Object.prototype.hasOwnProperty.call(state, '_attrPotentialChanged')) {
    state = Object.assign({}, state); delete state._attrPotentialChanged;
  }
  const body = JSON.stringify(state); return JSON.stringify({ d: body, h: sigOf(body) });
}
export function unpack(txt) {                       // -> { state, ok } ; ok=false neu chu ky sai; file cu (khong goi) coi la hop le 1 lan roi ky lai
  const o = JSON.parse(txt);
  if (o && typeof o.d === 'string' && typeof o.h === 'string') return { state: JSON.parse(o.d), ok: sigOf(o.d) === o.h };
  return { state: o, ok: true, legacy: true };
}
export function save() {
  if (SAVE_LOCK || !S || !S.fac) return;
  S.last = Date.now(); if (typeof saveGround === 'function' && R.ground) saveGround();
  try {
    const k = saveKey(), prev = localStorage.getItem(k);
    if (prev) { try { if (unpack(prev).ok) localStorage.setItem(k + '_bak', prev); } catch (e) { /* bo qua ban hong */ } }   // ban sao luu = ban hop le truoc do
    localStorage.setItem(k, pack(S)); localStorage.setItem(SLOT_PTR, String(SLOT));
  } catch (e) { /* bo nho day / che do rieng tu */ }
}
/* ======================= DIEM TIEM NANG (F7 — port tu save.js / core.js) =======================
   core.ts khong thuoc phan vung MID, nen cac hang so / ham nay tu chua trong save.ts.
   Neu agent chinh dua potentialPointBudget/Limit/Used vao core.ts thi xoa nhanh nay va import tu do. */
export const POTENTIAL_ATTR_KEYS = Object.freeze(['str', 'dex', 'vit', 'eng']);
const MAX_POTENTIAL_BONUS = 1000, LEGACY_POTENTIAL_RECOVERY_FLOOR = 3000;
const MAX_ENEMY_LEVEL = 9999;
/* QA-038: chi copy khoa an toan cua du lieu nguoi dung -> chan prototype pollution qua '__proto__'. */
function safeKeys(x) { const out = {}; if (!x || typeof x !== 'object') return out; for (const k of Object.keys(x)) if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') out[k] = x[k]; return out; }
const safePotentialValue = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n)) : 0;
};
export function potentialPointBudget(state = S) {
  const level = clamp(Math.floor(+state.lvl) || 1, 1, MAX_LEVEL);
  const reborn = clamp(Math.floor(+(state.rw && state.rw.stat && state.rw.stat.reborn) || 0), 0, REBORN_MAX);
  const bonus = clamp(Math.floor(+state.attrBonusEarned || 0), 0, MAX_POTENTIAL_BONUS);
  return PTS_PER_LEVEL * (level - 1) + reborn * 50 + bonus;
}
export function potentialPointLimit(state = S) {
  return Math.max(potentialPointBudget(state), LEGACY_POTENTIAL_RECOVERY_FLOOR);
}
export function potentialPointsUsed(state = S) {
  return POTENTIAL_ATTR_KEYS.reduce((n, k) => n + Math.max(0, Math.floor(+((state.attr || {})[k]) || 0)), 0)
    + Math.max(0, Math.floor(+state.attrPts || 0));
}
function cleanPotentialBundle(value) {
  const source = safeKeys(value), attr = {};
  for (const key of POTENTIAL_ATTR_KEYS) attr[key] = safePotentialValue(source.attr && source.attr[key]);
  return { attr, unspent: safePotentialValue(source.unspent), bonusEarned: Math.min(MAX_POTENTIAL_BONUS, safePotentialValue(source.bonusEarned)) };
}
function cleanPotentialArchive(value) {
  const source = safeKeys(value);
  if (!Array.isArray(source.records)) return { version: 1, records: [] };
  const records = source.records.slice(-50).filter(r => r && typeof r === 'object').map(r => {
    const row = safeKeys(r), original = cleanPotentialBundle(row.original), active = cleanPotentialBundle(row.active), locked = cleanPotentialBundle(row.locked);
    const lockedTotal = Math.min(Number.MAX_SAFE_INTEGER, POTENTIAL_ATTR_KEYS.reduce((n, k) => n + locked.attr[k], locked.unspent));
    return { createdAt: safePotentialValue(row.createdAt), sourceLevel: clamp(safePotentialValue(row.sourceLevel) || 1, 1, MAX_ENEMY_LEVEL),
      reborn: clamp(safePotentialValue(row.reborn), 0, REBORN_MAX), original, active, locked, lockedTotal, noticeShown: row.noticeShown === true };
  });
  return { version: 1, records };
}
function fitPotentialAttributes(attr, limit) {
  const total = POTENTIAL_ATTR_KEYS.reduce((n, k) => n + attr[k], 0);
  if (total <= limit) return Object.assign({}, attr);
  if (!limit) return Object.fromEntries(POTENTIAL_ATTR_KEYS.map(k => [k, 0]));
  const scaled = POTENTIAL_ATTR_KEYS.map((k, i) => {
    const exact = attr[k] * (limit / total), value = Math.floor(exact);
    return { k, i, value, fraction: exact - value };
  });
  let spare = limit - scaled.reduce((n, row) => n + row.value, 0);
  scaled.slice().sort((a, b) => b.fraction - a.fraction || a.i - b.i).forEach(row => { if (spare-- > 0) row.value++; });
  return Object.fromEntries(scaled.map(row => [row.k, row.value]));
}
function restoreArchivedPotential(state, limit) {
  let remaining = Math.max(0, limit - potentialPointsUsed(state));
  if (!remaining || !state.attrPotentialArchive || !state.attrPotentialArchive.records.length) return 0;
  let restored = 0;
  for (const record of state.attrPotentialArchive.records) {
    if (!remaining) break;
    if (record.reborn !== state.rw.stat.reborn) continue;
    const locked = record.locked;
    const attrTotal = POTENTIAL_ATTR_KEYS.reduce((n, k) => n + locked.attr[k], 0);
    const attrRestore = Math.min(remaining, attrTotal), byAttr = fitPotentialAttributes(locked.attr, attrRestore);
    for (const k of POTENTIAL_ATTR_KEYS) {
      state.attr[k] += byAttr[k];
      locked.attr[k] -= byAttr[k];
    }
    remaining -= attrRestore; restored += attrRestore;
    const unspentRestore = Math.min(remaining, locked.unspent);
    state.attrPts += unspentRestore; locked.unspent -= unspentRestore;
    remaining -= unspentRestore; restored += unspentRestore;
    record.lockedTotal = Math.min(Number.MAX_SAFE_INTEGER,
      POTENTIAL_ATTR_KEYS.reduce((n, k) => n + locked.attr[k], locked.unspent));
  }
  state.attrPotentialArchive.records = state.attrPotentialArchive.records.filter(r => r.lockedTotal > 0);
  return restored;
}
function migrate(o) {
  const s = Object.assign(newSave(), safeKeys(o));
  const sourceAttr = safeKeys(o.attr);
  s.attr = Object.fromEntries(POTENTIAL_ATTR_KEYS.map(k => [k, safePotentialValue(sourceAttr[k])]));
  const attrWasClean = POTENTIAL_ATTR_KEYS.every(k => sourceAttr[k] === s.attr[k]) && Object.keys(sourceAttr).every(k => POTENTIAL_ATTR_KEYS.includes(k));
  if (s.fac && !FAC[s.fac]) s.fac = null;
  for (const id in s.sk) if (!SK[id]) delete s.sk[id];
  s.stage = clamp(s.stage | 0 || 1, 1, STAGES + 400);
  // am thanh: file luu cu chi co {on:false} mac dinh (chua tung chinh) -> dung cau hinh moi
  s.snd = Object.assign({ on: true, vol: 0.7, music: true, mvol: 0.4 }, o.snd && 'vol' in o.snd ? o.snd : {});
  s.lootF = Object.assign({ mode: 'custom', minRar: 2, minReqLvl: 1, groups: [], series: [], auto: true, equipment: true, materials: true, white: false, skipLowSets: false }, o.lootF || {});
  if (!['smart', 'custom'].includes(s.lootF.mode)) {
    const oldLoot = o.lootF || {};
    const hadCustomRules = (Number.isFinite(+oldLoot.minRar) && +oldLoot.minRar !== 1) || (Number.isFinite(+oldLoot.minReqLvl) && +oldLoot.minReqLvl !== 1)
      || oldLoot.white === true || oldLoot.equipment === false || (o.autoSell && !o.lootF)
      || (Array.isArray(oldLoot.groups) && oldLoot.groups.length > 0) || (Array.isArray(oldLoot.series) && oldLoot.series.length > 0);
    s.lootF.mode = hadCustomRules ? 'custom' : 'smart';
  }
  // minLvl truoc day la bac trang bi 1-10; khong the doi truc tiep thanh cap yeu cau.
  if (!Number.isFinite(+s.lootF.minReqLvl)) s.lootF.minReqLvl = 1;
  s.lootF.minReqLvl = clamp(Math.floor(+s.lootF.minReqLvl) || 1, 1, MAX_LEVEL);
  delete s.lootF.minLvl;
  s.lootF.skipLowSets = s.lootF.skipLowSets !== false;
  if (o.autoSell && !o.lootF) s.lootF.minRar = o.autoSell;      // tu ban cu -> muc do hiem toi thieu cua bo loc
  // do sinh truoc khi co ngu hanh trang bi: khong co thu tu tien/hau to -> giu moi dong luon hieu luc
  for (const it of s.inv.concat(Object.values(s.eq), (s.ground || []).map(g => g && g.it))) if (it && (it.mag || []).some(m => m.pre === undefined)) it.leg = true;
  // F9: sưu tập bộ đồ — migrate đọc o.setSeen, và backfill từ đồ bộ đang có (khi chưa kịp đánh dấu lúc nhặt)
  s.setSeen = safeKeys(s.setSeen);
  for (const it of s.inv.concat(Object.values(s.eq))) if (it && it.set && typeof it.n === 'string') s.setSeen[it.n.replace(/^\[[^\]]*\]\s*/, '')] = 1;
  if (!o.autoPtsOff) { s.autoPts = false; s.autoPtsOff = 1; }     // tu cong diem tiem nang / ky nang nay mac dinh TAT (ca file luu cu: tat mot lan, bat lai o the Khac)
  s.mats = { ht: Object.assign({}, (o.mats || {}).ht), ore: Object.assign({}, (o.mats || {}).ore), shard: Object.assign({}, (o.mats || {}).shard), misc: Object.assign({}, (o.mats || {}).misc) };
  s.rw = o.rw && typeof o.rw === 'object' ? o.rw : {};    // phan thuong: file cu chua co -> RW() tu dien mac dinh
  // QA-019: bao dam rw.stat LUON ton tai (rw.stat.reborn dung cho ngan sach diem tiem nang)
  s.rw.stat = Object.assign({ kills: 0, bosses: 0, goldBoss: 0, picked: 0, towerBest: 0, tower2Best: 0, reborn: 0, chests: 0, tokens: 0 }, safeKeys(s.rw.stat));
  s.rw.stat.reborn = clamp(Math.floor(+s.rw.stat.reborn) || 0, 0, REBORN_MAX);
  s.fieldMode = o.fieldMode === true;                     // bãi quái ngoài bản đồ: mac dinh tắt (file cu + file moi)
  // tu tim / uu tien boss / pham vi duoi / chiêu tu dùng / ngưỡng thuốc: file cu chua co -> mac dinh newSave
  if (!['near', 'medium', 'far'].includes(s.autoRange)) s.autoRange = 'medium';
  if (!Array.isArray(s.autoSkillSlots) || s.autoSkillSlots.length !== 4) s.autoSkillSlots = [true, true, true, true];
  s.hpPotionAt = clamp(Math.round(+s.hpPotionAt) || 50, 1, 100);
  s.mpPotionAt = clamp(Math.round(+s.mpPotionAt) || 30, 1, 100);
  s.townHpAt = clamp(Math.round(+s.townHpAt) || 20, 1, 100);
  // vi tri / thu tu o trong hanh trang + mo rong: file cu chua co -> mac dinh (sap xep "Moi nhặt", chua mo rong)
  s.invExpansions = clamp(Math.floor(+s.invExpansions) || 0, 0, 4);
  s.invOrder = Array.isArray(s.invOrder) ? s.invOrder : [];
  if (!['new', 'rar', 'lvl', 'slot', 'pow'].includes(s.invSort)) s.invSort = 'new';
  // Dong hanh: o trang bi (save cu chua co) — chi giu mon hop le (co base/mag, khong phai ngua d 10)
  s.rw.pet = s.rw.pet && typeof s.rw.pet === 'object' ? s.rw.pet : null;
  /* Dong hanh: chuan hoa o trang bi cua MOI con trong roster — save cu co the dung key petW/petA/petJ
     (3 o) doi sang bo 10 o giong nhan vat (weapon/armor/...); mon sai o (Ngua d10, item hong) bi loai. */
  s.rw.pets = s.rw.pets && typeof s.rw.pets === 'object' ? s.rw.pets : {};
  if (s.rw.pet && typeof s.rw.pet === 'object' && !s.rw.pets[s.rw.pet.tid]) s.rw.pets[s.rw.pet.tid] = s.rw.pet;   // save cu 1 pet -> roster (cung tham chieu)
  for (const tid of Object.keys(s.rw.pets)) {
    const p = s.rw.pets[tid];
    if (!p || typeof p !== 'object') { delete s.rw.pets[tid]; continue; }
    const eq0 = p.eq && typeof p.eq === 'object' ? p.eq : {}, fixed = {};
    for (const k of Object.keys(eq0)) {
      const it = eq0[k]; if (!it || !Array.isArray(it.base) || !Array.isArray(it.mag) || !(it.d >= 0 && it.d <= 9)) continue;
      let key = k;
      if (k === 'petW') key = 'weapon'; else if (k === 'petA') key = 'armor'; else if (k === 'petJ') { const ds = DETAIL_SLOT[it.d]; key = ds === 'ring' ? 'ring1' : ds; }
      if (!PET_SLOT_KEYS.includes(key)) continue;
      if (!fixed[key]) fixed[key] = it;              // 2 mon cung o (hiem): giu mon dau
    }
    p.eq = fixed;
  }
  if (s.rw.pet) s.rw.pet = s.rw.pets[s.rw.pet.tid] || s.rw.pet;   // rw.pet tro dung vao roster
  s.lvl = clamp(Math.floor(+s.lvl) || 1, 1, MAX_LEVEL); s.xp = Math.max(0, +s.xp || 0);
  s.gold = Number.isFinite(+s.gold) ? Math.max(0, +s.gold) : 0; s.skPts = Math.max(0, Math.floor(+s.skPts) || 0); s.attrPts = safePotentialValue(s.attrPts);
  /* F7: luu trữ điểm tiềm năng — gói gốc (attr + điểm chưa dùng + bonus đã nhận), archive theo lần chuyển sinh,
     khôi phục khi tải save tới ngưỡng (tối thiểu 3.000), và lưu lại phần vượt ngân sách thành archive. */
  const originalPotential = { attr: Object.assign({}, s.attr), unspent: s.attrPts,
    bonusEarned: Math.min(MAX_POTENTIAL_BONUS, safePotentialValue(o.attrBonusEarned)) };
  const bonusWasClean = Number.isSafeInteger(+o.attrBonusEarned) && +o.attrBonusEarned === originalPotential.bonusEarned;
  s.attrBonusEarned = originalPotential.bonusEarned;
  s.attrPotentialArchive = cleanPotentialArchive(o.attrPotentialArchive);
  let potentialChanged = o.attrPotentialV !== 1 || !attrWasClean || !bonusWasClean || !Number.isSafeInteger(+o.attrPts) || +o.attrPts !== s.attrPts;
  // Khôi phục archive tới ngưỡng 3.000 điểm, hoặc tới ngân sách cấp hiện tại nếu cao hơn.
  const potentialBudget = potentialPointLimit(s);
  if (restoreArchivedPotential(s, potentialBudget)) potentialChanged = true;
  const potentialUsed = potentialPointsUsed(s);
  if (potentialUsed > potentialBudget) {
    const activeUnspent = Math.min(s.attrPts, potentialBudget), attrLimit = potentialBudget - activeUnspent;
    const activeAttr = fitPotentialAttributes(s.attr, attrLimit), lockedAttr = {};
    for (const k of POTENTIAL_ATTR_KEYS) lockedAttr[k] = s.attr[k] - activeAttr[k];
    const lockedUnspent = s.attrPts - activeUnspent;
    const lockedTotal = Math.min(Number.MAX_SAFE_INTEGER, POTENTIAL_ATTR_KEYS.reduce((n, k) => n + lockedAttr[k], lockedUnspent));
    const records = s.attrPotentialArchive.records;
    records.push({ createdAt: Date.now(), sourceLevel: clamp(Math.floor(+o.lvl) || 1, 1, MAX_ENEMY_LEVEL),
      reborn: s.rw.stat.reborn, original: originalPotential,
      active: { attr: activeAttr, unspent: activeUnspent, bonusEarned: s.attrBonusEarned },
      locked: { attr: lockedAttr, unspent: lockedUnspent, bonusEarned: 0 }, lockedTotal, noticeShown: false });
    s.attrPotentialArchive.records = records.slice(-50);
    s.attr = activeAttr; s.attrPts = activeUnspent; potentialChanged = true;
  }
  s.attrPotentialV = 1;
  if (!s.attrPotentialArchive.records.length) delete s.attrPotentialArchive;
  s._attrPotentialChanged = potentialChanged;
  s.inv = (Array.isArray(s.inv) ? s.inv : []).filter(it => it && typeof it === 'object' && Array.isArray(it.base) && Array.isArray(it.mag)).slice(0, INV_MAX);
  const petEq = [].concat(...Object.values(s.rw.pets || {}).map(p => Object.values((p && p.eq) || {})));
  let maxUid = 0; for (const it of s.inv.concat(Object.values(s.eq || {}), Object.values(petEq))) if (it && it.uid > maxUid) maxUid = it.uid; s.uid = Math.max(+s.uid || 1, maxUid + 1);
  { const seen = new Set(); const dedupe = it => { if (seen.has(it.uid)) { it.uid = s.uid++; } seen.add(it.uid); }; s.inv.forEach(dedupe); petEq.forEach(dedupe); }   // uid trung (nhap ma sua tay): cap lai
  s.diff = [0, 1, 2].includes(+o.diff) ? +o.diff : 1; s.hints = o.hints && typeof o.hints === 'object' ? o.hints : {};
  if (s.fac && !s.sexSet) s.sex = FEMALE_FAC.includes(s.fac) ? 1 : 0;   // gioi tinh theo phai, tru khi nguoi choi da tu chon (startFaction / setAppearance dat sexSet)
  const wrongSex = k => s.eq[k] && !sexReqOkFor(s.eq[k], s.sex);
  for (const k of Object.keys(s.eq || {})) if (!s.eq[k] || typeof s.eq[k] !== 'object') delete s.eq[k]; else if (wrongSex(k)) { if (s.inv.length < INV_MAX) s.inv.push(s.eq[k]); delete s.eq[k]; }   // trang phuc sai gioi tinh dang mac: thao ve tui
  s.v = SAVE_V;
  return s;
}
/* Tom tat mot slot (cho man hinh chon nhan vat): null = trong */
export function slotInfo(i) {
  try {
    const t = localStorage.getItem(slotKey(i)); if (!t) return null;
    let u; try { u = unpack(t); } catch (e) { u = null; }
    if (!u || !u.ok) { const b = localStorage.getItem(slotKey(i) + '_bak'); try { u = b && unpack(b); } catch (e) { u = null; } }
    const o = u && u.state; if (!o || !o.fac) return null;
    return { fac: o.fac, lvl: o.lvl | 0 || 1, stage: o.stage | 0 || 1, last: o.last || 0, name: o.name || '' };
  } catch (e) { return null; }
}
/* Chon slot luc khoi dong: con tro hop le -> dung; chua co con tro -> neu dung 1 slot co nhan vat thi vao thang (file luu cu), nhieu slot thi hien man hinh chon */
export function pickSlot() {
  let p = null; try { p = localStorage.getItem(SLOT_PTR); } catch (e) { /* che do rieng tu */ }
  const used = [...Array(SLOT_N).keys()].filter(i => slotInfo(i));
  if (p === 'menu') return { slot: used[0] ?? 0, menu: used.length > 0 };
  const n = +p; if (p !== null && Number.isInteger(n) && n >= 0 && n < SLOT_N) return { slot: n, menu: false };
  if (used.length > 1) return { slot: used[0], menu: true };
  return { slot: used[0] ?? 0, menu: false };
}
/* Xoa han mot slot: chan save() truoc, xoa khoa va ban sao luu, roi tai lai trang (neu khong, su kien pagehide se ghi nhan vat tro lai) */
export function deleteSlot(i) {
  SAVE_LOCK = true;
  try { localStorage.removeItem(slotKey(i)); localStorage.removeItem(slotKey(i) + '_bak'); localStorage.setItem(SLOT_PTR, 'menu'); } catch (e) { /* bo qua */ }
  location.reload();
}
export function switchCharacter() { save(); SAVE_LOCK = true; try { localStorage.setItem(SLOT_PTR, 'menu'); } catch (e) { /* bo qua */ } location.reload(); }
export function load() {
  try {
    const t = localStorage.getItem(saveKey());
    if (t) {
      let u = unpack(t);
      if (!u.ok) {                                          // chu ky sai: dung ban sao luu hop le truoc do, neu khong thi cho chay tiep nhung danh dau
        const b = localStorage.getItem(saveKey() + '_bak'); let ub = null; try { ub = b && unpack(b); } catch (e) { /* hong */ }
        if (ub && ub.ok) u = ub; else u.state.tampered = 1;
        window.__tampered = true;
      }
      S = migrate(u.state);
      const potentialChanged = S._attrPotentialChanged; delete S._attrPotentialChanged;
      if (potentialChanged) save();                     // migrate doi thu -> luu lai luon (giong ban goc)
      return true;
    }
  } catch (e) { console.warn('Khong doc duoc file luu, tao moi', e); }
  S = newSave(); return false;
}
/* ---------- File luu de chuyen thiet bi (.jxsave) ----------
   Dinh dang: JSON { game: 'jxidle', v, exported, fac, lvl, data } voi data = chuoi pack() co chu ky (cung dinh dang luu trong may).
   Nap vao BAT KY slot nao: kiem tra chu ky + noi dung, ghi bang migrate(), giu ban sao luu slot cu. Cung nhan ma van ban cu (base64) va file tho. */
function saveFileText() {
  save();
  return JSON.stringify({ game: 'jxidle', v: SAVE_V, exported: Date.now(), fac: S.fac, lvl: S.lvl, data: pack(S) });
}
export function saveFileName() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `jxidle_${S.fac}_cap${S.lvl}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.jxsave`; }
export function downloadSaveFile() {
  if (!S.fac) return false;
  const blob = new Blob([saveFileText()], { type: 'application/json' }), a = document.createElement('a');
  S.bakAt = Date.now(); save();
  a.href = URL.createObjectURL(blob); a.download = saveFileName(); document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return true;
}
/* Doc noi dung file / ma -> trang thai hop le (nem loi neu hong, sai chu ky hoac khong phai file cua game) */
export function parseSaveText(txt) {
  txt = String(txt || '').trim().replace(/^\uFEFF/, '');
  if (!txt) throw new Error('File rỗng');
  let packed;
  if (txt[0] === '{') {
    const o = JSON.parse(txt);
    if (o && o.game === 'jxidle' && typeof o.data === 'string') packed = o.data;
    else if (o && typeof o.d === 'string' && typeof o.h === 'string') packed = txt;      // file tho (khoa luu trong may)
    else throw new Error('Không phải file lưu của game');
  } else packed = decodeURIComponent(escape(atob(txt)));                                  // ma van ban (Xuat ma)
  const u = unpack(packed);
  if (!u.ok) throw new Error('File đã bị chỉnh sửa (sai chữ ký)');
  const o = u.state;
  if (!o || typeof o !== 'object' || !o.fac || !FAC[o.fac] || !('lvl' in o)) throw new Error('File không có nhân vật hợp lệ');
  return o;
}
/* Ghi nhan vat vao slot i (giu ban sao luu cu), dat con tro, tai lai trang */
export function writeSlot(i, state) {
  const s = migrate(state); delete s._attrPotentialChanged; s.last = Date.now();
  SAVE_LOCK = true;
  try {
    const k = slotKey(i), prev = localStorage.getItem(k);
    if (prev) localStorage.setItem(k + '_bak', prev);
    localStorage.setItem(k, pack(s));
    localStorage.setItem(SLOT_PTR, String(i));
  } catch (e) { SAVE_LOCK = false; throw new Error('Không ghi được (bộ nhớ trình duyệt đầy hoặc bị chặn)'); }
  return s;
}
export function exportSave() { save(); return btoa(unescape(encodeURIComponent(pack(S)))); }
function importSave(txt) {
  const u = unpack(decodeURIComponent(escape(atob(txt.trim()))));
  if (!u.ok) throw new Error('Mã đã bị chỉnh sửa');
  const o = u.state;
  if (!o || typeof o !== 'object' || !('lvl' in o)) throw new Error('Mã không hợp lệ');
  S = migrate(o); delete S._attrPotentialChanged; save(); R.dirty = true;
}

/* Tien trinh offline: uoc tinh theo toc do ha quai do duoc khi dang choi (S.kps), toi da 8 gio */
/* Treo may: 2 gio dau tinh day du, tu gio thu 3 chi con 40%, tran 8 gio / lan va 12 gio / 24 gio thuc (chong chinh dong ho); luon thap hon choi that.
   Dong ho lui (S.last o tuong lai) khong cho tien trinh. */
const OFFLINE_FULL = 2 * 3600, OFFLINE_TAIL = 0.4, OFFLINE_RATE = 0.75, OFFLINE_DAY_MAX = 12 * 3600;
export function offlineGains() {
  const now = Date.now(), raw = (now - S.last) / 1000;
  if (!(raw >= 60) || !S.fac) return null;
  const d = S.offDay = (S.offDay && now - S.offDay.t0 < 86400000 && S.offDay.t0 <= now) ? S.offDay : { t0: now, secs: 0 };
  const capped = Math.min(OFFLINE_MAX, raw, Math.max(0, OFFLINE_DAY_MAX - d.secs));
  if (capped < 60) return null;
  d.secs += capped;
  const secs = capped, eff = Math.min(secs, OFFLINE_FULL) + OFFLINE_TAIL * Math.max(0, secs - OFFLINE_FULL);
  const kills = Math.floor(eff * clamp(S.kps || 0.1, 0.02, 3) * 0.8 * OFFLINE_RATE);
  if (!kills) return null;
  const L = stageLevel(S.stage), lv0 = S.lvl;
  const xp = expFor(L) * kills * (S.lvl - L > 10 ? 0.2 : S.lvl - L > 5 ? 0.6 : 1);
  const gold = moneyDrop({ L, cls: 'normal' }) * kills;
  gainXp(xp); S.gold += gold;
  let got = 0, sold = 0;
  const nDrops = Math.min(30, Math.floor(kills * 0.08));
  for (let i = 0; i < nDrops; i++) {
    const it = rollDrops({ L, cls: Math.random() < 0.15 ? 'elite' : 'normal', bonusDrop: 1 })[0];
    if (!it) continue;
    if (addItem(it, true)) got++; else sold++;
  }
  autoEquipAll(); petAutoEquip(); sweepJunk(); autoBuyWeapon(); autoForge();
  const chests = offlineChests(secs);                       // rương tu luyen theo moc 1 / 4 / 8 gio (rewards.js)
  return { secs, kills, xp, gold, lv0, lv1: S.lvl, got, sold, chests };
}

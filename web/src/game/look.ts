// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { clamp } from './core';
import { CX, HERO_SCALE, animLen, img } from './render';
import { baseRow } from './loot';
import { R, recalc } from './combat';
import { S } from './save';
import { reqOk } from './stats';

/* ======================= NHAN VAT GHEP BO PHAN KIEU JX1 =======================
   Port tu js/jxparts.js ban vinarpg. Hinh tu client VLTK (spr\npcres\man|woman)
   -> img/jx/{m,f}/*.webp + jdata/jxlook.json (nap luoi, khong chan khoi dong).
   Nhu JX1: nhan vat ghep tu 11 bo phan (dau, toc, vai, than, 2 tay, 2 vu khi,
   ngu a truoc/giua/sau); dong chon theo trang bi dang mac qua bang res
   (ArmorRes/HelmRes/MeleeRes/RangeRes/HorseRes), tu the theo bang assoc,
   thu tu ve theo bang sort. Thieu hinh -> ve hinh mon phai cu (fallback). */
'use strict';
let JXL = null, jxLoading = false;
export const jxReady = () => !!JXL;
/* Nap luoi jxlook (~0,6 MB, goi assets) sau khi game da chay — nhan vat dung hinh cu cho toi khi xong */
export function jxLoad() {
  if (JXL || jxLoading) return;
  jxLoading = true;
  fetch('jdata/jxlook.json').then(r => r.ok ? r.json() : null).then(d => {
    if (!d || !d.sheets) return;
    JXL = d;
    if (R && S && S.fac) { R.jx = jxSetup(); if (R.jx) jxPreload(); }
  }).catch(() => { /* thieu du lieu: giu hinh cu */ }).finally(() => { jxLoading = false; });
}
const JX_PART_IDX = { '头部': 0, '发型': 1, '肩膀': 4, '躯体': 5, '左手': 6, '右手': 7, '左手武器': 8, '右手武器': 9, '马前': 12, '马中': 13, '马后': 14 };
const JX_IDX_PART = Object.fromEntries(Object.entries(JX_PART_IDX).map(([k, v]) => [v, k]));
const JX_GROUP = { '头部': 'helm', '发型': 'helm', '肩膀': 'armor', '躯体': 'armor', '左手': 'armor', '右手': 'armor', '左手武器': 'weapon', '右手武器': 'weapon', '马前': 'horse', '马中': 'horse', '马后': 'horse' };
/* 'm:ten' = hinh dung chung cua nam (vd ngua cua nhan vat nu) */
const jxSheetKey = (sx, nm) => (nm.startsWith('m:') ? 'm/' + nm.slice(2) : sx + '/' + nm);
const jxOn = () => !!JXL && !!S;
/* 11 Than Ma chua co tao hinh cuoi rieng: p=54 la dong sprite cuoi cua Chieu Da Ngoc Su Tu. */
const JX_THANMA_HORSE_FALLBACK = new Set(['pvan', 'btieu', 'xlc', 'duhuy', 'tdia', 'dvu', 'squang', 'pvu', 'hhlc', 'bhv', 'pvtm']);
const JX_THANMA_HORSE_FALLBACK_P = 54;
/* Dong (index du lieu, tinh tu 0) cua mot trang bi trong bang bo phan */
function jxItemP(it) {
  if (!it) return -1;
  if (Number.isInteger(it.p)) return it.p;
  const b = baseRow(it.d, it.k, it.lvl || 1);   // do bo / Bach Kim: dung hinh mon thuong cung loai, cap gan nhat
  return b && Number.isInteger(b.p) ? b.p : -1;
}
function jxRow(g, it) {
  const m = JXL.res[g]; if (!m) return -1;
  let p = jxItemP(it);
  if (g === 'horse' && it && JX_THANMA_HORSE_FALLBACK.has(it.thanma)) p = JX_THANMA_HORSE_FALLBACK_P;
  const id = it && reqOk(it) && p >= 0 ? p + 2 : 1;
  const v = m[id] ?? m[1]; return v == null ? -1 : v - 2;
}
/* Tinh lai khi doi do (recalc) — R.jx la bo hinh dang mac hien tai */
export function jxSetup(forceUnmounted = false) {
  if (!JXL || !S || !S.fac) return null;
  const sx = S.sex ? 'f' : 'm', eq = S.eq, w = eq.weapon;
  const rows = { helm: jxRow('helm', eq.helm), armor: jxRow('armor', eq.armor), weapon: jxRow(w && w.d === 1 ? 'range' : 'melee', w), horse: eq.horse && !forceUnmounted && S.ride !== false ? jxRow('horse', eq.horse) : -1 };
  if (rows.weapon < 0) rows.weapon = 0;
  const wn = (JXL.wnames[sx] || [])[rows.weapon] || '空手';
  const asc = JXL.assoc[sx][wn] || JXL.assoc[sx]['空手'];
  const ride = rows.horse >= 0 && asc && asc[1] ? 1 : 0;
  return { sx, rows, asc: asc ? asc[ride] || asc[0] : {}, ride, key: JSON.stringify([sx, rows, ride]) };
}
function jxOrder(sx, act, dir16, frame) {
  const S2 = JXL.sort[sx], sec = S2[act] || {}, D = S2.DEFAULT;
  for (const k in sec) if (k[0] === 'L' && sec[k][0] === frame) return sec[k].slice(1);
  const v = sec['Dir' + (dir16 + 1)] || D['Dir' + (dir16 + 1)] || D.Dir1; return v.slice(1);
}
const JX_MS = { st: 120, run: 85 };
/* Ve nhan vat; tra ve chieu cao (nhu drawAnim) hoac false neu chua du hinh */
export function drawJxHero(act, dir, t, x, y, sc, alpha, oldKey, horseT = t, horseDir = dir) {
  const J = R.jx; if (!J || !JXL) return false;
  const useMg = act === 'at' && R.P && R.P.main && !R.P.main.useAR && J.asc.mg;   // chieu noi cong: tu the thi trien
  const jact = J.asc[useMg ? 'mg' : act] || J.asc.st; if (!jact) return false;
  const tabs = JXL.tabs[J.sx], list = [];
  let ref = null;
  for (const pi of jxOrder(J.sx, jact, (dir % 8) * 2, 0)) {
    const part = JX_IDX_PART[pi]; if (!part) continue;
    const row = J.rows[JX_GROUP[part]]; if (row < 0) continue;
    const nm = ((tabs[part] || {})[row] || {})[jact]; if (!nm) continue;
    const sk = jxSheetKey(J.sx, nm), m = JXL.sheets[sk]; if (!m) continue;
    const im = img('img/jx/' + sk + '.webp');
    if (!im || !im.complete || !im.naturalWidth) { if (part === '躯体') return false; continue; }   // than chua tai: dung hinh cu
    list.push([im, m, part]); if (part === '躯体' || !ref) ref = m;
  }
  if (!ref) return false;
  // khung hinh: lap (dung / chay) hoac chay 1 lan theo thoi luong hanh dong cu (danh / trung don / nga)
  const n = ref[4]; let f;
  if (act === 'st' || act === 'run') f = Math.floor(t * 1000 / (JX_MS[act] || 110)) % n;
  else { const dur = animLen(oldKey, act) || n * 0.09; f = Math.min(n - 1, Math.floor(clamp(t / Math.max(0.1, dur), 0, 0.999) * n)); }
  // thu tu ve dac biet theo khung (Line) dung khung goc
  const ord = jxOrder(J.sx, jact, (dir % 8) * 2, f * (ref[6] || 1));
  list.sort((a, b) => ord.indexOf(JX_PART_IDX[a[2]]) - ord.indexOf(JX_PART_IDX[b[2]]));
  const fx = JXL.foot[0], fy = JXL.foot[1]; let top = 0;
  CX.globalAlpha = alpha == null ? 1 : alpha;
  for (const [im, m, part] of list) {
    const [w, h, x0, y0, nn, dirs] = m;
    const fi = Math.min(nn - 1, Math.floor(f * nn / n));
    const d = dirs >= 8 ? dir % 8 : Math.floor((dir % 8) * dirs / 8);
    CX.drawImage(im, fi * w, d * h, w, h, x + (x0 - fx) * sc, y + (y0 - fy) * sc, w * sc, h * sc);
    top = Math.max(top, (fy - y0) * sc);
  }
  CX.globalAlpha = 1;
  return top;
}
/* Tai truoc hinh cua bo do dang mac de doi tu the khong bi nhay ve hinh cu */
export function jxPreload(J = R.jx) {
  if (!J || !JXL) return;
  for (const jact of new Set(Object.values(J.asc).filter(Boolean))) for (const part in JX_PART_IDX) {
    const row = J.rows[JX_GROUP[part]]; if (row < 0) continue;
    const nm = (((JXL.tabs[J.sx] || {})[part] || {})[row] || {})[jact]; if (nm && JXL.sheets[jxSheetKey(J.sx, nm)]) img('img/jx/' + jxSheetKey(J.sx, nm) + '.webp');
  }
}
/* Goi trong recalc: cap nhat R.jx theo trang bi/ngua dang mac */
export function jxSync() {
  if (!JXL) { jxLoad(); return; }
  const key = (() => { try { return JSON.stringify([S.sex, S.eq && S.eq.weapon && S.eq.weapon.p, S.eq && S.eq.armor && S.eq.armor.p, S.eq && S.eq.helm && S.eq.helm.p, S.eq && S.eq.horse && S.eq.horse.p, S.ride !== false]); } catch (e) { return ''; } })();
  if (R._jxKey === key && R.jx) return;
  R._jxKey = key;
  R.jx = jxSetup();
  if (R.jx) jxPreload();
}

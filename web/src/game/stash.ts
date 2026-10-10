// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { uiSfx } from './audio';
import { H, R, stageLevel } from './combat';
import { $, J, INV_EXPANSION_MAX, INV_EXPANSION_STEP, INV_MAX, MAX_LEVEL, SERIES_COL, STAGES, attrName, clamp, esc, fmt } from './core';
import { invExpansionCount, invMax, invUsed } from './invs';
import { REBORN_MAX } from './rewards';
import { dropFile, moneyScale } from './loot';
import { potStock } from './shop';
import { matAdd, matHave, mats, oreParse, oreRows } from './recipes';
import { img } from './render';
import { S, pack, save, unpack } from './save';
import { reqOk } from './stats';
import { clanPerk } from './depth';
import { closeModal, donKhoModal, invDirty, itemCell, itemHTML, modal, refresh, sellChoiceModal, toast } from './ui';
import { setInvDirty } from './ui';

/* ======================= KHO DUNG CHUNG GIUA CAC SLOT =======================
   Mot kho cho ca 3 nhan vat (khoa localStorage 'jxidle_stash', tach rieng khoi file luu nhan vat): do trong hanh trang (khong phai do dang mac),
   ngan luong va nguyen lieu ren (Huyen Tinh, khoang, manh, Thuy Tinh Trang, Than Bi). Ky ten + ban sao luu nhu file luu nhan vat.
   Chong nhan doi: moi thao tac di chuyen mot lan, ghi ben "nguon" truoc roi moi ghi ben "dich"; ghi dich loi thi hoan lai nguon.
   Do vao kho giu nguyen trang thai (cuong hoa, Tim, Bach Kim, bo...); khi lay ra cap lai uid cua nhan vat hien tai. */
'use strict';
const STASH_KEY = 'jxidle_stash', STASH_V = 1;
export const STASH_MAX = 60;
export const stashMax = () => STASH_MAX + 10 * clanPerk('stash');   // gia toc: +10 o moi moc danh vong
const stashNew = () => ({ v: STASH_V, id: Math.random().toString(36).slice(2, 10), rev: 0, gold: 0, items: [], potions: { life: {}, mana: {} }, mats: { ht: {}, ore: {}, shard: {}, misc: {} } });
function stashClean(o) {                                  // lam sach noi dung doc tu may (mat khau / file co the hong)
  const st = stashNew(); if (!o || typeof o !== 'object') return st;
  st.id = typeof o.id === 'string' ? o.id : st.id; st.rev = Math.max(0, +o.rev || 0);
  st.gold = Number.isFinite(+o.gold) ? Math.max(0, Math.floor(+o.gold)) : 0;
  st.items = (Array.isArray(o.items) ? o.items : []).filter(it => it && typeof it === 'object' && Array.isArray(it.base) && Array.isArray(it.mag)).slice(0, STASH_MAX + 20);
  const pots = o.potions && typeof o.potions === 'object' ? o.potions : {};
  for (const k of ['life', 'mana']) if (pots[k] && typeof pots[k] === 'object') for (const t in pots[k]) { const n = Math.floor(+pots[k][t]); if (n > 0) st.potions[k][+t] = n; }
  for (const g of ['ht', 'ore', 'shard', 'misc']) for (const k in ((o.mats || {})[g] || {})) { const n = Math.floor(+o.mats[g][k]); if (n > 0) st.mats[g][k] = n; }
  return st;
}
/* { st, err } : err = 'tampered' neu chu ky sai va khong co ban sao luu hop le */
export function stashRead() {
  let raw = null; try { raw = localStorage.getItem(STASH_KEY); } catch (e) { return { st: stashNew(), err: 'storage' }; }
  if (!raw) return { st: stashNew() };
  const tryUnpack = t => { try { const u = unpack(t); return u.ok ? stashClean(u.state) : null; } catch (e) { return null; } };
  const st = tryUnpack(raw); if (st) return { st };
  let bak = null; try { bak = localStorage.getItem(STASH_KEY + '_bak'); } catch (e) { /* bo qua */ }
  const b = bak && tryUnpack(bak); if (b) return { st: b, restored: true };
  return { st: stashNew(), err: 'tampered' };
}
function stashWrite(st) {
  st.rev++;
  const prev = localStorage.getItem(STASH_KEY);
  if (prev) { try { if (unpack(prev).ok) localStorage.setItem(STASH_KEY + '_bak', prev); } catch (e) { /* bo qua ban hong */ } }
  localStorage.setItem(STASH_KEY, pack(st));
}
/* Chay mot thao tac tren kho: fn(st) tra ve { ok, msg }; ghi kho neu ok. Loi doc / ghi -> thong bao, khong doi gi */
export function stashTx(fn) {
  const { st, err } = stashRead();
  if (err === 'tampered') return { ok: false, msg: 'Kho đã bị chỉnh sửa ngoài game (sai chữ ký), không dùng được' };
  if (err) return { ok: false, msg: 'Không đọc được bộ nhớ trình duyệt' };
  let r; try { r = fn(st); } catch (e) { return { ok: false, msg: e.message || 'Lỗi kho' }; }
  if (!r || !r.ok) return r || { ok: false, msg: '' };
  const fail = () => { if (r.undo) r.undo(); save(); return { ok: false, msg: 'Không ghi được kho (bộ nhớ đầy hoặc bị chặn)' }; };
  if (r.from === 'char') { save(); try { stashWrite(st); } catch (e) { return fail(); } }          // gui vao kho: luu nhan vat (da mat mon) truoc, roi moi ghi kho
  else { try { stashWrite(st); } catch (e) { r.undo && r.undo(); return { ok: false, msg: 'Không ghi được kho (bộ nhớ đầy hoặc bị chặn)' }; } save(); }   // lay ra: ghi kho (da mat mon) truoc, roi moi luu nhan vat
  return r;
}
const stashCount = () => stashRead().st.items.length;
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- do ---------- */
export function stashDeposit(it) {
  if (!S.inv.includes(it)) return { ok: false, msg: 'Chỉ gửi được món trong hành trang (không phải đồ đang mặc)' };
  return stashTx(st => {
    if (st.items.length >= stashMax()) return { ok: false, msg: `Kho đầy (${stashMax()} món)` };
    const copy = clone(it), i = S.inv.indexOf(it);
    S.inv.splice(i, 1); st.items.push(copy); setInvDirty(true);                     // nguon (hanh trang) truoc; ghi kho loi -> undo
    return { ok: true, from: 'char', msg: `Gửi vào kho: ${it.n}`, undo: () => { S.inv.splice(i, 0, it); setInvDirty(true); } };
  });
}
/* ---------- thuoc ---------- */
const stashPotionSlots = st => Object.values(st.potions || {}).reduce((n, tiers) => n + Object.values(tiers || {}).filter(v => v > 0).length, 0);
const stashUsed = st => st.items.length + stashPotionSlots(st);
export function stashDepositPotion(kind, tier) {
  const stock = potStock(kind), count = stock[tier] || 0;
  if (!count) return { ok: false, msg: 'Bình thuốc không còn trong hành trang' };
  return stashTx(st => {
    st.potions = st.potions || { life: {}, mana: {} };
    if (!(st.potions[kind][tier] > 0) && stashUsed(st) >= stashMax()) return { ok: false, msg: `Kho đầy (${stashMax()} ô)` };
    delete stock[tier]; st.potions[kind][tier] = (st.potions[kind][tier] || 0) + count; setInvDirty(true);   // nguon (hanh trang) truoc; ghi kho loi -> undo
    return { ok: true, from: 'char', msg: `Gửi ${count} ${J.potions.find(p => p.kind === kind && p.tier === +tier)?.n || 'bình thuốc'} vào kho`, undo: () => { delete st.potions[kind][tier]; stock[tier] = count; setInvDirty(true); } };
  });
}
export function stashWithdrawPotion(kind, tier) {
  const { st } = stashRead(), count = (st.potions[kind] || {})[tier] || 0;
  if (!count) return { ok: false, msg: 'Bình thuốc không còn trong kho' };
  if (!(potStock(kind)[tier] > 0) && invUsed() >= invMax()) return { ok: false, msg: 'Hành trang đầy' };
  return stashTx(st => {
    const n = (st.potions[kind] || {})[tier] || 0; if (!n) return { ok: false, msg: 'Bình thuốc không còn trong kho' };
    delete st.potions[kind][tier]; const stock = potStock(kind); stock[tier] = (stock[tier] || 0) + n; setInvDirty(true);
    return { ok: true, msg: `Lấy ${n} bình thuốc ra khỏi kho`, undo: () => { delete stock[tier]; st.potions[kind][tier] = n; setInvDirty(true); } };
  });
}
function stashWithdraw(idx) {
  if (S.inv.length >= INV_MAX) return { ok: false, msg: 'Hành trang đầy' };
  return stashTx(st => {
    const it = st.items[idx]; if (!it) return { ok: false, msg: 'Món không còn trong kho' };
    st.items.splice(idx, 1); it.uid = S.uid++; S.inv.unshift(it); setInvDirty(true); R.dirty = true;
    return { ok: true, msg: `Lấy ra: ${it.n}`, undo: () => { S.inv.shift(); } };
  });
}
/* ---------- vang ---------- */
function stashGold(dir, n) {
  n = Math.floor(+n); if (!(n > 0)) return { ok: false, msg: 'Nhập số ngân lượng' };
  return stashTx(st => {
    if (dir === 'in') { if (n > S.gold) return { ok: false, msg: 'Không đủ ngân lượng' }; S.gold -= n; st.gold += n; return { ok: true, from: 'char', msg: `Gửi ${fmt(n)} lượng`, undo: () => { S.gold += n; } }; }
    if (n > st.gold) return { ok: false, msg: 'Kho không đủ ngân lượng' }; st.gold -= n; S.gold += n; return { ok: true, msg: `Rút ${fmt(n)} lượng`, undo: () => { S.gold -= n; } };
  });
}
/* ---------- nguyen lieu ---------- */
function stashMat(dir, group, key, n) {
  return stashTx(st => {
    const have = dir === 'in' ? matHave(group, key) : (st.mats[group][key] || 0); n = n == null ? have : Math.min(have, Math.floor(+n));
    if (!(n > 0)) return { ok: false, msg: 'Không có gì để chuyển' };
    if (dir === 'in') { matAdd(group, key, -n); st.mats[group][key] = (st.mats[group][key] || 0) + n; }
    else { st.mats[group][key] -= n; if (st.mats[group][key] <= 0) delete st.mats[group][key]; matAdd(group, key, n); }
    return { ok: true, from: dir === 'in' ? 'char' : 'stash', msg: `${dir === 'in' ? 'Gửi' : 'Rút'} ${n} ${matName(group, key)}`, undo: () => matAdd(group, key, dir === 'in' ? n : -n) };
  });
}
function matName(group, key) {
  if (group === 'ht') return `Huyền Tinh cấp ${key}`;
  if (group === 'shard') return `Mảnh ${key}`;
  if (group === 'misc') return key === 'wc' ? 'Thủy Tinh Trắng' : key === 'mys' ? 'Thần Bí Khoáng Thạch' : key;
  const o = oreParse(key), r = oreRows(o.a)[0]; return `Khoáng dòng ${o.place + 1} · ${r ? r.n : attrName(o.a)} · cấp ${o.lvl}`;
}

/* ---------- mo rong hanh trang ---------- */
/* Giá mở rộng bám theo lượng vàng kỳ vọng từ quái thường, giữ nguyên sức mua khi lên cấp/chuyển sinh. */
const STORAGE_KILL_EQUIV = 3000;
const STORAGE_REBIRTH_EQUIV = 999;   // giu suc mua gia mo rong nhu muc chuyen sinh cu
function storageProgressLevel() {
  const rebirths = clamp(Math.floor(+(S && S.rw && S.rw.stat && S.rw.stat.reborn) || 0), 0, REBORN_MAX);
  const rebirthLevel = rebirths * STORAGE_REBIRTH_EQUIV;
  const rawStage = +(S && S.maxStage), peakStage = Number.isFinite(rawStage) ? Math.floor(rawStage) : 1;
  const peakStageLevel = stageLevel(clamp(peakStage, 1, STAGES + 400));
  return clamp(Math.max((S && S.lvl) | 0, peakStageLevel, rebirthLevel, 1), 1, MAX_LEVEL);
}
function storageBasePrice() {
  const L = storageProgressLevel();
  return Math.max(1, Math.round(STORAGE_KILL_EQUIV * 3 * (moneyScale(L, dropFile(L)) / 10 * L)));
}
const inventoryExpansionCost = () => Math.round(storageBasePrice() * (invExpansionCount() + 1));
function buyInventoryExpansion() {
  const bought = invExpansionCount();
  if (bought >= INV_EXPANSION_MAX) return { ok: false, msg: 'Hành trang đã mở rộng tối đa' };
  const cost = inventoryExpansionCost();
  if (S.gold < cost) return { ok: false, msg: `Cần ${fmt(cost)} lượng` };
  S.gold -= cost; S.invExpansions = bought + 1; setInvDirty(true); save();
  return { ok: true, cost, msg: `Đã mở rộng hành trang lên ${invMax()} ô` };
}
export function inventoryUpgradeModal(returnToStash = false) {
  const current = invMax(), bought = invExpansionCount(), maxBuys = INV_EXPANSION_MAX, step = INV_EXPANSION_STEP;
  const cost = inventoryExpansionCost(), max = INV_MAX + INV_EXPANSION_STEP * INV_EXPANSION_MAX;
  const remaining = Math.max(0, maxBuys - bought);
  modal(`<h3>Mở rộng hành trang</h3><p class="desc">Tăng số ô chứa đồ cho nhân vật này. Hiện có <b>${current}/${max} ô</b>${remaining ? ` · lần này thêm ${step} ô` : ' · đã đạt tối đa'}.</p>
    ${remaining ? `<p class="desc">Giá: <b>${fmt(cost)} lượng</b> · Bạn có <b>${fmt(S.gold)} lượng</b>.</p>` : ''}
    <div class="btnrow">${remaining ? `<button class="btn" id="bBuyStorage" ${S.gold < cost ? 'disabled' : ''}>Mua thêm ${step} ô · ${fmt(cost)} lượng</button>` : ''}<button class="btn" id="bCancelStorage">${returnToStash ? 'Quay lại kho' : 'Đóng'}</button></div>`, () => {
    const buy = $('#bBuyStorage'); if (buy) buy.onclick = () => {
      const r = buyInventoryExpansion();
      if (!r.ok) { toast(r.msg); inventoryUpgradeModal(returnToStash); return; }
      uiSfx('use'); toast(r.msg);
      if (returnToStash) stashModal(); else { closeModal(); refresh(); }
    };
    $('#bCancelStorage').onclick = () => returnToStash ? stashModal() : closeModal;
  });
}

/* ---------- file kho (.jxkho): chuyen kho sang thiet bi khac ---------- */
function stashFileText() { const { st } = stashRead(); return JSON.stringify({ game: 'jxidle-stash', v: STASH_V, exported: Date.now(), data: pack(st) }); }
function parseStashText(txt) {
  txt = String(txt || '').trim().replace(/^﻿/, ''); if (!txt) throw new Error('File rỗng');
  const w = JSON.parse(txt);
  if (!w || w.game !== 'jxidle-stash' || typeof w.data !== 'string') throw new Error('Không phải file kho của game');
  const u = unpack(w.data); if (!u.ok) throw new Error('File đã bị chỉnh sửa (sai chữ ký)');
  return stashClean(u.state);
}
function stashImport(st) {                               // thay the kho hien tai bang kho trong file
  const cur = stashRead(); const n = stashClean(st); n.rev = Math.max(cur.st.rev, n.rev);
  try { stashWrite(n); } catch (e) { return { ok: false, msg: 'Không ghi được kho' }; }
  return { ok: true, msg: 'Đã nạp kho từ file' };
}

/* ---------- giao dien ---------- */
let stashTab = 'item';
function stashCell(it, i) {
  return `<button class="it r${it.r}${reqOk(it) ? '' : ' bad'}" data-si="${i}" title="${esc(it.n)}">${it.ic ? `<img src="${esc(it.ic)}" alt="">` : ''}<i>${it.lvl}</i>${it.s >= 0 ? `<b class="s5" style="background:${SERIES_COL[it.s]}"></b>` : ''}${it.enh ? `<em>+${it.enh}</em>` : ''}</button>`;
}
export function stashDone(r, reopen) { toast(r.msg || (r.ok ? 'Xong' : 'Không thực hiện được')); if (r.ok) uiSfx('use'); if (reopen !== false) stashModal(); refresh(); }
export function stashModal(tab?) {
  if (tab) stashTab = tab;
  const { st, err } = stashRead();
  const tabs = [['item', 'Đồ'], ['mat', 'Nguyên liệu'], ['gold', 'Ngân lượng'], ['file', 'File kho']];
  let body = '';
  if (err) body = `<p class="reqbad">${err === 'tampered' ? 'Kho đã bị chỉnh sửa ngoài game (sai chữ ký) và không có bản sao lưu hợp lệ. Có thể nạp lại từ file kho.' : 'Không đọc được bộ nhớ trình duyệt.'}</p>`;
  if (stashTab === 'item') {
    const potionInv = J.potions.filter(p => (potStock(p.kind)[p.tier] || 0) > 0).map(p => `<button type="button" class="it potion-inv-cell" data-potion-kind="${p.kind}" data-potion-tier="${p.tier}" title="${esc(p.n)} · ${potStock(p.kind)[p.tier]} bình"><img src="${esc(p.ic || '')}" alt="" draggable="false"><i>${potStock(p.kind)[p.tier]}</i></button>`).join('');
    const potionStash = J.potions.filter(p => (st.potions?.[p.kind]?.[p.tier] || 0) > 0).map(p => `<button type="button" class="it potion-inv-cell" data-stash-potion-kind="${p.kind}" data-stash-potion-tier="${p.tier}" title="${esc(p.n)} · ${st.potions[p.kind][p.tier]} bình"><img src="${esc(p.ic || '')}" alt="" draggable="false"><i>${st.potions[p.kind][p.tier]}</i></button>`).join('');
    body += `<p class="desc">Bấm món trong <b>hành trang</b> để gửi vào kho. Bấm món trong <b>kho</b> để xem và lấy ra. Bình thuốc gửi / lấy theo chồng. Kho dùng chung cho cả 3 slot (${stashUsed(st)}/${stashMax()} ô).</p>
      <div class="btnrow"><button class="btn sm" id="bOpenInvStorage" ${invExpansionCount() >= INV_EXPANSION_MAX ? 'disabled' : ''}>${invExpansionCount() >= INV_EXPANSION_MAX ? 'Túi đã tối đa' : 'Mở rộng túi'}</button><button class="btn sm" id="stDon">Bán theo lọc</button></div>
      <h3>Hành trang <small>${invUsed()}/${invMax()}</small></h3><div class="invgrid" id="stInv">${potionInv}${S.inv.map(itemCell).join('') || '<small class="dim">Trống</small>'}</div>
      <h3>Kho chung <small>${stashUsed(st)}/${stashMax()}</small></h3><div class="invgrid" id="stBox">${potionStash}${st.items.map(stashCell).join('') || '<small class="dim">Kho trống</small>'}</div>`;
  } else if (stashTab === 'mat') {
    const rows = []; for (const g of ['ht', 'ore', 'shard', 'misc']) for (const k of new Set([...Object.keys(mats()[g]), ...Object.keys(st.mats[g])])) rows.push([g, k]);
    body += `<p class="desc">Nguyên liệu rèn đang có / trong kho.</p>` + (rows.map(([g, k]) => `<div class="qrow"><span>${esc(matName(g, k))}<small>có ${matHave(g, k)} · kho ${st.mats[g][k] || 0}</small></span><span></span><span class="pm"><button class="btn sm" data-mi="${g}|${k}" ${matHave(g, k) ? '' : 'disabled'}>Gửi hết</button><button class="btn sm" data-mo="${g}|${k}" ${st.mats[g][k] ? '' : 'disabled'}>Rút hết</button></span></div>`).join('') || '<small class="dim">Chưa có nguyên liệu</small>');
  } else if (stashTab === 'gold') {
    body += `<p class="desc">Ngân lượng: bạn <b>${fmt(S.gold)}</b> · kho <b>${fmt(st.gold)}</b>.</p><div class="row"><input type="number" id="stGold" min="1" placeholder="Số lượng"></div>
      <div class="btnrow"><button class="btn" id="stIn">Gửi vào kho</button><button class="btn" id="stOut">Rút ra</button><button class="btn" id="stInAll">Gửi hết</button><button class="btn" id="stOutAll">Rút hết</button></div>`;
  } else {
    body += `<p class="desc">Chuyển kho sang thiết bị khác: tải file kho (.jxkho) ở đây, nạp ở thiết bị kia. Nạp file sẽ <b>thay thế</b> kho hiện tại. File có chữ ký, sửa tay sẽ bị từ chối.</p>
      <div class="btnrow"><button class="btn" id="stDl">Tải file kho</button><button class="btn red" id="stUp">Nạp file kho</button></div>`;
  }
  modal(`<h3>Kho chung <small>${fmt(st.gold)} lượng · ${stashUsed(st)} ô</small></h3><div class="dtabs" id="stTabs">${tabs.map(([k, n]) => `<button data-st="${k}" class="${k === stashTab ? 'on' : ''}">${n}</button>`).join('')}</div>${body}`, () => {
    const q = s => document.querySelectorAll('#mBody ' + s);
    q('#stTabs [data-st]').forEach(b => b.onclick = () => stashModal(b.dataset.st));
    const openInvStorage = $('#bOpenInvStorage'); if (openInvStorage) openInvStorage.onclick = () => inventoryUpgradeModal(true);
    const stDon = $('#stDon'); if (stDon) stDon.onclick = () => sellChoiceModal(() => stashModal(), 'stash');
    q('#stInv .it').forEach(b => b.onclick = () => {
      if (b.dataset.potionTier !== undefined) { const r = stashDepositPotion(b.dataset.potionKind, +b.dataset.potionTier); if (r.ok) stashDone(r); else toast(r.msg); return; }
      const it = S.inv.find(i => i.uid === +b.dataset.uid); if (it) stashDone(stashDeposit(it));
    });
    q('#stBox [data-stash-potion-kind]').forEach(b => b.onclick = () => stashDone(stashWithdrawPotion(b.dataset.stashPotionKind, +b.dataset.stashPotionTier)));
    q('#stBox .it').forEach(b => b.onclick = () => { if (b.dataset.stashPotionKind !== undefined) return; stashItemModal(+b.dataset.si); });
    q('[data-mi]').forEach(b => b.onclick = () => { const [g, k] = b.dataset.mi.split('|'); stashDone(stashMat('in', g, k)); });
    q('[data-mo]').forEach(b => b.onclick = () => { const [g, k] = b.dataset.mo.split('|'); stashDone(stashMat('out', g, k)); });
    const gv = () => $('#stGold').value;
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    on('#stIn', () => stashDone(stashGold('in', gv()))); on('#stOut', () => stashDone(stashGold('out', gv())));
    on('#stInAll', () => stashDone(stashGold('in', S.gold))); on('#stOutAll', () => stashDone(stashGold('out', stashRead().st.gold)));
    on('#stDl', () => { const blob = new Blob([stashFileText()], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `jxidle_kho_${new Date().toISOString().slice(0, 10)}.jxkho`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); toast('Đã tải file kho'); });
    on('#stUp', () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.jxkho,.json'; inp.style.display = 'none';
      inp.onchange = () => { const f = inp.files && inp.files[0]; inp.remove(); if (!f) return; const r = new FileReader(); r.onload = () => stashImportFlow(String(r.result)); r.readAsText(f); }; document.body.appendChild(inp); inp.click(); });
  });
}
function stashItemModal(i) {
  const it = stashRead().st.items[i]; if (!it) { stashModal(); return; }
  modal(`${itemHTML(it)}<div class="btnrow"><button class="btn" id="stTake">Lấy ra</button><button class="btn" id="stBack">Quay lại</button></div>`, () => {
    $('#stTake').onclick = () => stashDone(stashWithdraw(i)); $('#stBack').onclick = () => stashModal();
  });
}
function stashImportFlow(txt) {
  let st; try { st = parseStashText(txt); } catch (e) { toast(e.message || 'File không hợp lệ'); return; }
  const cur = stashRead().st;
  modal(`<h3>Nạp file kho</h3><p class="desc">File: <b>${st.items.length}</b> món, <b>${fmt(st.gold)}</b> lượng. Kho hiện tại: ${cur.items.length} món, ${fmt(cur.gold)} lượng. Nạp sẽ <b>thay thế</b> kho hiện tại.</p>
    <div class="btnrow"><button class="btn red" id="stOk">Thay thế kho</button><button class="btn" id="stNo">Hủy</button></div>`, () => {
    $('#stOk').onclick = () => { const r = stashImport(st); toast(r.msg); stashModal(); }; $('#stNo').onclick = () => stashModal('file');
  });
}

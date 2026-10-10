// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { uiSfx } from './audio';
import { H, R } from './combat';
import {
  $,
  FAC,
  INV_MAX,
  J,
  SERIES,
  W,
  esc,
  fmt,
} from './core';
import { baseRow, itemValue, lootMatch, makeItem } from './loot';
import { img } from './render';
import { S, save } from './save';
import { reqOk, sexOk, weaponCode } from './stats';
import {
  addItem,
  closeModal,
  findItem,
  itemCell,
  modal,
  refresh,
  sell,
  sellProtected,
  sellUnmatched,
  toast,
} from './ui';
import { stashDepositPotion, stashDone } from './stash';

/* ======================= CUA HANG BIEN KINH (BuySell.txt + Goods.txt) ======================= */
'use strict';
const SHOP_TABS = [['weapon', 'Vũ khí'], ['cloth', 'Trang phục'], ['jewel', 'Trang sức'], ['med', 'Dược phẩm'], ['horse', 'Ngựa'], ['sell', 'Bán đồ']];
const POT_STACK = 10;
let shopTab = 'weapon';

export function shopPrice(g) {
  if (g.g === 1) { const p = potionOf(g); return Math.round((g.price || (p ? p.price : 50)) * (1 + S.lvl / 25)); } // nhu potPrice
  const b = baseRow(g.d, g.k, g.lvl); return g.price || (b ? b.price : 100);
}
function potionOf(g) { return J.potions.find(p => p.kind === (g.d === 1 ? 'mana' : 'life') && p.tier === g.lvl); }
/* he cua mon trang trong cua hang: theo bang neu co, khong thi chon 1 lan / mon va giu nguyen (xem truoc dung voi mon mua duoc) */
export const shopSeries = (g, it) => g.s >= 0 ? g.s : (g._s === undefined ? (g._s = it.s) : g._s);
export function goodsItem(g) { // mon mau de xem truoc (trang, khong thuoc tinh ma thuat)
  const it = makeItem(g.d, g.k, g.lvl, 0); if (!it) return null;
  S.uid--; it.uid = -1; it.s = shopSeries(g, it); return it;
}
export function potStock(kind) { S.potStock = S.potStock || { life: {}, mana: {} }; return S.potStock[kind]; }
export function stockCount(kind) { return Object.values(potStock(kind)).reduce((a, b) => a + b, 0); }
export function potionKinds() { return ['life', 'mana']; }
/* so o binh thuoc dung trong hanh trang (moi bac co so = 1 o) */
export function potSlotsUsed(kind = null) {
  const kinds = kind ? [kind] : potionKinds();
  return kinds.reduce((n, k) => n + Object.values(potStock(k)).filter(v => v > 0).length, 0);
}
export function potPrice(p) { return Math.round(p.price * (1 + S.lvl / 25)); }
export function sellPotionStock(kind, tier) {
  const p = J.potions.find(x => x.kind === kind && x.tier === tier), st = potStock(kind);
  if (!p || !(st[tier] > 0)) return { ok: false, msg: 'Bình thuốc không còn trong hành trang' };
  const gold = Math.max(1, Math.floor(potPrice(p) / 2));
  st[tier]--; if (st[tier] <= 0) delete st[tier]; S.gold += gold; save();
  return { ok: true, p, gold, remaining: st[tier] || 0 };
}
export function sellPotionStack(kind, tier) {
  const p = J.potions.find(x => x.kind === kind && x.tier === tier), st = potStock(kind), count = st[tier] || 0;
  if (!p || !count) return { ok: false, msg: 'Bình thuốc không còn trong hành trang' };
  const gold = Math.max(1, Math.floor(potPrice(p) / 2)) * count;
  delete st[tier]; S.gold += gold; save();
  return { ok: true, p, count, gold, msg: `Đã bán ${count} ${p.n} · nhận ${fmt(gold)} lượng` };
}
/* Xem / ban / gui kho mot chong binh thuoc trong hanh trang (bam o thuoc trong luoi Hành trang) */
export function potionInventoryModal(kind, tier) {
  const p = J.potions.find(x => x.kind === kind && x.tier === tier), count = potStock(kind)[tier] || 0;
  if (!p || !count) { closeModal(); refresh(); return; }
  const sellValue = Math.max(1, Math.floor(potPrice(p) / 2));
  modal(`<h3>${esc(p.n)}</h3><div class="item-info potion-info"><img src="${esc(p.ic || '')}" alt=""><div><b>${esc(p.n)}</b><div class="dim small">${kind === 'life' ? 'Kim Sáng Dược · sinh lực' : 'Thuốc nội lực'} · bậc ${tier}</div><div>Còn trong hành trang: <b>${count}</b></div></div></div><div class="card">Hồi tổng <b>${fmt(p.total)} ${kind === 'life' ? 'sinh lực' : 'nội lực'}</b> trong ${p.dur}s.</div><div class="btnrow"><button class="btn red" id="bSellPotionOne">Bán 1 bình · ${fmt(sellValue)} lượng</button><button class="btn red" id="bSellPotionStack">Bán cả chồng · ${fmt(sellValue * count)} lượng</button><button class="btn" id="bStashPotion">Gửi kho chung</button><button class="btn" id="bPotionClose">Đóng</button></div>`, () => {
    $('#bPotionClose').onclick = closeModal;
    $('#bSellPotionStack').onclick = () => { const result = sellPotionStack(kind, tier); toast(result.msg); closeModal(); refresh(); };
    $('#bStashPotion').onclick = () => { const result = stashDepositPotion(kind, tier); if (!result.ok) { toast(result.msg); return; } closeModal(); stashDone(result, true); };
    $('#bSellPotionOne').onclick = () => {
      const result = sellPotionStock(kind, tier);
      if (!result.ok) { toast(result.msg); closeModal(); refresh(); return; }
      toast(`Đã bán ${result.p.n} · nhận ${fmt(result.gold)} lượng`);
      refresh();
      if (result.remaining) potionInventoryModal(kind, tier); else closeModal();
    };
  });
}
export function takeStock(kind) { // thuoc da mua: dung loai tot nhat con trong tui truoc khi mua moi
  const st = potStock(kind), tiers = Object.keys(st).map(Number).filter(t => st[t] > 0).sort((a, b) => b - a);
  if (!tiers.length) return null;
  const p = J.potions.find(x => x.kind === kind && x.tier === tiers[0]); if (!p) return null;
  st[tiers[0]]--; return p;
}
function buyGoods(g) {
  const price = shopPrice(g) * (g.g === 1 ? POT_STACK : 1);
  if (S.gold < price) { toast('Không đủ ngân lượng'); return; }
  if (g.g === 1) {
    const p = potionOf(g); if (!p) return;
    S.gold -= price; const st = potStock(p.kind); st[p.tier] = (st[p.tier] || 0) + POT_STACK;
    toast(`Mua ${POT_STACK} ${p.n}`); uiSfx('use');
  } else {
    if (S.inv.length >= INV_MAX) { toast('Hành trang đầy'); return; }
    const it = makeItem(g.d, g.k, g.lvl, 0); if (!it) return;
    it.s = shopSeries(g, it);
    S.gold -= price; addItem(it, true, true, true); toast(`Mua ${it.n}`); uiSfx('dropOther');
  }
  save(); shopModal();
}
export function shopModal() {
  const f = FAC[S.fac], tabs = SHOP_TABS.filter(([k]) => k === 'sell' || (J.shops[k] && J.shops[k].items.length));
  if (!tabs.find(t => t[0] === shopTab)) shopTab = tabs[0][0];
  let body = '';
  if (shopTab === 'sell') {
    const bad = S.inv.filter(i => !lootMatch(i) && !sellProtected(i));
    body = `<p class="desc">Bán món trong hành trang. Món không khớp bộ lọc: ${bad.length} (${fmt(bad.reduce((a, i) => a + itemValue(i), 0))} lượng). Đồ bộ / Tím / Bạch Kim không bị bán hàng loạt.</p>
      <div class="btnrow"><button class="btn red" id="bSellBad">Bán đồ không khớp lọc</button></div>
      <div class="invgrid">${S.inv.map(itemCell).join('')}</div>`;
  } else {
    const list = J.shops[shopTab].items.filter(g => { if (g.g === 1) return true; const it = goodsItem(g); return !it || sexOk(it); }).slice().sort((a, b) => (a.d - b.d) || (a.k - b.k) || (a.lvl - b.lvl));
    body = `<div class="shoplist">${list.map((g, i) => {
      if (g.g === 1) {
        const p = potionOf(g); if (!p) return '';
        return `<button class="shoprow" data-i="${i}"><img src="${esc(p.ic || '')}" alt=""><span><b>${esc(p.n)}</b><small>Hồi ${fmt(p.total)} ${p.kind === 'life' ? 'sinh lực' : 'nội lực'} trong ${p.dur}s · còn ${potStock(p.kind)[p.tier] || 0}</small></span><em>${fmt(shopPrice(g) * POT_STACK)} / ${POT_STACK}</em></button>`;
      }
      const it = goodsItem(g); if (!it) return '';
      const own = shopTab === 'weapon' && f && weaponCode({ weapon: it }) === f.wcode;
      return `<button class="shoprow${reqOk(it) ? '' : ' bad'}${own ? ' own' : ''}" data-i="${i}"><img src="${esc(it.ic)}" alt=""><span><b>${esc(it.n)}</b><small>Cấp ${it.lvl}${it.s >= 0 ? ' · hệ ' + SERIES[it.s] : ''}${own ? ' · đúng loại vũ khí môn phái' : ''}</small></span><em>${fmt(shopPrice(g))}</em></button>`;
    }).join('')}</div>`;
    R.shopList = list;
  }
  modal(`<h3>Cửa hàng ${esc(W.town.n)} <small>${fmt(S.gold)} lượng</small></h3>
    <div class="dtabs">${tabs.map(([k, n]) => `<button data-t="${k}" class="${k === shopTab ? 'on' : ''}">${n}</button>`).join('')}</div>${body}`, () => {
    document.querySelectorAll('#mBody .dtabs button').forEach(b => b.onclick = () => { shopTab = b.dataset.t; shopModal(); });
    document.querySelectorAll('#mBody .shoprow').forEach(b => b.onclick = () => buyGoods(R.shopList[+b.dataset.i]));
    const sb = $('#bSellBad'); if (sb) sb.onclick = () => { sellUnmatched(); save(); shopModal(); };
    document.querySelectorAll('.mbox .invgrid .it').forEach(b => b.onclick = () => { const it = findItem(b.dataset.uid); if (it) { sell(it); shopTab = 'sell'; shopModal(); } });
  });
}

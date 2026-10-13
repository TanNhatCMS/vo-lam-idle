// @ts-nocheck — Kỳ Trân Các + Kim Nguyên Bảo (KNB) — port theo cơ chế nguồn v107:
// Ks=1e5, Js=10 (1.000.000 lượng → 10 KNB), qs=8e4 (10 KNB → 800.000 lượng),
// Bố Y giảm 50% giá vật phẩm (uc=.5, trừ gói KNB), shop KNB: tt/qht/rngua 20,
// vlmt/ttk 100, bk90 50; shop lượng: rht 30.000, rda 50.000.
// KNB rơi từ phó bản, Boss tuần và trùm (ktcOnBossKill).
'use strict';
import { S, save } from './save';
import { RW } from './rewards';
import { matAdd } from './recipes';
import { esc, fmt, clamp } from './core';
import { log, modal, toast } from './ui';
import { R } from './combat';

export const KTC_GOLD = 1e5;               // Ks — mệnh giá 1 gói đổi
export const KTC_PACK = 10;                // Js — KNB mỗi gói
export const KTC_SELL = 8e4;               // qs — lượng nhận lại mỗi 1 KNB trong gói bán (×10 gói)
const BOOY_OFF = 0.5;                      // uc — Bố Y giảm 50% giá item

/* ---------- KNB ---------- */
export const knbHave = () => { const r = RW(); r.knb = r.knb || 0; return r.knb; };
export function knbGain(n) { const r = RW(); r.knb = (r.knb || 0) + n; save(); }
export function knbSpend(n) { const r = RW(); r.knb = r.knb || 0; if (r.knb < n) return false; r.knb -= n; save(); return true; }

/* ---------- vật phẩm cộng dồn (stackItems của nguồn: Fo/Ro/Lo) ---------- */
const stack = () => { const r = RW(); r.ktcStack = r.ktcStack || {}; return r.ktcStack; };
export const stackHave = k => stack()[k] || 0;
function stackAdd(k, n = 1) { const s = stack(); s[k] = (s[k] || 0) + n; save(); }
function stackUse(k, n = 1) { const s = stack(); if ((s[k] || 0) < n) return false; s[k] -= n; if (s[k] <= 0) delete s[k]; save(); return true; }

/* ---------- buff tt/qht: {p, until} — thời gian trôi cả khi đóng game ---------- */
const buf = () => { const r = RW(); r.ktcBuf = r.ktcBuf || {}; return r.ktcBuf; };
function buffAdd(k, p, minutes) { const b = buf(); const cur = b[k] && b[k].until > Date.now() ? b[k].p : 0; b[k] = { p: cur + p, until: Date.now() + minutes * 60000 }; save(); }
export const buffLuck = () => { const b = buf().luck; return b && b.until > Date.now() ? b.p : 0; };   // % may mắn (qht)
export const buffXp = () => { const b = buf().xp; return b && b.until > Date.now() ? b.p : 0; };       // % kinh nghiệm (tt)

/* ---------- bảng Kỳ Trân Các (giá gốc từ nguồn) ---------- */
const SHOP = [
  { k: 'knb', n: 'Kim Nguyên Bảo', icon: 'img/ep/knb.png', gold: KTC_GOLD, d: `Đổi ${fmt(KTC_GOLD * KTC_PACK)} ngân lượng lấy ${KTC_PACK} KNB. KNB nhận từ phó bản, Boss tuần và trùm.` },
  { k: 'tt', knb: 20, n: 'Tiên Thảo Lộ', icon: 'img/ep/knb.png', d: '+50% kinh nghiệm chiến đấu trong 60 phút. Dùng thêm cộng dồn thời gian; thời gian tiếp tục trôi khi đóng game.' },
  { k: 'qht', knb: 20, n: 'Quế Hoa Tửu', icon: 'img/ep/knb.png', d: '+20 may mắn trong 60 phút, tăng chất lượng dòng trang bị và thêm 10% tỉ lệ rơi trang bị. Dùng thêm cộng dồn thời gian.' },
  { k: 'rngua', knb: 20, n: 'Rương Ngựa', icon: 'img/ep/knb.png', d: 'Mở một con ngựa: Thường 56% · Tốt 31,5% · Quý 6% · Thần 3% · Danh mã 2% · Bảo mã 1% · Chí tôn 0,5%. Ngựa Quý trở lên tự khóa; cần đủ điều kiện mới trang bị được.' },
  { k: 'vlmt', knb: 100, n: 'Dịch Căn Kinh', icon: 'img/ep/knb.png', d: 'Từ cấp 80 hoặc đã trùng sinh: +1 điểm kỹ năng. Mỗi nhân vật dùng tối đa 15 cuốn.' },
  { k: 'ttk', knb: 100, n: 'Tẩy Tủy Kinh', icon: 'img/ep/knb.png', d: 'Từ cấp 80: +1 điểm tiềm năng, mỗi 2 cấp thêm 1, tối đa +5 ở cấp 88; đã trùng sinh nhận +5. Tối đa 15 cuốn mỗi nhân vật; điểm từ sách được giữ qua chuyển sinh.' },
  { k: 'bk90', knb: 50, n: 'Võ Lâm Mật Tịch', icon: 'img/ep/mt90.webp', d: 'Lĩnh ngộ một võ công cấp 90 lần đầu, hoặc dùng sách để bù tiến độ luyện cho chiêu đã học.' },
  { k: 'rht', gold: 3e4, n: 'Rương Huyền Tinh', icon: 'img/ep/knb.png', d: 'Mở 2–3 Huyền Tinh Khoáng Thạch, cấp nguyên liệu theo cấp nhân vật.' },
  { k: 'rda', gold: 5e4, n: 'Rương Đá Thuộc Tính', icon: 'img/ep/knb.png', d: 'Mở một đá thuộc tính; 30% nhận thêm một đá. Ưu tiên dòng hợp trang bị đang mặc.' },
];
const price = it => (it.knb || it.gold);                                  // dc() của nguồn
const priceShow = it => (S.chal === 'white' && it.k !== 'knb' ? Math.max(1, Math.round(price(it) * BOOY_OFF)) : price(it));

const tyvoLock = () => !!R.tyvo;
const MISC_NAME = { tt: 'Tiên Thảo Lộ', qht: 'Quế Hoa Tửu', rngua: 'Rương Ngựa', vlmt: 'Dịch Căn Kinh', ttk: 'Tẩy Tủy Kinh', bk90: 'Võ Lâm Mật Tịch', rht: 'Rương Huyền Tinh', rda: 'Rương Đá Thuộc Tính' };

/* Mua 1 món: trừ KNB/lượng, nhận vào stack/misc. Trả {ok, msg}. */
export function ktcBuy(k) {
  const it = SHOP.find(x => x.k === k);
  if (!it || !S.fac) return { ok: false, msg: '' };
  if (tyvoLock()) return { ok: false, msg: 'Hãy dừng chuỗi Tỷ Võ trước khi dùng Kỳ Trân Các' };
  const n = k === 'knb' ? KTC_PACK : 1;                    // gói KNB: mua cả pack (Ks×Js như nguồn)
  const cost = priceShow(it) * n, isKnb = !!it.knb;
  const r = RW();
  if (isKnb ? (r.knb || 0) < cost : S.gold < cost) return { ok: false, msg: `Không đủ ${isKnb ? 'Kim Nguyên Bảo' : 'ngân lượng'}` };
  if (isKnb) r.knb -= cost; else S.gold -= cost;
  if (k === 'knb') { r.knb = (r.knb || 0) + KTC_PACK; save(); return { ok: true, msg: `🏮 Kỳ Trân Các: nhận ${KTC_PACK} KNB` }; }
  if (k === 'vlmt' || k === 'ttk') { matAdd('misc', k, 1); }              // sách: vàomisc, dùng qua useBook (useN cap 15 sẵn có)
  else stackAdd(k, 1);
  save();
  return { ok: true, msg: `🏮 Kỳ Trân Các: nhận ${n > 1 ? n + ' ' : ''}${esc(MISC_NAME[k] || k)} (−${fmt(cost)} ${isKnb ? 'KNB' : 'lượng'})` };
}

/* Bán gói KNB lấy lượng */
export function ktcSell() {
  if (tyvoLock()) return { ok: false, msg: 'Hãy dừng chuỗi Tỷ Võ trước khi dùng Kỳ Trân Các' };
  const r = RW();
  if ((r.knb || 0) < KTC_PACK) return { ok: false, msg: 'Không đủ KNB' };
  r.knb -= KTC_PACK; S.gold += KTC_SELL * KTC_PACK; save();
  return { ok: true, msg: `🏮 Bán ${KTC_PACK} KNB → ${fmt(KTC_SELL * KTC_PACK)} lượng` };
}

/* ---------- "Dùng" vật phẩm stack ---------- */
const HORSE_TABLE = [['Thường', 56], ['Tốt', 31.5], ['Quý', 6], ['Thần', 3], ['Danh mã', 2], ['Bảo mã', 1], ['Chí tôn', 0.5]];
function openRngua() {                                                   // rương ngựa — bảng tỉ lệ nguồn
  let roll = Math.random() * 100, acc = 0, tier = HORSE_TABLE[HORSE_TABLE.length - 1][0];
  for (const [n, p] of HORSE_TABLE) { acc += p; if (roll < acc) { tier = n; break; } }
  return { tier };
}
function openRht() {                                                     // rương huyền tinh: 2–3 viên, cấp theo nhân vật
  const tier = clamp(Math.round(S.lvl / 25) + 1, 1, 10), n = 2 + (Math.random() < 0.5 ? 1 : 0);
  matAdd('ht', tier, n);
  return { msg: `Mở Rương Huyền Tinh: +${n} Huyền Tinh Khoáng Thạch cấp ${tier}` };
}
function openRda() {                                                     // rương đá thuộc tính: 1 đá (30% thêm 1)
  const oreKeys = ['0:58:1', '0:88:1', '1:58:1', '0:108:1', '1:108:1', '2:68:1'];   // đá hợp dụng theo dòng ẩn/hiện
  const k = oreKeys[Math.floor(Math.random() * oreKeys.length)];
  matAdd('ore', k, 1);
  let msg = `Mở Rương Đá: +1 đá thuộc tính`;
  if (Math.random() < 0.3) { const k2 = oreKeys[Math.floor(Math.random() * oreKeys.length)]; matAdd('ore', k2, 1); msg += ' (may mắn thêm 1!)'; }
  return { msg };
}
export function ktcUse(k) {
  if (!stackHave(k)) return { ok: false, msg: '' };
  if (k === 'tt') { stackUse(k); buffAdd('xp', 50, 60); return { ok: true, msg: 'Tiên Thảo Lộ: +50% kinh nghiệm trong 60 phút' }; }
  if (k === 'qht') { stackUse(k); buffAdd('luck', 20, 60); return { ok: true, msg: 'Quế Hoa Tửu: +20 may mắn trong 60 phút' }; }
  if (k === 'rngua') {
    stackUse(k);
    const { tier } = openRngua();
    try { const fn = window.vlKtcHorse; if (typeof fn === 'function') return { ok: true, msg: fn(tier) }; } catch (e) { /* chưa wire ngựa */ }
    return { ok: true, msg: `Rương Ngựa: nhận ngựa bậc ${tier} (tích hợp ngựa sẽ ghép sau)` };
  }
  if (k === 'rht') { stackUse(k); const { msg } = openRht(); return { ok: true, msg }; }
  if (k === 'rda') { stackUse(k); const { msg } = openRda(); return { ok: true, msg }; }
  if (k === 'bk90') { stackUse(k); matAdd('misc', 'bk90', 1); try { if (typeof window.lk90Modal === 'function') window.lk90Modal(); } catch (e) { /* bo qua */ } return { ok: true, msg: 'Võ Lâm Mật Tịch đã vào túi — mở thẻ Lĩnh ngộ' }; }
  if (k === 'vlmt' || k === 'ttk') return { ok: false, msg: 'Sách dùng trực tiếp ở nút 🎁 (sách đã vào túi nguyên liệu)' };
  return { ok: false, msg: '' };
}

/* ---------- KNB rơi từ trùm / phó bản ---------- */
export function ktcOnBossKill(elite) {                                   // gc() của nguồn: chỉ trùm, không trong hoạt động khác
  if (!S.fac || R.tyvo || R.tower || R.tk) return;
  const chance = elite ? 0.5 : 0.1;                                      // trùm vàng 50%, trùm thường 10% (uc)
  if (Math.random() >= chance) return;
  const n = elite ? 2 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
  knbGain(n);
  log(`🏮 Hạ trùm nhận <b style="color:#ffd24a">+${n} Kim Nguyên Bảo</b>!`);
  toast(`+${n} KNB`);
}
export function ktcOnDungeonClear(rank) {                                // thưởng KNB theo hạng phó bản (rw bảng nguồn)
  const table = { S: 15, A: 10, B: 6, C: 3 };
  const n = table[rank] || 0;
  if (n) knbGain(n);
  return n;
}

/* ---------- modal Kỳ Trân Các ---------- */
export const ktcReady = () => !!S.fac;
export const ktcBadge = () => (knbHave() > 0 ? String(knbHave()) : '');

export function ktcBody(r) {
  const booy = S.chal === 'white';
  const rows = SHOP.filter(it => it.k !== 'knb').map(it => {   // gói KNB đã có ô đổi ở đầu, khỏi lặp nút
    const have = it.k === 'knb' ? '' : stackHave(it.k);
    const cost = priceShow(it);
    const wallet = it.knb ? 'KNB' : 'lượng';
    return `<div class="ktc-item"><img src="${it.icon}" alt="" onerror="this.style.display='none'">
      <div class="ktc-item-mid"><b>${esc(it.n)}</b><small>${esc(it.d)}</small>${have ? `<small class="ktc-have">Đang có: ${have}</small>` : ''}</div>
      <div class="ktc-item-act"><button class="btn sm" data-ktc-buy="${it.k}" ${tyvoLock() || (it.knb ? (r.knb || 0) : S.gold) < cost ? 'disabled' : ''}>Mua · ${fmt(cost)} ${wallet}</button>
      ${['tt', 'qht', 'rngua', 'rht', 'rda', 'bk90'].includes(it.k) ? `<button class="btn sm" data-ktc-use="${it.k}" ${have ? '' : 'disabled'}>Dùng</button>` : ''}</div></div>`;
  }).join('');
  return `<div class="ktc-shell">
    <div class="ktc-knb"><img src="img/ep/knb.png" alt=""><span><b>Kim Nguyên Bảo: ${fmt(knbHave())}</b><small>${booy ? 'Ưu đãi Bố Y · giảm 50% giá vật phẩm' : 'Đổi ngân lượng để mua kỳ trân'}</small></span>
      <div class="btnrow"><button class="btn" data-ktc-buy="knb" ${tyvoLock() || S.gold < KTC_GOLD * KTC_PACK ? 'disabled' : ''}>${fmt(KTC_GOLD * KTC_PACK)} lượng → ${KTC_PACK} KNB</button>
      <button class="btn" data-ktc-sell ${tyvoLock() || knbHave() < KTC_PACK ? 'disabled' : ''}>${KTC_PACK} KNB → ${fmt(KTC_SELL * KTC_PACK)} lượng</button></div></div>
    ${rows}
    <small class="dim ktc-note">KNB nhận từ phó bản, Boss tuần và trùm. Vật phẩm cộng dồn trong Hành trang và có thể gửi Kho chung.</small></div>`;
}

export function ktcBind(reload) {
  document.querySelectorAll('#mBody [data-ktc-buy]').forEach(b => b.onclick = () => { const res = ktcBuy(b.dataset.ktcBuy); toast(res.msg); if (res.ok) reload(); });
  const sell = document.querySelector('#mBody [data-ktc-sell]');
  if (sell) sell.onclick = () => { const res = ktcSell(); toast(res.msg); if (res.ok) reload(); };
  document.querySelectorAll('#mBody [data-ktc-use]').forEach(b => b.onclick = () => { const res = ktcUse(b.dataset.ktcUse); if (res.msg) toast(res.msg); if (res.ok) reload(); });
}

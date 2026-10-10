// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { $, DETAIL_SLOT, MAX_LEVEL, RAR_VI, clamp, esc, fmt } from './core';
import { invMax } from './invs';
import { FUSE_SLOTS, fuse, fuseCost } from './recipes';
import { itemPower, itemValue, lootMatch } from './loot';
import { stashMax, stashRead, stashTx } from './stash';
import { S, save } from './save';
import { R } from './combat';
import { betterThanEquipped, closeModal, log, modal, refresh, setInvDirty, toast } from './ui';

/* ======================= DON KHO =======================
   Port tu js/donkho.js ban vinarpg: gom trang suc thua thanh Huyen Tinh va ban do
   thuong khong khop bo loc. Ban theo loc va ban sach co bao ve; ban bat chap co
   man xac nhan rieng. Cap yeu cau cua mon lay theo it.lvl (cap do khi sinh). */
'use strict';
const DK = { inv: true, st: false, jew: true, white: true, blue: true, rare: true, lv: MAX_LEVEL };
const dkRequiredLevel = it => (it && it.lvl) || 0;

function dkEquipped(it) { return Object.values(S.eq || {}).includes(it); }
function dkFuseSafe(it) {
  return !!it && !it.locked && !(it.set || it.vio || it.plv || it.petOnly) && DETAIL_SLOT[it.d] !== 'horse' && !dkEquipped(it);
}
// Bán theo loại đã chọn có thể bán đồ bộ, cường hóa và ngựa; chỉ khóa, đồ đang mặc
// và món mạnh hơn trang bị hiện tại được bảo vệ riêng ở bước phân loại.
function dkSellSafe(it) { return !!it && !it.locked && !dkEquipped(it); }
function dkJewCandidate(it) {
  return dkFuseSafe(it) && FUSE_SLOTS.includes(it.d) && dkRequiredLevel(it) <= DK.lv && !betterThanEquipped(it);
}
function dkCategory(it) {
  if (!dkSellSafe(it) || dkRequiredLevel(it) > DK.lv || betterThanEquipped(it) || lootMatch(it)) return '';
  if (it.r === 0) return DK.white ? 'Đồ thường' : '';
  if (it.r === 1) return DK.blue ? 'Đồ xanh' : '';
  if ((it.r || 0) >= 2) return DK.rare ? 'Đồ quý' : '';
  return '';
}
function dkPlan() {
  const p = { inv: [], st: [], invJew: [], stJew: [], stErr: '', moveJew: 0, fuseN: 0, gold: 0 };
  if (DK.inv) {
    for (const it of S.inv) {
      const category = dkCategory(it);
      if (category) { p.inv.push(it); p.gold += itemValue(it); }
      if (DK.jew && dkJewCandidate(it)) p.invJew.push(it);
    }
  }
  if (DK.st) {
    const { st, err } = stashRead(); p.stErr = err || '';
    if (!err) for (const it of st.items) {
      const category = dkCategory(it);
      if (category) { p.st.push(it); p.gold += itemValue(it); }
      if (DK.jew && dkJewCandidate(it)) p.stJew.push(it);
    }
  }
  if (DK.jew) {
    const room = Math.max(0, 60 - S.inv.length);
    const movable = DK.st ? Math.min(p.stJew.length, room) : 0;
    const cost = fuseCost();
    p.fuseN = cost > 0 ? Math.min(Math.floor((p.invJew.length + movable) / 3), Math.floor(S.gold / cost)) : 0;
    p.moveJew = Math.min(p.stJew.length, Math.max(0, p.fuseN * 3 - p.invJew.length));
  }
  return p;
}
function dkMoveStashJewels(count) {
  if (!(count > 0)) return { ok: true, items: [] };
  let moved = [];
  const result = stashTx(st => {
    const room = Math.max(0, 60 - S.inv.length);
    const take = st.items.filter(dkJewCandidate).slice(0, Math.min(count, room));
    if (!take.length) return { ok: false, msg: 'Không còn ô trống để chuyển trang sức từ Kho chung' };
    const oldUid = S.uid;
    moved = take.map(it => Object.assign({}, it, { uid: S.uid++ }));
    st.items = st.items.filter(it => !take.includes(it));
    S.inv.unshift(...moved); setInvDirty(true); R.dirty = true;
    return { ok: true, from: 'stash', n: moved.length, undo: () => { S.inv = S.inv.filter(it => !moved.includes(it)); S.uid = oldUid; setInvDirty(true); R.dirty = true; } };
  });
  return result.ok ? { ok: true, items: moved } : { ok: false, msg: result.msg || 'Không chuyển được trang sức từ Kho chung' };
}
function dkRun() {
  const res = { fused: 0, sold: 0, gold: 0, msg: [] };
  const before = dkPlan();
  if (DK.st && before.stErr) return { ...res, error: before.stErr === 'tampered' ? 'Kho chung lỗi chữ ký; không thể bán an toàn' : 'Không đọc được Kho chung' };
  const moved = dkMoveStashJewels(before.moveJew);
  if (!moved.ok) return { ...res, error: moved.msg };

  if (DK.jew) {
    const pool = (DK.inv ? S.inv.filter(dkJewCandidate) : moved.items.slice()).sort((a, b) => itemPower(a) - itemPower(b));
    for (let i = 0; i < before.fuseN && pool.length >= 3; i++) {
      if (S.gold < fuseCost()) break;
      const batch = pool.splice(0, 3), result = fuse(batch);
      if (!result.ok) break;
      res.fused++;
    }
  }
  if (res.fused) res.msg.push(`luyện ${res.fused} Huyền Tinh (phí ${fmt(res.fused * fuseCost())} lượng)`);

  if (DK.st) {
    const result = stashTx(st => {
      const keep = [], sold = [];
      for (const it of st.items) (dkCategory(it) ? sold : keep).push(it);
      if (!sold.length) return { ok: false };
      const value = sold.reduce((sum, it) => sum + itemValue(it), 0);
      st.items = keep; S.gold += value;
      return { ok: true, from: 'stash', n: sold.length, value, undo: () => { S.gold -= value; } };
    });
    if (!result.ok && result.msg) return { ...res, error: result.msg };
    if (result.ok) { res.sold += result.n; res.gold += result.value; }
  }
  for (const it of S.inv.slice()) if (DK.inv && dkCategory(it)) {
    S.inv.splice(S.inv.indexOf(it), 1); const value = itemValue(it); S.gold += value; res.gold += value; res.sold++;
  }
  setInvDirty(true); R.dirty = true; save();
  if (res.sold) res.msg.push(`bán ${res.sold} món (+${fmt(res.gold)} lượng)`);
  return res;
}
function dkAllSafe(it) {
  return !!it && !it.locked && !(it.enh > 0) && DETAIL_SLOT[it.d] !== 'horse'
    && !Object.values(S.eq || {}).includes(it) && !betterThanEquipped(it);
}
function dkKind(it) {
  return it.vio ? 'Tím' : it.plv || it.set?.kind === 'platina' ? 'Bạch Kim' : it.set?.kind === 'gold' ? 'Hoàng Kim' : RAR_VI[clamp(it.r | 0, 0, RAR_VI.length - 1)];
}
function dkAllPlan() {
  const p = { inv: [], st: [], stErr: '', gold: 0, kinds: {} };
  const add = (where, it) => {
    if (!dkAllSafe(it)) return;
    p[where].push(it); p.gold += itemValue(it);
    p.kinds[dkKind(it)] = (p.kinds[dkKind(it)] || 0) + 1;
  };
  if (DK.inv) for (const it of S.inv) add('inv', it);
  if (DK.st) {
    const { st, err } = stashRead(); p.stErr = err || '';
    if (!err) for (const it of st.items) add('st', it);
  }
  return p;
}
function dkAllRun() {
  const p = dkAllPlan();
  if (DK.st && p.stErr) return { n: 0, gold: 0, error: p.stErr === 'tampered' ? 'Kho chung lỗi chữ ký; không thể bán an toàn' : 'Không đọc được Kho chung' };
  let n = 0, gold = 0;
  if (DK.st) {
    const result = stashTx(st => {
      const keep = [], sold = [];
      for (const it of st.items) (dkAllSafe(it) ? sold : keep).push(it);
      if (!sold.length) return { ok: false };
      const value = sold.reduce((sum, it) => sum + itemValue(it), 0);
      st.items = keep; S.gold += value;
      return { ok: true, from: 'stash', n: sold.length, value, undo: () => { S.gold -= value; } };
    });
    if (!result.ok && result.msg) return { n: 0, gold: 0, error: result.msg };
    if (result.ok) { n += result.n; gold += result.value; }
  }
  for (const it of S.inv.slice()) if (DK.inv && dkAllSafe(it)) {
    S.inv.splice(S.inv.indexOf(it), 1); const value = itemValue(it); S.gold += value; gold += value; n++;
  }
  setInvDirty(true); R.dirty = true; save(); return { n, gold };
}
function dkForcePlan() {
  const p = { inv: [], st: [], stErr: '', gold: 0, kinds: {}, locked: 0, enhanced: 0 };
  const add = (where, it) => {
    if (!it) return;
    if (it.locked) { p.locked++; return; }
    p[where].push(it); p.gold += itemValue(it);
    if ((it.enh | 0) > 0) p.enhanced++;
    p.kinds[dkKind(it)] = (p.kinds[dkKind(it)] || 0) + 1;
  };
  if (DK.inv) for (const it of S.inv) add('inv', it);
  if (DK.st) {
    const { st, err } = stashRead(); p.stErr = err || '';
    if (!err) for (const it of st.items) add('st', it);
  }
  return p;
}
function dkForceRun() {
  const p = dkForcePlan();
  if (DK.st && p.stErr) return { n: 0, gold: 0, error: p.stErr === 'tampered' ? 'Kho chung lỗi chữ ký; không thể bán an toàn' : 'Không đọc được Kho chung' };
  let n = 0, gold = 0;
  if (DK.st && p.st.length) {
    const result = stashTx(st => {
      const sold = st.items.filter(it => !it.locked), keep = st.items.filter(it => it.locked);
      if (!sold.length) return { ok: false, msg: 'Kho chung không còn món nào để bán' };
      const value = sold.reduce((sum, it) => sum + itemValue(it), 0), oldGold = S.gold;
      st.items = keep; S.gold += value;
      return { ok: true, n: sold.length, value, undo: () => { S.gold = oldGold; } };
    });
    if (!result.ok) return { n: 0, gold: 0, error: result.msg || 'Không bán được đồ trong Kho chung' };
    n += result.n; gold += result.value;
  }
  if (DK.inv && S.inv.length) {
    const sold = S.inv.filter(it => !it.locked), keep = S.inv.filter(it => it.locked);
    S.inv.splice(0, S.inv.length, ...keep);
    const value = sold.reduce((sum, it) => sum + itemValue(it), 0);
    S.gold += value; n += sold.length; gold += value;
  }
  setInvDirty(true); R.dirty = true; save(); return { n, gold };
}
function donBatChapModal(afterSell = refresh) {
  const p = dkForcePlan(), total = p.inv.length + p.st.length;
  const where = [DK.inv && `Hành trang ${p.inv.length}`, DK.st && `Kho chung ${p.st.length}`].filter(Boolean).join(' · ');
  const error = DK.st && p.stErr;
  modal(`<h3>⚠ Bán bất chấp</h3>
    <div class="card"><b class="bad">Bán toàn bộ ${total} món đã chọn; thao tác không hoàn tác được.</b>
      <div class="small">Bỏ qua bộ lọc: có thể bán đồ bộ, Tím, Bạch Kim, ngựa, cường hóa và món mạnh hơn đồ đang mặc. Đồ đang khóa 🔒 luôn được giữ lại.</div>
      <div class="small">Chỉ bán đồ trong hành trang / kho chung đã chọn; trang bị đang mặc không bị bán.</div></div>
    ${error ? `<p class="reqbad">${error === 'tampered' ? 'Kho chung lỗi chữ ký.' : 'Không đọc được Kho chung.'} Không thể bán đồ trong Kho chung lúc này.</p>` : ''}
    <table class="donkho-table small"><tr><th>Nơi</th><td>${where || '—'}</td></tr>
      <tr><th>Loại</th><td>${Object.entries(p.kinds).map(([k, c]) => `${esc(k)} ${c}`).join(' · ') || '—'}</td></tr>
      <tr><th>Giữ lại</th><td>${p.locked} món đang khóa 🔒</td></tr>
      <tr><th>Cường hóa</th><td>${p.enhanced} món sẽ bán</td></tr>
      <tr><th>Nhận</th><td><b>+${fmt(p.gold)} lượng</b></td></tr></table>
    <div class="btnrow"><button class="btn red" id="dbGo" ${total && !error ? '' : 'disabled'}>Xác nhận bán bất chấp ${total} món</button><button class="btn" id="dbNo">Quay lại</button></div>`, () => {
    $('#dbNo').onclick = () => donKhoModal(undefined, afterSell);
    $('#dbGo').onclick = () => {
      const r = dkForceRun(), message = r.error ? r.error : r.n ? `Bán bất chấp ${r.n} món (+${fmt(r.gold)} lượng)` : 'Không còn món nào để bán';
      toast(message); if (!r.error && r.n) log(`<span class="dim">${esc(message)}.</span>`);
      if (r.error) return;
      closeModal(); afterSell();
    };
  });
}
function donHetModal(afterSell = refresh) {
  const p = dkAllPlan(), total = p.inv.length + p.st.length;
  const where = [DK.inv && `Hành trang ${p.inv.length}`, DK.st && `Kho chung ${p.st.length}`].filter(Boolean).join(' · ');
  const error = DK.st && p.stErr;
  modal(`<h3>⚠ Bán sạch</h3>
    <div class="card"><b class="bad">Bán TOÀN BỘ ${total} món có thể bán; thao tác không hoàn tác được.</b>
      <div class="small">Bỏ qua bộ lọc và độ hiếm. Giữ đồ khóa 🔒, đồ cường hóa, đồ đang mặc, ngựa và món mạnh hơn đồ đang mặc.</div>
      <div class="small">Đồ bộ, Tím và Bạch Kim có thể bị bán nếu không được bảo vệ ở trên.</div></div>
    ${error ? `<p class="reqbad">${error === 'tampered' ? 'Kho chung lỗi chữ ký.' : 'Không đọc được Kho chung.'} Không thể bán đồ trong Kho chung lúc này.</p>` : ''}
    <table class="donkho-table small"><tr><th>Nơi</th><td>${where || '—'}</td></tr>
      <tr><th>Loại</th><td>${Object.entries(p.kinds).map(([k, c]) => `${esc(k)} ${c}`).join(' · ') || '—'}</td></tr>
      <tr><th>Nhận</th><td><b>+${fmt(p.gold)} lượng</b></td></tr></table>
    <div class="btnrow"><button class="btn red" id="dhGo" ${total && !error ? '' : 'disabled'}>Xác nhận bán sạch ${total} món</button><button class="btn" id="dhNo">Quay lại</button></div>`, () => {
    $('#dhNo').onclick = () => donKhoModal(undefined, afterSell);
    $('#dhGo').onclick = () => {
      const r = dkAllRun(), t = r.error ? r.error : r.n ? `Bán sạch ${r.n} món (+${fmt(r.gold)} lượng)` : 'Không có gì để bán';
      toast(t); if (!r.error) log(`<span class="dim">${esc(t)}.</span>`);
      if (r.error) return;
      closeModal(); afterSell();
    };
  });
}
export function donKhoModal(source, afterSell = refresh) {
  if (source === 'stash') { DK.inv = false; DK.st = true; }
  else if (source === 'inv') { DK.inv = true; DK.st = false; }
  const { st, err } = stashRead(), p = dkPlan(), forcePlan = dkForcePlan();
  const allPlan = dkAllPlan(), allTotal = allPlan.inv.length + allPlan.st.length;
  const forceTotal = forcePlan.inv.length + forcePlan.st.length;
  const check = (key, label) => `<label class="loot-check"><input type="checkbox" data-dk="${key}" ${DK[key] ? 'checked' : ''}><span>${label}</span></label>`;
  const row = (label, count, value) => `<tr><td>${label}</td><td>${count}</td><td>${value}</td></tr>`;
  const where = [DK.inv && `Hành trang ${p.inv.length}`, DK.st && `Kho chung ${p.st.length}`].filter(Boolean).join(' · ');
  const readError = DK.st && p.stErr;
  const total = p.inv.length + p.st.length;
  const fuseExpense = p.fuseN * fuseCost();
  const noChange = !total && !p.fuseN;
  modal(`<h3>Bán đồ · theo lọc</h3>
    <p class="desc">Chọn nơi và loại đồ cần bán. Có thể luyện trang sức thừa thành Huyền Tinh; xem trước số món, tiền nhận và phí luyện trước khi thực hiện.</p>
    <div class="card"><b>Bán ở đâu</b><div class="donkho-options">
      ${check('inv', `Hành trang <small class="dim">${S.inv.length}/${invMax()}</small>`)}
      ${check('st', `Kho chung <small class="dim">${err ? 'không đọc được' : `${st.items.length}/${stashMax()}`} · dùng chung 3 nhân vật, theo bộ lọc nhân vật này</small>`)}
    </div></div>
    <div class="card"><b>Bán gì</b><div class="donkho-options">
      ${check('jew', `Luyện trang sức thừa thành Huyền Tinh <small class="dim">${p.invJew.length} trong túi · ${p.stJew.length} trong kho</small>`)}
      ${check('white', 'Bán đồ thường không khớp bộ lọc')}
      ${check('blue', 'Bán đồ xanh không khớp bộ lọc')}
      ${check('rare', 'Bán đồ quý không khớp bộ lọc')}
      <label class="loot-filter-field" for="dkLv"><span>Chỉ bán yêu cầu cấp đến</span><span class="dk-level-controls"><input id="dkLv" type="number" min="1" max="${MAX_LEVEL}" step="1" value="${DK.lv}" aria-label="Chỉ bán vật phẩm có yêu cầu cấp tối đa"><button class="dk-level-apply" id="dkLvApply" type="button" title="Áp dụng giới hạn cấp" aria-label="Áp dụng giới hạn cấp">✓</button></span></label>
    </div></div>
    <table class="donkho-table small"><tr><th>Nơi</th><th>Bán</th><th>Trang sức</th></tr>
      ${row('Hành trang', DK.inv ? p.inv.length : '—', DK.inv && DK.jew ? `${p.invJew.length} món` : '—')}
      ${row('Kho chung', DK.st ? (readError ? 'lỗi kho' : p.st.length) : '—', DK.st && DK.jew ? `${p.stJew.length} món` : '—')}
      <tr><th><b>Tổng</b></th><td><b>${total}</b> · bán +${fmt(p.gold)} · phí luyện ${fmt(fuseExpense)} lượng</td><td><b>${p.fuseN}</b> Huyền Tinh</td></tr></table>
    <p class="dim small">Luôn giữ đồ khóa 🔒, đồ đang mặc và món mạnh hơn đồ đang mặc. Đồ cường hóa, đồ bộ / Tím / Bạch Kim và ngựa vẫn bán được nếu đúng loại đã chọn và không khớp bộ lọc.</p>
    ${readError ? `<p class="reqbad">${readError === 'tampered' ? 'Kho chung lỗi chữ ký; không thể bán an toàn.' : 'Không đọc được bộ nhớ trình duyệt.'}</p>` : ''}
    <div class="btnrow"><button class="btn red" id="dkGo" ${noChange || readError ? 'disabled' : ''}>Bán theo lọc (${total})</button><button class="btn red" id="dkAll" ${!allTotal || readError ? 'disabled' : ''} title="Bỏ qua bộ lọc; sẽ hiện trang xác nhận">⚠ Bán sạch (${allTotal})</button><button class="btn red" id="dkForce" ${!forceTotal || readError ? 'disabled' : ''} title="Bỏ qua bộ lọc; luôn giữ đồ khóa; sẽ hiện trang xác nhận">⚠ Bán bất chấp (${forceTotal})</button><button class="btn" id="dkNo">Đóng</button></div>`, () => {
    document.querySelectorAll('#mBody [data-dk]').forEach(input => input.onchange = () => { DK[input.dataset.dk] = input.checked; donKhoModal(undefined, afterSell); });
    const applyDkLevel = () => { DK.lv = clamp(Math.floor(+$('#dkLv').value) || 1, 1, MAX_LEVEL); donKhoModal(undefined, afterSell); };
    $('#dkLv').onchange = applyDkLevel;
    $('#dkLvApply').onpointerdown = e => e.preventDefault();
    $('#dkLvApply').onclick = applyDkLevel;
    $('#dkLv').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); applyDkLevel(); } };
    $('#dkNo').onclick = () => closeModal();
    $('#dkAll').onclick = () => donHetModal(afterSell);
    $('#dkForce').onclick = () => donBatChapModal(afterSell);
    $('#dkGo').onclick = () => {
      const result = dkRun();
      const details = result.msg.length ? `${result.msg.join(', ')}${result.error ? `; ${result.error}` : ''}` : result.error || 'Không có gì để bán';
      const message = result.msg.length ? `Bán theo lọc: ${details}` : details;
      toast(message); if (result.msg.length || !result.error) log(`<span class="dim">${esc(message)}.</span>`);
      if (result.error) return;
      closeModal(); afterSell();
    };
  });
}

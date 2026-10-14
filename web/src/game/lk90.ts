// @ts-nocheck — LĨNH NGỘ VÕ CÔNG CẤP 90 — port cơ chế nguồn v107:
// chiêu có learn==='90' (req 80, max 20, có sẵn trong J.skills) chỉ học được
// qua Võ Lâm Mật Tịch (bk90); đã chuyển sinh thì học miễn phí (cờ bkOk của nguồn);
// đã lĩnh ngộ luyện tiếp bằng sách (+1 cấp/lần). Nguồn: g_()/cc('bk90'), dr.
'use strict';
import { FAC, J, esc, fmt } from './core';
import { S, save } from './save';
import { RW } from './rewards';
import { matAdd, matHave } from './recipes';
import { log, modal, toast } from './ui';
import { R } from './combat';

/* Danh sách chiêu tier 90 của phái hiện tại */
export const SK90 = () => {
  const f = FAC[S.fac];
  if (!f) return [];
  return f.skills.map(id => J.skills[id]).filter(s => s && String(s.learn) === '90');
};
const learned = () => { const r = RW(); r.lk90 = r.lk90 || { lv: {} }; r.lk90.lv = r.lk90.lv || {}; return r.lk90; };
export const lk90Ready = () => !!(S.fac && SK90().length);
/* Chiêu 90 đã lĩnh ngộ (cho bảng võ công) */
export function lk90Skills() {
  const lv = learned().lv;
  return SK90().filter(s => lv[s.id]).map(s => Object.assign({}, s, { lkLv: lv[s.id] }));
}
export const lk90Learned = id => !!learned().lv[id];

/* Lĩnh ngộ 1 chiêu: −1 Mật Tịch, miễn phí khi đã chuyển sinh (bkOk) */
export function lk90Learn(id) {
  const s = J.skills[id];
  if (!s || String(s.learn) !== '90' || R.tyvo) return { ok: false, msg: R.tyvo ? 'Không thể đổi võ công trong lúc Tỷ Võ' : '' };
  const lv = learned();
  if (lv.lv[id]) return { ok: false, msg: 'Đã lĩnh ngộ chiêu này' };
  const free = S.reborn > 0;                       // bkOk: đã trùng sinh học không tốn sách
  if (!free) {
    if (matHave('misc', 'bk90') < 1) return { ok: false, msg: 'Cần 1 Võ Lâm Mật Tịch (hoặc đã chuyển sinh để học miễn phí)' };
    matAdd('misc', 'bk90', -1);
  }
  lv.lv[id] = 1; save();
  log(`📜 Lĩnh ngộ <b class="up">${esc(s.n)}</b> (cấp 90${free ? ' · miễn phí đã chuyển sinh' : ' · −1 Võ Lâm Mật Tịch'}).`);
  return { ok: true, msg: `Lĩnh ngộ ${s.n} thành công!` };
}
/* Luyện chiêu: −1 Mật Tịch +1 cấp (tiến độ bù bằng sách, đúng tinh thần nguồn) */
export function lk90Practice(id) {
  const s = J.skills[id], lv = learned();
  if (!s || !lv.lv[id] || R.tyvo) return { ok: false, msg: R.tyvo ? 'Không thể đổi võ công trong lúc Tỷ Võ' : '' };
  if (lv.lv[id] >= (s.max || 20)) return { ok: false, msg: 'Chiêu đã đạt cấp tối đa' };
  if (matHave('misc', 'bk90') < 1) return { ok: false, msg: 'Cần 1 Võ Lâm Mật Tịch để luyện tiếp' };
  matAdd('misc', 'bk90', -1);
  lv.lv[id]++; save();
  return { ok: true, msg: `Luyện ${s.n} lên cấp ${lv.lv[id]}` };
}

/* ---------- modal Lĩnh ngộ — picker lưới thẻ theo nguồn v119 (bk90-picker) ---------- */
export function lk90Body(r) {
  const list = SK90();
  if (!list.length) return '<p class="bk90-empty">Môn phái này không có võ công cần Mật Tịch.</p>';
  const lv = learned().lv, book = matHave('misc', 'bk90'), free = S.reborn > 0;
  let ready = 0, trainable = 0;
  const cards = list.map(s => {
    const cur = lv[s.id] || 0, max = s.max || 20;
    const canLearn = !R.tyvo && !cur && (free || book > 0);
    const canTrain = !R.tyvo && cur > 0 && cur < max && book > 0;
    if (canLearn) ready++;
    if (canTrain) trainable++;
    const status = cur
      ? (cur >= max ? `Đã lĩnh ngộ · cấp ${cur}/${max} · đã luyện tối đa` : `Đã lĩnh ngộ · cấp ${cur}/${max}`)
      : (R.tyvo ? 'Không thể đổi võ công trong lúc Tỷ Võ' : free ? 'Có thể học · không tốn sách' : book > 0 ? 'Có thể lĩnh ngộ' : 'Chưa lĩnh ngộ · cần Võ Lâm Mật Tịch');
    const icon = s.ic ? `<img class="bk90-skill-icon" src="${esc(s.ic)}" alt="" draggable="false">` : '<span class="bk90-skill-icon bk90-skill-icon-fallback" aria-hidden="true">⚔</span>';
    const btn = canLearn
      ? `<button type="button" class="btn bk90-skill-action" data-lk-learn="${s.id}"><span>${free ? 'Học chiêu' : 'Lĩnh ngộ'}</span><small>${free ? 'Miễn phí' : '−1 Mật Tịch'}</small></button>`
      : canTrain
        ? `<button type="button" class="btn bk90-skill-action" data-lk-practice="${s.id}"><span>Luyện chiêu</span><small>−1 Mật Tịch · +1 cấp</small></button>`
        : '';
    return `<article class="bk90-skill-card${canLearn ? ' is-ready' : canTrain ? ' is-training' : cur ? ' is-learned' : ' is-locked'}">${icon}
      <div class="bk90-skill-info"><b>${esc(s.n)}</b><small>Võ công bậc 90 · yêu cầu cấp ${s.req}${cur ? ` · cấp ${cur}/${max}` : ''}</small><span class="bk90-skill-status">${esc(status)}</span></div>${btn}</article>`;
  }).join('');
  return `<section class="bk90-picker"><header class="bk90-picker-head"><div><h3>Dùng Võ Lâm Mật Tịch</h3><p>Lĩnh ngộ chiêu mới tốn 1 sách. Chiêu đã lĩnh ngộ luyện tiếp bằng sách, +1 cấp/lần đến cấp tối đa. Đã chuyển sinh: học miễn phí.</p></div><div class="bk90-book-count"><img src="img/ep/mt90.webp" alt="" draggable="false"><b>×${book}</b><small>còn lại</small></div></header>
    <div class="bk90-picker-summary"><span>${ready}</span> chiêu có thể lĩnh ngộ <i>·</i> <span>${trainable}</span> chiêu có thể luyện bằng sách</div>
    <div class="bk90-skill-grid">${cards}</div></section>`;
}
export function lk90Bind(reload) {
  document.querySelectorAll('#mBody [data-lk-learn]').forEach(b => b.onclick = () => { const res = lk90Learn(+b.dataset.lkLearn); toast(res.msg); if (res.ok) reload(); });
  document.querySelectorAll('#mBody [data-lk-practice]').forEach(b => b.onclick = () => { const res = lk90Practice(+b.dataset.lkPractice); toast(res.msg); if (res.ok) reload(); });
}
export function lk90Modal() {
  if (!S.fac) return;
  modal(lk90Body(RW()), () => {
    const m = document.querySelector('#modal'), box = document.querySelector('#modal .mbox');
    if (m) m.classList.add('bk90-skill-modal');
    if (box) box.classList.add('bk90-skill-mbox');
    lk90Bind(lk90Modal);
  });
}
window.lk90Modal = lk90Modal;

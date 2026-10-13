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

/* ---------- modal Lĩnh ngộ ---------- */
export function lk90Body(r) {
  const list = SK90();
  if (!list.length) return '<p class="lk90-empty">Môn phái này không có võ công cần Mật Tịch.</p>';
  const lv = learned().lv;
  const rows = list.map(s => {
    const cur = lv[s.id], free = S.reborn > 0;
    const state = cur
      ? `<small class="lk90-on">Đã lĩnh ngộ · cấp ${cur}/${s.max || 20}${free ? ' · luyện không tốn sách?' : ''}</small>`
      : `<small class="dim">${free ? 'Có thể học · không tốn sách' : 'Chưa lĩnh ngộ · dùng Mật Tịch để học'}</small>`;
    return `<div class="lk90-row"><div class="lk90-mid"><b>${esc(s.n)}</b>${state}</div>
      <div class="btnrow">${cur
        ? `<button class="btn sm" data-lk-practice="${s.id}" ${cur >= (s.max || 20) || matHave('misc', 'bk90') < 1 || R.tyvo ? 'disabled' : ''}>Luyện chiêu (−1 Mật Tịch)</button>`
        : `<button class="btn sm" data-lk-learn="${s.id}" ${R.tyvo || (!free && matHave('misc', 'bk90') < 1) ? 'disabled' : ''}>${free ? 'Lĩnh ngộ (miễn phí)' : 'Lĩnh ngộ (−1 Mật Tịch)'}</button>`}</div></div>`;
  }).join('');
  return `<p class="desc">Võ công cấp 90 chỉ mở qua <b>Võ Lâm Mật Tịch</b> — đang có <b>${matHave('misc', 'bk90')}</b> cuốn (trùm từ cấp 90 rơi, hoặc mua ở Kỳ Trân Các). Đã chuyển sinh: lĩnh ngộ <b>miễn phí</b>. Chiêu đã lĩnh ngộ luyện tiếp bằng sách, tối đa cấp ${list[0].max || 20}.</p>${rows}`;
}
export function lk90Bind(reload) {
  document.querySelectorAll('#mBody [data-lk-learn]').forEach(b => b.onclick = () => { const res = lk90Learn(+b.dataset.lkLearn); toast(res.msg); if (res.ok) reload(); });
  document.querySelectorAll('#mBody [data-lk-practice]').forEach(b => b.onclick = () => { const res = lk90Practice(+b.dataset.lkPractice); toast(res.msg); if (res.ok) reload(); });
}
export function lk90Modal() {
  if (!S.fac) return;
  modal(`<h3>Lĩnh ngộ võ công 90 <small>Mật Tịch: ${matHave('misc', 'bk90')}</small></h3>${lk90Body(RW())}`, () => lk90Bind(lk90Modal));
}
window.lk90Modal = lk90Modal;

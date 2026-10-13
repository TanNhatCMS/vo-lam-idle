// @ts-nocheck — port tu nguon v107: hub "Hoat dong giang ho" 3 tab Pho ban/Di thuyen/
// Boss tuan (Bw cua nguon) + modal Ky Tran Cac RIENG (hc cua nguon, footer "← Hoat dong"
// quay lai hub, re-render sau mua giu vi tri cuon). May trang thai pho ban/thuyen/boss
// tuan o hoatdong.ts (j.dg 3 kind nhu ban goc), KTC o ktc.ts, Linh ngo la modal rieng.
import { esc, fmt } from './core';
import { modal } from './ui';
import { RW } from './rewards';
import { S } from './save';
import { dungeonBody, dungeonBind, boatBody, boatBind, weekBossBody, weekBossBind, weekBossBadge, dungeonReady, boatReady, weekBossReady } from './hoatdong';
import { ktcBody, ktcBind, ktcBadge, knbHave } from './ktc';

const HUB_TABS = [
  ['dg', 'Phó bản', 'ui/quick/dungeon.png'],
  ['boat', 'Đi thuyền', 'ui/quick/boat.png'],
  ['wb', 'Boss tuần', 'ui/quick/weekly-boss.png'],
];
let hubTab = 'dg';

/* Fw() cua nguon: event-heading voi vi KNB + Ngan luong */
export function eventHeading(title, sub = '') {
  const r = RW();
  return `<header class="event-heading"><div class="event-heading-copy"><span class="event-eyebrow">GIANG HỒ</span><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
  <div class="event-wallet"><div><img src="img/ep/knb.png" alt=""><span><b>${fmt(r.knb || 0)}</b><small>KNB</small></span></div>
  <div><img src="ui/yuanbao.png" alt=""><span><b>${fmt(S.gold)}</b><small>Ngân lượng</small></span></div></div></header>`;
}

function tabReady(tab) {
  if (tab === 'dg') return dungeonReady();
  if (tab === 'boat') return boatReady();
  return weekBossReady();
}
function tabBody(r) {
  if (hubTab === 'dg') return dungeonBody(r);
  if (hubTab === 'boat') return boatBody(r);
  return weekBossBody(r);
}
function tabBind(reload) {
  if (hubTab === 'dg') return dungeonBind(reload);
  if (hubTab === 'boat') return boatBind(reload);
  return weekBossBind(reload);
}

/* Mo hub Hoat dong giang ho (cac nut nhanh "Pho ban"/"Di thuyen"/"Boss tuan"). */
export function openEventHub(tab) {
  if (!S.fac) return;
  if (HUB_TABS.some(([k]) => k === tab)) hubTab = tab;
  else if (!HUB_TABS.some(([k]) => k === hubTab)) hubTab = 'dg';
  if (!tabReady(hubTab)) hubTab = 'dg';
  const r = RW();
  const tabs = HUB_TABS.map(([k, n, ic]) => {
    let badge = '';
    if (k === 'wb') badge = weekBossBadge();
    return `<button data-event-tab="${k}" class="${k === hubTab ? 'on' : ''}" aria-pressed="${k === hubTab}">
      <img src="${ic}" alt="" onerror="this.style.display='none'"><span>${n}</span>${badge ? `<em>${esc(badge)}</em>` : ''}</button>`;
  }).join('');
  modal(`<div class="event-shell">${eventHeading('Hoạt động giang hồ')}
    <nav class="event-tabs" aria-label="Hoạt động">${tabs}</nav>
    <div class="event-content" id="eventBody">${tabBody(r)}</div>
    <footer class="event-footer"><span>${hubTab === 'wb' ? 'Mỗi tuần một trùm · một rương thưởng' : 'Lượt làm mới mỗi ngày'}</span>
    <button class="btn event-secondary" id="eventShop"><img src="img/ep/knb.png" alt="">Kỳ Trân Các<span aria-hidden="true"> →</span></button></footer></div>`, () => {
    document.querySelectorAll('#mBody [data-event-tab]').forEach(x => x.onclick = () => openEventHub(x.dataset.eventTab));
    tabBind(openEventHub);
    const shop = document.querySelector('#mBody #eventShop');
    if (shop) shop.onclick = () => openKtcModal();
  });
  const m = document.getElementById('modal');
  if (m) m.classList.add('giang-ho-event-modal');
}

/* hc() cua nguon: modal Ky Tran Cac rieng, footer "← Hoat dong" quay lai hub,
   re-render sau mua/ban giu vi tri cuon (scroll param nhu hc(n)). */
export function openKtcModal(scroll = 0) {
  if (!S.fac) return;
  const r = RW();
  modal(`<div class="event-shell">${eventHeading('Kỳ Trân Các', S.chal === 'white' ? 'Ưu đãi Bố Y · giảm 50% giá vật phẩm' : 'Dưỡng sức hành tẩu · kỳ trân bên mình')}
    <div class="event-content" id="eventBody">${ktcBody(r)}</div>
    <footer class="event-footer"><span>Kỳ trân trong túi · sẵn sàng lên đường</span>
    <button class="btn event-secondary" id="eventBack">← Hoạt động</button></footer></div>`, () => {
    const c = document.querySelector('#mBody .event-content');
    if (c) c.scrollTop = Math.max(0, Number(scroll) || 0);
    ktcBind(s => openKtcModal(s));
    const back = document.querySelector('#mBody #eventBack');
    if (back) back.onclick = () => openEventHub();
  });
  const m = document.getElementById('modal');
  if (m) m.classList.add('giang-ho-event-modal');
}
window.openEventHub = openEventHub;
window.openKtcModal = openKtcModal;

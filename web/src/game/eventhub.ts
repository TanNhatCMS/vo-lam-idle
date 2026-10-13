// @ts-nocheck — port tu nguon v107: hub "Hoat dong giang ho" gom 4 tab
// Pho ban / Di thuyen / Boss tuan / Ky Tran Cac. May trang thai pho ban/thuyen/boss
// tuan o hoatdong.ts (j.dg 3 kind nhu ban goc), KTC o ktc.ts.
import { esc, fmt } from './core';
import { closeModal, modal } from './ui';
import { RW } from './rewards';
import { S } from './save';
import { dungeonBody, dungeonBind, boatBody, boatBind, weekBossBody, weekBossBind, weekBossBadge, dungeonReady, boatReady, weekBossReady } from './hoatdong';
import { lk90Body, lk90Bind, lk90Ready } from './lk90';
import { ktcBody, ktcBind, ktcBadge, knbHave } from './ktc';

const HUB_TABS = [
  ['dg', 'Phó bản', 'ui/quick/tower.png'],
  ['boat', 'Đi thuyền', 'ui/quick/quest.png'],
  ['wb', 'Boss tuần', 'ui/quick/spare.png'],
  ['ktc', 'Kỳ Trân Các', 'img/ep/knb.png'],
  ['lk90', 'Lĩnh ngộ', 'ui/quick/encyclopedia.png'],
];
let hubTab = 'dg';

function tabReady(tab) {
  if (tab === 'dg') return dungeonReady();
  if (tab === 'boat') return boatReady();
  if (tab === 'wb') return weekBossReady();
  if (tab === 'lk90') return lk90Ready();
  return true;
}
function tabBody(r) {
  if (hubTab === 'dg') return dungeonBody(r);
  if (hubTab === 'boat') return boatBody(r);
  if (hubTab === 'wb') return weekBossBody(r);
  if (hubTab === 'lk90') return lk90Body(r);
  return ktcBody(r);
}
function tabBind(reload) {
  if (hubTab === 'dg') return dungeonBind(reload);
  if (hubTab === 'boat') return boatBind(reload);
  if (hubTab === 'wb') return weekBossBind(reload);
  if (hubTab === 'lk90') return lk90Bind(reload);
  return ktcBind(reload);
}

/* Mo hub Hoat dong giang ho (cac nut nhanh "Pho ban"/"Di thuyen"/"Boss tuan"/"Ky Tran Cac"). */
export function openEventHub(tab) {
  if (!S.fac) return;
  if (['dg', 'boat', 'wb', 'ktc', 'lk90'].includes(tab)) hubTab = tab;
  else if (!HUB_TABS.some(([k]) => k === hubTab)) hubTab = 'dg';
  if (!tabReady(hubTab)) hubTab = 'dg';
  const r = RW();
  const tabs = HUB_TABS.map(([k, n, ic]) => {
    let badge = '';
    if (k === 'wb') badge = weekBossBadge();
    else if (k === 'ktc') badge = ktcBadge();
    return `<button data-event-tab="${k}" class="${k === hubTab ? 'on' : ''}" aria-pressed="${k === hubTab}">
      <img src="${ic}" alt="" onerror="this.style.display='none'"><span>${n}</span>${badge ? `<em>${esc(badge)}</em>` : ''}</button>`;
  }).join('');
  modal(`<div class="event-shell"><h3>Hoạt động giang hồ <small>Kim Nguyên Bảo ${fmt(knbHave())}</small></h3>
    <nav class="event-tabs" aria-label="Hoạt động">${tabs}</nav>
    <div id="eventBody">${tabBody(r)}</div></div>`, () => {
    document.querySelectorAll('#mBody [data-event-tab]').forEach(x => x.onclick = () => openEventHub(x.dataset.eventTab));
    tabBind(openEventHub);
  });
  const m = document.getElementById('modal');
  if (m) m.classList.add('giang-ho-event-modal');
}
window.openEventHub = openEventHub;

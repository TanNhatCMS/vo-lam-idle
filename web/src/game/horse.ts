// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { $, ATTR_ID, INV_MAX, J, RAR_COL, attrText, clamp, esc, fmt } from './core';
import { addItem, log, toast } from './ui';
import { dropToGround } from './loot';
import { stashRead } from './stash';
import { R } from './combat';
import { RW } from './rewards';
import { S, save } from './save';

/* ======================= THAN MA CAC: NGU DAI THAN MA + DANH MA =======================
   Port tu js/horse.js ban vinarpg. Than Ma la vat pham ngua Hoang Kim rieng (d = 10),
   co than luc co dinh (leg: true — luon kich hoat theo co che dong an cua ban minh),
   khoa bao ve, So Than Ma (thu phi Phuc Duyen lan dau, thinh lai bang luong) va
   thuan duong khi dang cuoi. Dieu khien: phim M len/xuong ngua. */
'use strict';
export const THAN_MA = [
  ['ovan', 5, 'Ô Vân Đạp Tuyết', 'Ô Vân Đạp Tuyết', 60, 1, [['coldres_p', 15], ['lifemax_p', 5], ['five_elements_resist_v', 10]], 'Ngựa đen bốn vó trắng như tuyết, mang linh khí hệ Thủy.'],
  ['xtho', 5, 'Xích Thố', 'Xích Thố', 60, 1, [['fireres_p', 15], ['attackspeed_v', 6], ['deadlystrikeenhance_p', 4]], 'Ngày đi nghìn dặm, bờm đỏ rực như lửa.'],
  ['tanh', 5, 'Tuyệt Ảnh', 'Tuyệt Ảnh', 60, 1, [['physicsres_p', 10], ['attackratingenhance_p', 15], ['ignoredefense_p', 6]], 'Thân ảnh thoắt ẩn thoắt hiện, ra đòn chuẩn xác.'],
  ['dlo', 5, 'Đích Lô', 'Đích Lô', 60, 1, [['poisonres_p', 15], ['steallifeenhance_p', 3], ['lifereplenish_v', 25]], 'Danh mã từng cứu chủ vượt suối Đàn Khê.'],
  ['cdsu', 5, 'Chiếu Dạ Ngọc Sư Tử', 'Chiếu Dạ Ngọc Sư Tử', 60, 1, [['lightingres_p', 15], ['lucky_v', 15], ['meleedamagereturn_p', 6]], 'Ánh bạc rực sáng giữa đêm, linh mã hệ Thổ.'],
  ['pvan', 8, null, 'Phi Vân', 70, 2, [['allres_p', 6], ['attackspeed_v', 6], ['lifemax_p', 6]], 'Lướt gió như mây, cân bằng công thủ.'],
  ['btieu', 6, null, 'Bôn Tiêu', 70, 2, [['lifemax_p', 8], ['steallifeenhance_p', 4], ['manamax_p', 6]], 'Phi nước đại bền bỉ, tiếp sức cho chủ nhân.'],
  ['xlc', 9, null, 'Xích Long Câu', 80, 3, [['deadlystrikeenhance_p', 8], ['attackspeed_v', 8], ['five_elements_enhance_v', 15]], 'Long câu đỏ rực, sinh ra để xung trận.'],
  ['duhuy', 11, null, 'Du Huy', 80, 3, [['lifemax_p', 10], ['meleedamagereturn_p', 10], ['lifereplenish_v', 40]], 'Ánh sáng lấp lánh phủ dọc bờm ngựa.'],
  ['tdia', 10, null, 'Tuyệt Địa', 80, 3, [['ignoredefense_p', 10], ['attackratingenhance_p', 20], ['lucky_v', 20]], 'Chân không chạm đất, xé gió xuyên phòng tuyến.'],
  ['dvu', 12, null, 'Đằng Vụ', 85, 3, [['five_elements_resist_v', 20], ['allres_p', 5], ['manamax_p', 10]], 'Cưỡi mây mù, vững vàng trước ngũ hành.'],
  ['squang', 13, null, 'Siêu Quang', 85, 3, [['attackspeed_v', 10], ['deadlystrikeenhance_p', 6], ['lifemax_p', 6]], 'Nhanh hơn ánh chớp, hỗ trợ dồn sát thương.'],
  ['pvu', 7, null, 'Phiên Vũ', 90, 4, [['allres_p', 8], ['steallifeenhance_p', 5], ['attackspeed_v', 8], ['lifemax_p', 6]], 'Thần mã tựa cánh chim, vừa nhanh vừa dẻo dai.'],
  ['hhlc', 18, null, 'Hãn Huyết Long Câu', 92, 4, [['lifemax_p', 12], ['deadlystrikeenhance_p', 8], ['five_elements_enhance_v', 20], ['steallifeenhance_p', 4]], 'Mồ hôi đỏ như máu, khí thế áp đảo chiến trường.'],
  ['bhv', 16, null, 'Kim Tinh Bạch Hổ Vương', 95, 4, [['allres_p', 10], ['meleedamagereturn_p', 12], ['lifemax_p', 10], ['attackspeed_v', 8]], 'Bạch hổ vương hộ chủ, công thủ đều mạnh.'],
  ['pvtm', 21, null, 'Phong Vân Thần Mã', 97, 4, [['allres_p', 12], ['attackspeed_v', 10], ['deadlystrikeenhance_p', 8], ['lifemax_p', 10]], 'Thần mã trấn hội Phong Vân, báu vật tối thượng.'],
];
export const THAN_MA_TOTAL = THAN_MA.length;
const THAN_MA_TIER = { 1: { n: 'Ngũ Đại Thần Mã', fd: 120, gold: 60000 }, 2: { n: 'Danh Mã', fd: 200, gold: 120000 },
  3: { n: 'Bảo Mã', fd: 320, gold: 250000 }, 4: { n: 'Thần Mã Tối Thượng', fd: 500, gold: 500000 } };
export const THAN_MA_MAX = 20, THAN_MA_TRAIN_BONUS = 0.03, THAN_MA_FEED_XP = 30;
const thanMaDef = id => THAN_MA.find(t => t[0] === id);
function thanMaRow(def) {
  if (!def || !J.items[10]) return null;
  const name = def[2] && def[2].normalize('NFC').toLowerCase();
  return J.items[10].list.find(r => r.k === def[1] && (!name || r.n.normalize('NFC').toLowerCase() === name));
}
export const isThanMa = it => !!(it && it.d === 10 && it.thanma && thanMaDef(it.thanma));
export const horseLevel = it => clamp(Math.floor(+(it && it.hlv) || 0), 0, THAN_MA_MAX);
const horseXpNeed = lv => 100 + lv * 30;
function thanMaBook() {
  const r = RW();
  if (!r.tmBook || typeof r.tmBook !== 'object' || Array.isArray(r.tmBook)) r.tmBook = {};
  return r.tmBook;
}
export function thanMaBookCount() { return Object.keys(thanMaBook()).filter(k => thanMaDef(k) && thanMaBook()[k]).length; }
function thanMaLocation(id) {
  const match = it => isThanMa(it) && it.thanma === id;
  if (S.inv.some(match)) return 'Đang ở hành trang';
  if (Object.values(S.eq || {}).some(match)) return 'Đang trang bị';
  if (stashRead().st.items.some(match)) return 'Đang trong kho chung · lấy ra để sử dụng';
  return '';
}
function thanMaOwns(id) { return !!thanMaLocation(id); }
function thanMaPending(id) { return R.ground.some(d => isThanMa(d.it) && d.it.thanma === id); }
function thanMaCost(def) {
  const t = THAN_MA_TIER[def[5]];
  return { fd: t.fd, gold: Math.round(t.gold) };
}
/* Thuần dưỡng: nhân giá trị base của ngựa (chỉ số gốc), dòng trừ phòng thủ giữ nguyên dấu kém đi */
export function thanMaBaseValue(it, id, value) {
  if (!it || it.d !== 10 || horseLevel(it) <= 0) return value;
  const lv = horseLevel(it), name = J.attr[id] || '';
  if (name === 'adddefense_v' && value < 0) return value * Math.max(0, 1 - lv * 0.05);
  return value * (1 + lv * THAN_MA_TRAIN_BONUS);
}
function thanMaRegister(it, quiet = false) {
  if (!isThanMa(it)) return false;
  const book = thanMaBook(), first = !book[it.thanma];
  book[it.thanma] = 1;
  if (first) {
    if (!quiet) log(`📜 Sổ Thần Mã: khai danh <b>${esc(it.n)}</b> (${thanMaBookCount()}/${THAN_MA.length})`);
    R.dirty = true;
  }
  return first;
}
function makeThanMa(id) {
  const def = thanMaDef(id), g = J.items[10]; if (!def || !g) return null;
  const row = thanMaRow(def); if (!row) return null;
  const base = [];
  const aliases = { lifemax_yan_v: 'lifemax_v', allres_yan_p: 'allres_p' };
  for (const [rawId, mn, mx] of row.base) {
    const rawName = J.attr[rawId] || '';
    if (['staminamax_v', 'skill_enhance'].includes(rawName)) continue;
    const id0 = ATTR_ID[aliases[rawName] || rawName]; if (id0 === undefined) continue;
    const v = rawName === 'adddefense_v' ? Math.abs(mn) : mn;
    const vx = rawName === 'adddefense_v' ? Math.abs(mx) : mx;
    const same = base.find(x => x[0] === id0);
    if (same) { same[1] += v; same[2] += vx; } else base.push([id0, v, vx]);
  }
  const mag = def[6].filter(([name]) => ATTR_ID[name] !== undefined)
    .map(([name, value]) => ({ a: ATTR_ID[name], p: [value, 0, 0] }));
  return { uid: S.uid++, d: 10, k: def[1], p: row.p, n: def[3], ic: row.ic || '', lvl: 10, s: -1,
    price: row.price || 100000, base, req: [[36, def[4]]], mag, r: 4, thanma: def[0], locked: true, leg: true, hlv: 0, hxp: 0 };
}
function thanMaClaim(id) {
  const def = thanMaDef(id); if (!def) return { ok: false, msg: 'Không tìm thấy Thần Mã này.' };
  if (S.lvl < def[4]) return { ok: false, msg: `Cần đạt cấp ${def[4]} mới thỉnh được ${def[3]}.` };
  if (thanMaOwns(id)) return { ok: false, msg: `Bạn đang sở hữu ${def[3]} rồi.` };
  if (thanMaPending(id)) return { ok: false, msg: `${def[3]} đang nằm trên bản đồ. Hãy nhặt trước khi thỉnh thêm.` };
  if (S.inv.length >= INV_MAX) return { ok: false, msg: 'Hành trang đầy. Hãy trống một ô trước khi thỉnh Thần Mã.' };
  const book = thanMaBook(), cost = thanMaCost(def), reclaim = !!book[id];
  if (!reclaim && RW().fd < cost.fd) return { ok: false, msg: `Cần ${cost.fd} Phúc Duyên (hiện có ${RW().fd}).` };
  if (S.gold < cost.gold) return { ok: false, msg: `Cần ${fmt(cost.gold)} lượng (hiện có ${fmt(S.gold)}).` };
  const it = makeThanMa(id); if (!it) return { ok: false, msg: 'Thần Mã này hiện chưa thể thỉnh.' };
  if (!reclaim) RW().fd -= cost.fd; S.gold -= cost.gold;
  addItem(it, true, true, true); thanMaRegister(it);
  R.dirty = true; save();
  const msg = reclaim ? `Đã thỉnh lại ${it.n}.` : `Đã thỉnh ${it.n} về hành trang.`;
  log(`🐎 <b style="color:${RAR_COL[4]}">${esc(msg)}</b>`); toast(msg);
  return { ok: true, msg, it };
}
/* Danh mã giáng thế trên đất (dành cho sự kiện sau; hiện chưa gọi từ drop quái) */
function thanMaDrop(id, at) {
  const def = thanMaDef(id); if (!def || thanMaOwns(id) || S.lvl < def[4]) return false;
  if (thanMaPending(id)) return false;
  const it = makeThanMa(id); if (!it) return false;
  dropToGround(it, at);
  log(`✨ <b style="color:${RAR_COL[4]}">${esc(it.n)} giáng thế!</b> Hãy nhặt lấy để ghi danh vào Sổ Thần Mã.`); toast(`${it.n} đã hiện thế trên bản đồ!`);
  return true;
}
/* Cưỡi ngựa (phím M): khi cưỡi, ngựa nhận kinh nghiệm mỗi lần hạ quái */
export function toggleRide() {
  const it = S.eq && S.eq.horse;
  if (!it) { toast('Chưa trang bị ngựa'); return; }
  S.ride = S.ride === false;
  R.dirty = true;   // recalc lai de bo hinh nhan vat cap nhat tu the cuoi/khong cuoi
  toast(S.ride !== false ? `Đã lên ngựa: ${it.n}` : 'Đã xuống ngựa');
  save();
}
export function thanMaOnKill(e) {
  const mount = S.eq && S.eq.horse;
  if (mount && S.ride !== false) horseGainXp(e.goldBoss ? 20 : e.cls === 'boss' ? 10 : e.cls === 'elite' ? 3 : 1);
}
function horseFeedCost(it) { return Math.round(2500 + horseLevel(it) * 1800); }
function horseGainXp(amount) {
  const it = S.eq && S.eq.horse; if (!it || horseLevel(it) >= THAN_MA_MAX) return false;
  it.hxp = Math.max(0, +it.hxp || 0) + amount; let levels = 0;
  while (horseLevel(it) < THAN_MA_MAX && it.hxp >= horseXpNeed(horseLevel(it))) {
    it.hxp -= horseXpNeed(horseLevel(it)); it.hlv = horseLevel(it) + 1; levels++;
  }
  if (horseLevel(it) >= THAN_MA_MAX) it.hxp = 0;
  if (levels) {
    R.dirty = true; save();
    const label = isThanMa(it) ? 'Thần Mã' : 'Ngựa', msg = `${it.n} thuần dưỡng lên cấp ${it.hlv}/${THAN_MA_MAX} · chỉ số gốc +${Math.round(it.hlv * THAN_MA_TRAIN_BONUS * 100)}%`;
    log(`<b class="up">${esc(msg)}</b>`); if (!R.quiet) toast(msg);
  }
  return levels > 0;
}
function horseFeed(times = 1) {
  const it = S.eq && S.eq.horse; if (!it) return { ok: false, msg: 'Hãy trang bị ngựa trước.' };
  let n = 0, spent = 0;
  for (; n < times && horseLevel(it) < THAN_MA_MAX; n++) {
    const cost = horseFeedCost(it); if (S.gold < cost) break;
    S.gold -= cost; spent += cost; horseGainXp(THAN_MA_FEED_XP);
  }
  if (!n) return { ok: false, msg: horseLevel(it) >= THAN_MA_MAX ? 'Ngựa đã thuần dưỡng tối đa.' : 'Không đủ ngân lượng để cho ngựa ăn.' };
  R.dirty = true; save();
  return { ok: true, msg: `Cho ${it.n} ăn ${n} lần · −${fmt(spent)} lượng · cấp ${horseLevel(it)}/${THAN_MA_MAX}.` };
}
function thanMaCard(def) {
  const [id, , , name, req, tier, attrs, lore] = def, t = THAN_MA_TIER[tier], row = thanMaRow(def);
  const location = thanMaLocation(id), held = !!location, pending = thanMaPending(id), registered = !!thanMaBook()[id], canLevel = S.lvl >= req, cost = thanMaCost(def);
  const canPay = registered ? S.gold >= cost.gold : RW().fd >= cost.fd && S.gold >= cost.gold;
  const button = held ? '<button class="btn sm" disabled>Đang sở hữu</button>' : pending ? '<button class="btn sm" disabled>Đang chờ nhặt</button>' : !canLevel ? `<button class="btn sm" disabled>Cần cấp ${req}</button>` : !canPay ? '<button class="btn sm" disabled>Thiếu tài nguyên</button>' : `<button class="btn sm" data-tm-claim="${id}">${registered ? 'Thỉnh lại' : 'Thỉnh · ' + cost.fd + ' PD'}</button>`;
  const effects = attrs.map(([attr, val]) => `<span class="tm-effect">${esc(attrText(attr, [val, 0, val]).replace(/<enter>/gi, ' · '))}</span>`).join('');
  const image = row && row.ic ? `<img src="${esc(row.ic)}" alt="" loading="lazy">` : '<span>🐎</span>';
  return `<article class="tm-card tier-${tier}${held ? ' owned' : ''}${canLevel ? '' : ' locked'}"><div class="tm-card-top"><div class="tm-portrait">${image}</div><div class="tm-card-title"><small>${esc(t.n)} · Cấp ${req}+</small><b>${esc(name)}</b><span>${pending ? '✨ Đã hiện thế trên bản đồ · hãy nhặt lấy' : registered ? '📜 Đã ghi Sổ Thần Mã' : esc(lore)}</span></div></div><div class="tm-effects">${effects}</div><div class="tm-card-bottom"><small>${held ? esc(location) : pending ? 'Vật phẩm đang chờ bạn nhặt' : registered ? `Thỉnh lại miễn Phúc Duyên · ${fmt(cost.gold)} lượng` : `${cost.fd} Phúc Duyên · ${fmt(cost.gold)} lượng`}</small>${button}</div></article>`;
}
export function thanMaBody() {
  const book = thanMaBook(), n = thanMaBookCount(), pct = Math.round(n / THAN_MA.length * 100), horse = S.eq && S.eq.horse;
  const tiers = [...new Set(THAN_MA.map(d => d[5]))];
  const catalog = tiers.map(tier => `<h4 class="tm-tier-heading">${esc(THAN_MA_TIER[tier].n)} <small>${THAN_MA.filter(d => d[5] === tier).length} danh mã</small></h4><div class="tm-grid">${THAN_MA.filter(d => d[5] === tier).map(thanMaCard).join('')}</div>`).join('');
  const hLevel = horseLevel(horse), need = horse ? horseXpNeed(hLevel) : 0, xp = horse ? Math.floor(+horse.hxp || 0) : 0;
  const training = horse ? `<section class="tm-training"><div><b>🐎 Thuần dưỡng · ${esc(horse.n)}</b><small>Cấp ${hLevel}/${THAN_MA_MAX} · chỉ số gốc +${Math.round(hLevel * THAN_MA_TRAIN_BONUS * 100)}%${hLevel < THAN_MA_MAX ? ` · ${xp}/${need} kinh nghiệm` : ' · đã đạt tối đa'}</small>${hLevel < THAN_MA_MAX ? `<div class="tm-xp"><i style="width:${Math.min(100, xp / need * 100)}%"></i></div>` : ''}</div><div class="btnrow"><button class="btn sm" id="tmFeed" ${hLevel < THAN_MA_MAX && S.gold >= horseFeedCost(horse) ? '' : 'disabled'}>Cho ăn · ${fmt(horseFeedCost(horse))} lượng</button><button class="btn sm" id="tmFeed10" ${hLevel < THAN_MA_MAX && S.gold >= horseFeedCost(horse) ? '' : 'disabled'}>Cho ăn ×10</button></div></section>` : '<div class="tm-training dim">Trang bị một con ngựa để mở thuần dưỡng. Khi cưỡi (phím M), ngựa nhận kinh nghiệm mỗi lần hạ quái.</div>';
  return `<div class="tm-intro"><div class="tm-seal">🐎</div><div><h3>Thần Mã Các</h3><p>Thỉnh danh mã về cùng chinh chiến. Mỗi Thần Mã sở hữu bộ thần lực riêng, được khóa bảo vệ và có thể cưỡi ngay khi đủ cấp. Thỉnh về hành trang, chọn Trang bị rồi bấm M để lên ngựa.</p></div></div>
    <div class="tm-progress"><div><b>Sổ Thần Mã</b><small>${n}/${THAN_MA.length} đã khai danh · ${pct}%</small></div><div class="tm-xp"><i style="width:${pct}%"></i></div><small>Thu thập mỗi danh mã: +1% sinh lực (tối đa +10%). Đủ 5: +2% kháng tất cả · đủ 10: +3% tốc độ di chuyển · đủ ${THAN_MA.length}: +10 may mắn.</small></div>
    <div class="tm-how"><b>Đường tìm Thần Mã</b><span>Thỉnh lần đầu bằng Phúc Duyên + ngân lượng; sau khi khai danh trong Sổ, có thể thỉnh lại bằng ngân lượng.</span><small>Chọn danh mã trong danh sách và đạt đủ cấp yêu cầu. Thần Mã không rơi từ quái, trùm hay Tháp thử thách. Ngựa tự khóa để tránh bị tự bán.</small></div>
    ${training}<div class="tm-catalog">${catalog}</div>`;
}
export function thanMaBind(refresh) {
  document.querySelectorAll('#mBody [data-tm-claim]').forEach(b => b.onclick = () => {
    const r = thanMaClaim(b.dataset.tmClaim); if (!r.ok) toast(r.msg); refresh();
  });
  const feed = $('#tmFeed'); if (feed) feed.onclick = () => { const r = horseFeed(1); toast(r.msg); refresh(); };
  const feed10 = $('#tmFeed10'); if (feed10) feed10.onclick = () => { const r = horseFeed(10); toast(r.msg); refresh(); };
}

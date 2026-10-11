// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { uiSfx } from './audio';
import { H, R } from './combat';
import { jrDrop } from './journal';
import { manual } from './control';
import {
  $,
  DETAIL_SLOT,
  FAC,
  INV_MAX,
  J,
  PLAT_STEP,
  RAR_COL,
  RAR_VI,
  SERIES,
  SLOT_VI,
  WORLD,
  attrName,
  attrText,
  clamp,
  enhMul,
  esc,
  fmt,
  inWorld,
  irnd,
  pick,
  rnd,
  wpick,
} from './core';
import { obsSteer } from './mapobs';
import { petActive, questTick } from './rewards';
import { S } from './save';
import { goldEnhance, setCounts, setMembers } from './sets';
import { hiddenActive, sexOk, sexReqOk, slotOfEquipped, wrongFaction } from './stats';
import { addItem, betterThanEquipped, log, setInvDirty, toast } from './ui';
import { canFuse, canPlatBase, enchaseCheck, fuseCost, mats, oreParse, VIO_SLOTS } from './recipes';
import { RCP } from './rcp';
import { invMax, invUsed } from './invs';
import { randomForgeProfile } from './forge';
/* forge.ts chua export RF_MUC / oreLabel (phan vung FORGE) — dung namespace de goiY
   co the dung chung, co guard typeof giong ban goc; khi forge.ts export thi tu sang */
import * as forgeNS from './forge';

/* ======================= ROI DO (settings/droprate/*.ini + magicattriblevel.txt) ======================= */
'use strict';
const FACTION_WEAPON_SHARE = 0.5;
/* Ten thuoc tinh chuan hoa (giong core.js: bo hậu tố _yan) — dung khi so sanh voi nhom loc */
const canonAttr = n => n.replace('_yan', '');
export function dropFile(L) {
  const b = L < 110 ? clamp(Math.floor(L / 10) * 10, 10, 90) : (L < 119 ? 110 : 119);
  return J.drop['npcdroprate' + b + '.ini'] || J.drop['npcdroprate.ini'];
}
/* He so vang theo cap: noi suy nhan giua MONEY_BASE va MONEY_TOP (MoneyScale cao nhat cua cac tep roi do)
   trong khoang cap 100-130 — dung cho gia mo rong hanh trang / kho cho bám theo luongvang kỳ vọng. */
const MONEY_BASE = 50, MONEY_TOP = Math.max(MONEY_BASE, ...Object.values(J.drop).map(f => (f.main && f.main.MoneyScale) || MONEY_BASE)), MONEY_RAMP = [100, 130];
export function moneyScale(L, file) {
  if (MONEY_TOP <= MONEY_BASE) return (file.main.MoneyScale || MONEY_BASE);
  return MONEY_BASE * Math.pow(MONEY_TOP / MONEY_BASE, clamp((L - MONEY_RAMP[0]) / (MONEY_RAMP[1] - MONEY_RAMP[0]), 0, 1));
}
export const goldRateScale = (L = S.lvl) => moneyScale(L, dropFile(L)) / MONEY_BASE;
/* Cap vat pham 1..10 theo cap quai, gioi han boi MinItemLevel/MaxItemLevel cua tep roi do */
function itemTier(L, df) {
  const m = df.main;
  return clamp(Math.round(L / 12) + irnd(-1, 1), m.MinItemLevel || 1, m.MaxItemLevel || 10);
}
export function baseRow(detail, particular, tier) {
  const g = J.items[detail]; if (!g) return null;
  let rows = g.list.filter(r => r.k === particular);
  if (!rows.length) return null;
  const okRows = rows.filter(r => sexReqOk(r.req)); if (okRows.length) rows = okRows;   // uu tien mon dung gioi tinh nhan vat
  return rows.reduce((b, r) => Math.abs(r.lvl - tier) < Math.abs(b.lvl - tier) ? r : b);
}
/* Thuoc tinh ma thuat theo KItemGenerator::Gen_MagicAttrib + KLibOfBPT (magicattrib.txt, 330 dong):
   dong i = 0,2,4 la tien to (hien), 1,3,5 la hau to (an, can ngu hanh kich hoat); ung vien = dong cung loai tien/hau to,
   he yeu cau (-1 = moi he) bang he cua mon do, cap dong <= cap thuoc tinh, ti le roi theo loai trang bi > nDecide,
   khong trung loai thuoc tinh; chon ngau nhien deu; gia tri ngau nhien trong khoang. */
export function rollMagic(it, levels, lucky = 0) {
  const out = [], used = new Set();
  for (let i = 0; i < levels.length; i++) {
    const pre = i % 2 === 0 ? 1 : 0, lv = levels[i];
    const decide = Math.floor(Math.random() * 100) / (1 + lucky * 20 / 100);
    const cand = J.affix.filter(a => a.pre === pre && (a.s < 0 || a.s === it.s) && a.lvl <= lv && (a.w[it.d] || 0) > decide && !used.has(a.a));
    if (!cand.length) break;
    const a = pick(cand); used.add(a.a);
    const p = a.p.map(([mn, mx]) => mn === -1 && mx === -1 ? -1 : irnd(Math.min(mn, mx), Math.max(mn, mx)));
    out.push({ a: a.a, p, n: a.n, pre });
  }
  return out;
}
function magicCount(cls) {
  const r = Math.random() * 100 - (cls === 'boss' ? 35 : cls === 'elite' ? 12 : 0) - (R.P ? R.P.lucky : 0) * 0.5;
  return r < 3 ? irnd(5, 6) : r < 15 ? irnd(3, 4) : r < 50 ? irnd(1, 2) : 0;
}
/* cap tung dong thuoc tinh (pnaryMALevel): quanh cap mon do, 1..10 */
export const magicLevels = (n, tier) => Array.from({ length: n }, () => clamp(tier + irnd(-1, 0), 1, 10));
function rarityOf(n) { return n >= 3 ? 2 : n >= 1 ? 1 : 0; }   // Tim (3) chi tu Huyen Tinh (recipes.js), do roi ngau nhien toi da Vang
const randomSeries = () => irnd(0, 4); // KItemGenerator: he ngau nhien Kim..Tho neu khong yeu cau he

/* Trang phuc nam / nu nam o cac "particular" khac nhau (vd ao 0..6 nam, 7..13 nu): doi sang loai dung gioi tinh nhan vat */
export function sexPart(detail, part) {
  const g = J.items[detail]; if (!g) return part;
  const rows = g.list.filter(r => r.k === part);
  if (!rows.length || rows.some(r => sexReqOk(r.req))) return part;
  const alt = [...new Set(g.list.filter(r => sexReqOk(r.req)).map(r => r.k))];
  return alt.length ? pick(alt) : part;
}
export function makeItem(detail, particular, tier, nMagic) {
  const b = baseRow(detail, particular, tier); if (!b) return null;
  const it = { uid: S.uid++, d: detail, k: particular, p: b.p, n: b.n, ic: b.ic || '', lvl: b.lvl, s: b.s >= 0 ? b.s : randomSeries(),
    base: b.base.map(x => x.slice()), req: b.req.map(x => x.slice()), price: b.price };
  /* Template khong co he (s < 0) nhung chot san req he (vd "Yeu cau he Tho") -> khi roll he ngau nhien
     thi dong bo yeu cau theo he da roll: ra he nao thi he do mang duoc, het lech he voi he hien thi. */
  if (b.s < 0) {
    const rq = it.req.find(q => q[0] === 37);
    if (rq && rq[1] >= 0) rq[1] = it.s;
  }
  it.mag = rollMagic(it, magicLevels(nMagic, b.lvl), R.P ? R.P.lucky : 0);
  it.r = rarityOf(it.mag.length);
  return it;
}
/* Roi do khi ha quai: so luong theo loai quai, mon theo RandRate/RandRange cua tep droprate */
export function rollDrops(e) {
  const df = dropFile(e.L), items = df.items.filter(x => x[0] === 0 && x[1] <= 9);
  const dm = R.P ? (R.P.dropMul || 1) : 1;   // tam phap Tham Bao cong ti le roi
  const n = e.cls === 'boss' ? 3 : e.cls === 'elite' ? (Math.random() < Math.min(1, 0.5 * dm) ? 1 : 0) : (Math.random() < Math.min(1, 0.1 * dm) ? 1 : 0);
  const out = [];
  for (let i = 0; i < n * (e.bonusDrop || 1); i++) {
    const x = wpick(items, r => r[3]); if (!x) continue;
    let [detail, part] = [x[1], x[2]];
    // JX mua vu khi o tiem; game idle khong co tiem -> mot nua so vu khi roi ra dung loai vu khi cua phai
    const f = FAC[S.fac];
    if (detail <= 1 && f && f.wcode >= 0 && Math.random() < FACTION_WEAPON_SHARE) [detail, part] = f.wcode === 7 ? [1, irnd(0, 2)] : [0, f.wcode === 9 ? 6 : f.wcode];
    part = sexPart(detail, part);
    let it = makeItem(detail, part, itemTier(e.L, df), magicCount(e.cls));
    for (let t = 0; it && !sexOk(it) && t < 6; t++) it = makeItem(detail, part, itemTier(e.L, df), magicCount(e.cls));   // khong roi trang phuc khac gioi tinh
    if (it && sexOk(it)) out.push(it);
  }
  return out;
}
export function moneyDrop(e) {
  const m = dropFile(e.L).main;
  return Math.round((m.MoneyScale || 50) / 10 * e.L * rnd(0.6, 1.4) * (e.cls === 'boss' ? 8 : e.cls === 'elite' ? 2 : 1));
}
export const itemValue = it => Math.round((it.price || 100) / 10 * (1 + it.mag.length * 0.8));
export function itemPower(it) {
  let v = it.lvl * 10;
  for (const [id, mn, mx] of it.base) if (id === 28 || id === 29 || id === 30) v += (mn + mx) / 2;
  for (const m of it.mag) v += 15 + Math.abs(m.p[0]) * 0.6;
  return v * enhMul(it);
}
export function slotFor(it) {
  const s = DETAIL_SLOT[it.d];
  if (s === 'ring') return !S.eq.ring1 ? 'ring1' : !S.eq.ring2 ? 'ring2' : (itemPower(S.eq.ring1) <= itemPower(S.eq.ring2) ? 'ring1' : 'ring2');
  return s;
}
export function itemLines(it) {
  const L = [], dmin = it.base.find(b => b[0] === 28), dmax = it.base.find(b => b[0] === 29), k = enhMul(it);
  if (it.plv) L.push(['h on', `Bạch Kim +${it.plv}: thuộc tính gốc +${Math.round(it.plv * PLAT_STEP * 100)}%`]);
  if (it.enh) L.push(['h on', `Cường hóa +${it.enh}: thuộc tính gốc +${Math.round((k - 1) * 100)}%`]);
  if (dmin) L.push(['b', `Sát thương: ${Math.round(dmin[1] * k)} - ${Math.round((dmax ? dmax[1] : dmin[1]) * k)}`]);
  for (const [id, mn, mx] of it.base) {
    const nm = attrName(id); if (id === 28 || id === 29 || nm === 'durability_v' || nm === 'item_purple' || id === 167) continue;
    L.push(['b', attrText(nm, [Math.round((mn + mx) / 2 * k), 0, Math.round(mx * k)])]);
  }
  const act = typeof hiddenActive === 'function' ? hiddenActive(it) : 0;
  it.mag.forEach((m, i) => {
    const hidden = i % 2 === 1, on = !hidden || Math.floor(i / 2) < act;
    L.push([hidden ? (on ? 'h on' : 'h') : 'm', attrText(attrName(m.a), m.p.map(v => v === -1 ? 0 : v)) + (hidden && !on ? ' (ẩn' + hiddenHint(it, Math.floor(i / 2)) + ')' : '')]);
  });
  if (it.set) {
    const ex = typeof goldEnhance === 'function' ? goldEnhance(it, S.eq) : 0, cnt = typeof setCounts === 'function' ? (setCounts(S.eq)[it.set.grp] || 0) : 0;
    (it.ext || []).forEach((m, i) => L.push([i < ex ? 'h on' : 'h', attrText(attrName(m.a), m.p.map(v => v === -1 ? 0 : v)) + (i < ex ? ' (bộ)' : ` (mặc ${it.set.n1 * (i + 1)} món cùng bộ)`)]));
    L.push(['r', `Bộ ${it.set.kind === 'gold' ? 'Hoàng Kim' : 'Bạch Kim'}: đang mặc ${cnt} món · đủ ${it.set.n2} món mở hết dòng ẩn mọi trang bị`]);
    for (const r of setMembers(it)) L.push(['r', `  ${Object.values(S.eq).some(e => e && e.set && e.n === r.n) ? '✔' : '·'} ${r.n}`]);
  }
  const REQ = { 36: 'Cấp', 32: 'Sức mạnh', 33: 'Thân pháp', 34: 'Sinh khí', 35: 'Nội công', 37: 'Hệ', 38: 'Giới tính', 39: 'Môn phái' };
  for (const [id, v] of it.req) if (REQ[id] && (v > 0 || id === 39)) L.push(['r', `Yêu cầu ${REQ[id]}: ${id === 37 ? SERIES[v] : id === 39 ? ((J.factions[v] || {}).n || v) : v}`]);
  for (const s of goiY(it)) L.push(['r', s]);
  return L;
}
/* ngu hanh tuong sinh va danh sach mon kich hoat dong an (giong stats.ts — chua export,
   dinh nghia lai cuc bo de hiddenHint tinh duoc "can N nguồn hệ ...") */
const ACCRUE = { 0: 2, 2: 1, 1: 3, 3: 4, 4: 0 }; // Kim sinh Thuy, Thuy sinh Moc, Moc sinh Hoa, Hoa sinh Tho, Tho sinh Kim
const ACTIVATED_BY = { helm: ['armor', 'amulet'], armor: ['ring2', 'belt'], belt: ['pendant', 'cuff'], weapon: ['amulet', 'armor'],
  boot: ['weapon', 'helm'], cuff: ['boot', 'ring1'], amulet: ['belt', 'ring2'], ring1: ['weapon', 'helm'], ring2: ['cuff', 'pendant'],
  pendant: ['boot', 'ring1'] };
/* Dien giai dong an: dong thu j (0, 1, 2 = dong 2, 4, 6) can (j + 1) nguồn tuong sinh */
function hiddenHint(it, j) {
  if (it.s == null || it.s < 0) return '';
  const src = Object.keys(ACCRUE).map(Number).find(k => ACCRUE[k] === it.s);       // he sinh ra he cua mon
  if (src === undefined) return '';
  const slot = (typeof slotOfEquipped === 'function' && slotOfEquipped(it, S.eq)) || slotFor(it);
  const links = (ACTIVATED_BY[slot] || []).map(k => SLOT_VI[k]).join(' / ');
  return `: cần ${j + 1} nguồn hệ ${SERIES[src]} (${SERIES[src]} sinh ${SERIES[it.s]}) — nhân vật${links ? ' hoặc món ở ' + links : ''}; đủ bộ cũng mở`;
}
/* C: GOI Y TAN DUNG — luon kem ti le %, hien ngay trong o chu thich trang bi.
   Dung typeof de khong phu thuoc thu tu nap file (recipes.js / forge.js nap sau loot.js). */
function goiY(it) {
  const out = [];
  if (!it) return out;
  const n = (it.mag || []).length;
  if (typeof enchaseCheck === 'function' && typeof mats === 'function' && typeof oreParse === 'function' && typeof VIO_SLOTS === 'number') {
    if (n >= VIO_SLOTS) out.push('Khảm: đã đủ 6 dòng — không khảm thêm được');
    else {
      const hts = Object.keys(mats().ht).map(Number).sort((a, b) => a - b);
      const ores = Object.keys(mats().ore).filter(k => oreParse(k).place === n);
      if (hts.length && ores.length) {
        const row = enchaseCheck(it, hts[0], ores[0]);
        out.push(typeof row === 'string'
          ? `Khảm dòng ${n + 1}/6: ${row}`
          : `Khảm dòng ${n + 1}/6: Huyền Tinh cấp ${hts[0]} + ${typeof forgeNS.oreLabel === 'function' ? forgeNS.oreLabel(ores[0]) : 'khoáng thạch'} · thất bại 5% mất đá`);
      } else out.push(`Khảm dòng ${n + 1}/6: cần Huyền Tinh cấp bất kỳ + khoáng thạch dòng ${n + 1}`);
    }
  }
  if (typeof canFuse === 'function' && canFuse(it)) {
    const dv = (RCP.violet_fuse && RCP.violet_fuse.level_div) || [10, 5];
    const s = (it.lvl || 1) * 3;
    out.push(`Hợp Huyền Tinh: món này + 2 nhẫn/dây chuyền/ngọc bội → Huyền Tinh cấp ~${Math.max(1, Math.floor(s / dv[0]))}–${Math.max(1, Math.floor(s / dv[1]))} · phí ${fmt(typeof fuseCost === 'function' ? fuseCost() : 1000)} lượng`);
  }
  if (typeof canPlatBase === 'function' && canPlatBase(it)) out.push('Chế Bạch Kim: cần 2 món Hoàng Kim GIỐNG NHAU + Thủy Tinh Trắng');
  if (forgeNS.RF_MUC) {
    const profile = typeof randomForgeProfile === 'function' ? randomForgeProfile() : null;
    const tier = profile && profile.reqLevel ? `mốc cấp ${profile.reqLevel}, chỉ số dương +${Math.round((profile.scale - 1) * 100)}%` : 'bậc đồ theo cấp nhân vật';
    out.push(`Rèn ngẫu nhiên ở Lò rèn: ${tier} · mức Khá có ${Math.round(forgeNS.RF_MUC[1].ty * 100)}% thành công (3–4 dòng), trả bằng vàng`);
  }
  return out;
}

/* ======================= DO ROI TREN DAT + BO LOC ======================= */
const GROUND_MAX = 40, PICK_R = 26, GROUND_LIFETIME = 120;
export { GROUND_MAX, GROUND_LIFETIME };
export const LOOT_ATTR_GROUPS = [ // thuoc tinh hay loc (ten trong KMagicDesc.cpp)
  ['Sinh lực', ['lifemax_v', 'lifemax_p', 'lifereplenish_v']], ['Nội lực', ['manamax_v', 'manamax_p', 'manareplenish_v']],
  ['Sát thương', ['skill_enhance', 'enhancehit_rate', 'addphysicsdamage_v', 'addphysicsdamage_p', 'addfiredamage_v', 'addcolddamage_v', 'addlightingdamage_v', 'addpoisondamage_v']],
  ['Kháng', ['sorbdamage_p', 'block_rate', 'physicsres_p', 'poisonres_p', 'coldres_p', 'fireres_p', 'lightingres_p', 'allres_p']],
  ['Chỉ số', ['strength_v', 'dexterity_v', 'vitality_v', 'energy_v']], ['Kỹ năng', ['allskill_v', 'addphysicsmagic_v', 'addcoldmagic_v', 'addfiremagic_v', 'addlightingmagic_v', 'addpoisondamage_v']],
  ['Tốc độ', ['attackspeed_v', 'castspeed_v', 'fastwalkrun_p']], ['Hút máu / nội', ['steallifeenhance_p', 'stealmanaenhance_p']],
  ['Chính xác / né', ['attackratingenhance_v', 'adddefense_v']], ['Ngũ hành', ['metalskill_v', 'woodskill_v', 'waterskill_v', 'fireskill_v', 'earthskill_v']],
];
export function lootFilter() { return S.lootF || (S.lootF = { mode: 'custom', minRar: 2, minReqLvl: 1, groups: [], series: [], auto: true, equipment: true, materials: true, white: false, skipLowSets: false, always: false }); }
/* Cap yeu cau cua mon (req 36); null = khong yeu cau cap */
export function itemRequiredLevel(it) {
  const required = (it && it.req || []).find(([id]) => id === 36);
  return required ? Math.max(0, +required[1] || 0) : null;
}
export function itemLevelBadge(it) {
  const required = itemRequiredLevel(it);
  return required > 0 ? required : '—';
}
export function itemLevelLabel(it) {
  const required = itemRequiredLevel(it);
  return required > 0 ? `yêu cầu cấp ${required} · bậc đồ ${it.lvl}` : `không yêu cầu cấp · bậc đồ ${it.lvl}`;
}
/* Do bo / khoa tay / cuong hoa / Bach Kim da thang cap: khong tu ban, duoc uy tien nhặt */
export function itemProtected(it) { return !!(it && (it.set || it.vio || it.plv || it.locked || (it.enh | 0) > 0)); }
/* Bo loc "bỏ qua bộ yêu cầu cấp thấp hơn nhân vật" (chi Hoàng Kim / Bạch Kim) */
export function isLowSetForAutoLoot(it) {
  if (lootFilter().skipLowSets === false || !it.set || !['gold', 'platina'].includes(it.set.kind)) return false;
  const required = (it.req || []).find(([id]) => id === 36);
  return (required ? required[1] : 0) < S.lvl;
}
/* Ly do mon do khong khop bo loc (rong = khop). Che do Thong minh: do quy, do bo / da bao ve,
   mon manh hon dang mac. Che do Tuy chinh: do hiem, yeu cau cap, hệ, thuoc tinh. */
export function lootMatchReason(it) {
  const f = lootFilter();
  if (!it) return 'Không xác định được món đồ';
  if (f.equipment === false) return 'Đã tắt nhặt trang bị';
  if (it.r === 0 && f.white !== true) return 'Đồ trắng đang tắt';
  if (isLowSetForAutoLoot(it)) return 'Bộ có yêu cầu cấp thấp hơn nhân vật';
  if (f.mode !== 'custom') {
    if (typeof wrongFaction === 'function' && wrongFaction(it)) return 'Trang bị sai môn phái';
    if ((it.r || 0) >= 2) return 'Đồ quý';
    if (itemProtected(it)) return 'Đồ bộ hoặc đồ đã được bảo vệ';
    if (typeof betterThanEquipped === 'function' && betterThanEquipped(it)) return 'Mạnh hơn món đang mặc';
    return 'Chưa nâng sức mạnh cho nhân vật';
  }
  const level = itemRequiredLevel(it) ?? 0;
  if (it.r !== 0 && it.r < f.minRar) return `Độ hiếm thấp hơn ${RAR_VI[f.minRar] || 'đã chọn'}`;
  if (level < f.minReqLvl) return `Yêu cầu cấp thấp hơn ${f.minReqLvl}`;
  if (f.series.length && !f.series.includes(it.s)) return 'Không thuộc hệ đã chọn';
  if (f.groups.length) {
    const want = new Set(f.groups.flatMap(g => (LOOT_ATTR_GROUPS[g] || [0, []])[1]));
    if (!it.mag.some(m => want.has(canonAttr(attrName(m.a))))) return 'Không có thuộc tính đã chọn';
  }
  return '';
}
export function lootMatch(it) { return !lootMatchReason(it); }
export function dropToGround(it, at) {
  const a = rnd(0, Math.PI * 2), d = rnd(10, 26);
  const [x, y] = inWorld(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d);
  R.ground.push({ it, x, y, age: 0 });
  if (R.ground.length > GROUND_MAX) {
    let i = R.ground.findIndex(d => !itemProtected(d.it));               // qua nhieu: ban mon cu nhat chua duoc bao ve
    if (i < 0) i = R.ground.findIndex(d => !d.it.locked && !(d.it.enh > 0));
    if (i >= 0) { const old = R.ground.splice(i, 1)[0]; S.gold += itemValue(old.it); }
  }
  setInvDirty(true);
  if (!R.quiet) uiSfx(it.d <= 1 ? 'dropWeapon' : it.d === 2 || it.d === 7 ? 'dropCloth' : 'dropOther');
  if (it.r >= 2 && !R.quiet) log(`Rơi xuống đất: <span style="color:${RAR_COL[it.r]}">${esc(it.n)}</span>`);
}
/* Hanh trang day: tu ban mon kem nhat (khong phai do bo) neu mon moi tot hon -> treo may lau van thay do moi
   (truoc day tui day la ngung nhat, do tot nam duoi dat roi bi tu ban, nhan vat khong bao gio len do) */
export function makeRoom(it, force) {
  let worst = null;
  // khong bo mon Tim dang kham do (vio), Bach Kim da thang cap (plv), do cua dong hanh (petOnly);
  // mon khoa tay / cuong hoa van luon duoc giu (itemProtected)
  for (const x of S.inv) if (!itemProtected(x) && !x.petOnly && (!worst || itemPower(x) < itemPower(worst))) worst = x;
  if (!worst || (!force && itemPower(worst) >= itemPower(it))) return false;
  S.gold += itemValue(worst); S.inv.splice(S.inv.indexOf(worst), 1); setInvDirty(true);
  return true;
}
function pickUp(drop, quiet) {
  const i = R.ground.indexOf(drop); if (i < 0) return false;
  if (invUsed() >= invMax() && !makeRoom(drop.it)) { if (!quiet) toast('Hành trang đầy'); return false; }
  R.ground.splice(i, 1);
  jrDrop(drop.it);                                          // so tay: do rot theo do hiem
  addItem(drop.it, quiet, true, R.pickTarget === drop); questTick('picked');   // cham tay chon nhat: giu, khong coi la do thua
  if (R.pickTarget === drop) R.pickTarget = null;
  if (R.autoPick === drop) R.autoPick = null;
  return true;
}
/* Nhat: di toi mon tay chon (R.pickTarget) hoac mon tu chon (R.autoPick) khop bo loc —
   che do "cho het quai" (mac dinh) hay "luon di nhat khi do vot" do radio bo loc chon (lootF.always).
   autoPick dat rieng de vong combat tam nhuong di chuyen/attack khi dang di nhat tu dong. */
export function updateGround(dt) {
  for (const d of R.ground) d.age += dt;
  R.ground = R.ground.filter(d => d.age < GROUND_LIFETIME || (d.it && (d.it.locked || d.it.enh > 0)));   // do tren dat chi song GROUND_LIFETIME giay (do khoa / cuong hoa thi giu)
  const lf = lootFilter();
  const gate = lf.auto && !(typeof manual === 'function' && manual()) && (lf.always || !R.enemies.some(e => !e.dead));
  let target = R.pickTarget && R.ground.includes(R.pickTarget) ? R.pickTarget : null;   // tay chon uu tien
  if (!target && R.autoPick && R.ground.includes(R.autoPick)) target = R.autoPick;      // tu chon tu lan truoc
  if (target === R.autoPick && !gate) { R.autoPick = null; target = null; }             // het cua so tu nhat -> bo target (khong keo theo khi co quai)
  if (!target && gate) {
    let best = null, bd = 1e9;
    const full = S.inv.length >= INV_MAX, floor = full ? Math.min(...S.inv.filter(x => !x.set).map(itemPower), Infinity) : -Infinity;
    for (const d of R.ground) { if (d.age < 0.4 || !lootMatch(d.it) || (full && itemPower(d.it) <= floor)) continue; const k = Math.hypot(d.x - H.x, d.y - H.y); if (k < bd) { bd = k; best = d; } }
    if (best) { R.autoPick = best; target = best; }
  }
  if (!target) { R.petLoot = null; return false; }
  /* Dong hanh ra tran: pet tu di nhat do AUTO thay nguoi (nguoi o lai danh quai); nhat tay (pickTarget) van do nguoi
     — theo dung cai dat bo loc (auto / cho het quai / luon di nhat), khong doi luat nhat. */
  if (target !== R.pickTarget && petActive() && R.petPos) {
    R.petLoot = target;
    if (Math.hypot(target.x - R.petPos.x, target.y - R.petPos.y) <= PICK_R) {
      R.petLoot = null;
      if (!pickUp(target, true) && (R.petFullT = (R.petFullT || 0) - 1) <= 0) { R.petFullT = 300; toast('Túi đầy — Đồng hành không nhặt được đồ'); }
    }
    return true;
  }
  R.petLoot = null;
  const dist = Math.hypot(target.x - H.x, target.y - H.y);
  if (dist <= PICK_R) { pickUp(target, true); return true; }
  obsSteer(H, target.x, target.y, 170 * (R.P ? R.P.speed : 1) * dt); H.face = target.x >= H.x ? 1 : -1;
  return true;
}
/* Lay HET do tren dat ve tui (nut o the Hanh trang); het cho thi dung */
export function pickAllGround() {
  let n = 0;
  for (const d of R.ground.slice()) { if (!pickUp(d, true)) break; n++; }
  return n;
}
export function groundAt(x, y) {
  let best = null, bd = 30;
  for (const d of R.ground) { const k = Math.hypot(d.x - x, d.y - (y + 6)); if (k < bd) { bd = k; best = d; } }
  return best;
}
export function saveGround() { S.ground = R.ground.map(d => ({ it: d.it, wx: d.x, wy: d.y })); }
export function restoreGround() { R.ground = (S.ground || []).filter(g => g && g.it).map(g => { const [x, y] = inWorld(g.wx ?? WORLD.w / 2, g.wy ?? WORLD.h / 2); return { it: g.it, x, y, age: 1 }; }); }

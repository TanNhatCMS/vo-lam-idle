// @ts-nocheck — port hệ thống Tỷ Võ Trường từ bản vinarpg (bundle 2026-10-11).
/* Đấu trường mô phỏng: bot client-side (đối thủ = nhân vật cùng cấp, đồ/chiêu theo phái),
   thắng nối tiếp để nhận Võ Huân (rw.vh), chuỗi mạnh dần (powerScale ×1.003/trận),
   mỗi trận 5 phút, chuỗi reset lúc 00:00 giờ Việt Nam.
   Hai hình thức: Tỷ Khí Đồng Môn (cùng phái, 6 mốc thưởng 1 lần) / Giang Hồ Tỷ Võ
   (ngẫu nhiên mười môn phái, 3 cấp khó, thưởng +1/+2/+3 Võ Huân).
   Cửa hàng Tỷ Võ: đổi Võ Huân lấy Huyền Tinh / Thủy Tinh Trắng / Thần Bí Khoáng Thạch.
   Cửa sổ sát thương: mỗi đòn nhận vào tối đa 12% máu, cả cửa sổ 3s tối đa 28%. */
import {
  ELEM, FAC, J, MON, RAR_COL,
  $, clamp, esc, fmt, irnd, pick, rnd,
} from './core';
import { R, H, enemyHit, heal, hitPercent, makeEnemy, recalc, zoneOf } from './combat';
import { S, save } from './save';
import { addItem, closeModal, log, refresh, toast } from './ui';
import { grant, openGiftTab, RW } from './rewards';
import { itemPower, makeItem } from './loot';
import { HT_MAX, matAdd } from './recipes';
import { addText } from './render';
import { backFromTown } from './control';

/* ======================= BẢNG DỮ LIỆU (giống bản gốc) ======================= */
const TVX_RANKS = ['Đệ tử nhập môn', 'Đệ tử nội môn', 'Tinh anh bổn môn', 'Hộ pháp · Đà chủ', 'Cao thủ Bách Nhân Lôi Đài', 'Đại đệ tử chân truyền'];
const TVX_TITLES = ['Đệ tử', 'Đệ tử nội môn', 'Tinh anh', 'Hộ pháp', 'Cao thủ', 'Đại đệ tử chân truyền'];
const TVX_MILESTONE_NAMES = [
  '1 Huyền Tinh theo cấp', '1 Huyền Tinh + 1 Thủy Tinh Trắng', '1 Thần Bí Khoáng Thạch + 1 Tinh Hồng Bảo Thạch',
  '2 Huyền Tinh + 1 Thủy Tinh Trắng', 'Vũ khí thường phù hợp môn phái, cấp dùng được', 'Võ Lâm Mật Tịch + vũ khí phù hợp môn phái (Bố Y nhận Trắng/Xanh)',
];
/* thưởng mốc (nhận 1 lần): Huyền Tinh / mảnh / vũ khí phái */
const TVX_MILESTONE_REWARDS = [
  { ht: 1 }, { ht: 1, mats: { wc: 1 } }, { mats: { mys: 1, thbt: 1 } },
  { ht: 2, mats: { wc: 1 } }, { ht: 2 }, { stackItems: { bk90: 1 } },
];
/* cửa hàng: đổi Võ Huân */
const TVX_SHOP = [
  { cost: 8, name: '1 Huyền Tinh theo cấp', gift: { ht: 1 } },
  { cost: 12, name: '1 Thủy Tinh Trắng', gift: { mats: { wc: 1 } } },
  { cost: 20, name: '1 Thần Bí Khoáng Thạch + 1 Tinh Hồng Bảo Thạch', gift: { mats: { mys: 1, thbt: 1 } } },
];
const VN_MALE = ['Hàn Nhất Kiếm', 'Lăng Thiên', 'Mạc Thanh Phong', 'Dương Hạo Nhiên', 'Bạch Vân Phi', 'Tần Tiểu Long', 'Khúc Lăng', 'Phương Trực', 'Lục Thiếu Du', 'Cổ Nhạn Hành', 'Ngô Phi Ưng', 'Đoàn Chính Hạo', 'Thạch Phá Thiên', 'Cung Bất Bại', 'Viên Thừa Chí', 'Liễu Tàn Dương', 'Tô Cẩm Bằng', 'Bùi Văn Khải', 'Âu Dương Phong Lôi', 'Triệu Huyền Công'];
const VN_FEMALE = ['Liễu Như Yên', 'Tố Tâm', 'Hạ Băng Nhi', 'Mộ Dung Tuyết', 'Lam Nguyệt', 'Diệp Thanh Thanh', 'Thu Ngưng', 'Vân Tịch', 'Đàm Nguyệt Hoa', 'Tiểu Điệp', 'Chu Tử Nhi', 'Bạch Mai Hương', 'Lục Y Y', 'Phượng Linh', 'Nhược Thủy', 'Tử Vân Hi', 'Kiều Diễm Ngọc', 'Hồ Điệp Lan', 'Tuyết Lăng Ba', 'Trúc Thanh Âm'];
const FEMALE_FACS = new Set(['emei', 'cuiyan']);   // phái chỉ có nữ (bản gốc Gx)
const MALE_FACS = new Set(['shaolin', 'tianwang']); // phái chỉ có nam (bản gốc Kx)
const RANGED_FACS = new Set(['tangmen', 'wudu', 'tianren', 'gaibang', 'kunlun', 'cuiyan']);
const TVX_DIFF_NAMES = ['Ngang sức', 'Cao thủ', 'Tông sư'];
const TVX_ROUND_SECONDS = 300;                      // mỗi trận 5 phút
const TVX_MIN_LEVEL = 30;                           // mở ở cấp 30 (Đại đệ tử: cấp 80)
const TVX_GRAND_LEVEL = 80;
const WEAPON_NAMES = ['Kiếm', 'Đao', 'Côn', 'Thương', 'Chùy', 'Song đao', '', 'Ám khí', '', 'Tay không'];
/* số loại (particular) tối đa mỗi ô đồ, theo jdata items */
const PART_MAX = { 0: 6, 1: 2, 2: 28, 3: 0, 4: 1, 5: 3, 6: 1, 7: 13, 8: 1, 9: 1 };
const MAT_NAMES = { wc: 'Thủy Tinh Trắng', mys: 'Thần Bí Khoáng Thạch', thbt: 'Tinh Hồng Bảo Thạch', bk90: 'Võ Lâm Mật Tịch' };

/* Bảng vũ khí / chiêu mở đầu của phái — tính từ jdata như bản gốc:
   starter = chiêu tấn công đầu tiên (req thấp nhất) của phái;
   wcode = mã vũ khí từ addphysicsdamage_p của chiêu bị động req thấp nhất. */
const FAC_TABLE = (() => {
  const DMG = ['physicsenhance_p', 'physicsdamage_v', 'poisondamage_v', 'colddamage_v', 'firedamage_v', 'lightingdamage_v'];
  const okWc = v => [0, 1, 2, 3, 4, 5, 7, 9].includes(v);
  const out = {};
  for (const f of (J.factions || []).filter(x => x.skills && x.skills.length)) {
    const sk = id => J.skills[id];
    const attacks = f.skills.map(sk).filter(s => s && s.enemy && DMG.some(k => s.attr && k in s.attr))
      .sort((a, b) => a.req - b.req || a.id - b.id);
    const starter = attacks.length ? attacks[0].id : 0;
    const passives = f.skills.map(sk).filter(s => s && !s.enemy && s.attr && 'addphysicsdamage_p' in s.attr)
      .sort((a, b) => a.req - b.req || a.id - b.id);
    const loReq = passives.length ? passives[0].req : Infinity;
    const codes = [...new Set(passives.filter(s => s.req === loReq)
      .map(s => s.attr.addphysicsdamage_p[0] && s.attr.addphysicsdamage_p[0][2]).filter(okWc))];
    const a = passives[0] && passives[0].attr.addphysicsdamage_p[0];
    out[f.key] = { starter, weaponCodes: codes, wcode: Array.isArray(a) && okWc(a[2]) ? a[2] : -1 };
  }
  return out;
})();
export const tvWeaponCode = facKey => (FAC_TABLE[facKey] ? FAC_TABLE[facKey].wcode : -1);

/* ======================= TRẠNG THÁI: rw.vh + rw.tv ======================= */
/* Ngày Việt Nam (UTC+7): chuỗi và thắng lợi làm mới lúc 00:00. */
export function tvDay() {
  const d = new Date(Date.now() + 7 * 3600e3);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export function tvResetIn() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 17)); // 00:00 VN = 17:00 UTC
  const n = Math.max(0, Math.ceil((next - now) / 6e4));
  return `${Math.floor(n / 60)} giờ ${n % 60} phút`;
}
/* Đọc + chuẩn hóa tiến độ (bản gốc aS). */
export function tvProgress() {
  const r = RW();
  r.vh = Math.max(0, Math.floor(+r.vh || 0));
  const day = tvDay();
  const t = r.tv || (r.tv = { day, wins: 0, best: 0, school: 0, claimed: {}, history: [] });
  if (t.day !== day) { t.day = day; t.wins = 0; t.best = 0; }
  t.wins = Math.max(0, Math.floor(+t.wins || 0));
  t.best = Math.max(0, Math.floor(+t.best || 0));
  t.school = clamp(Math.floor(+t.school || 0), 0, TVX_RANKS.length);
  t.claimed = t.claimed && typeof t.claimed === 'object' ? t.claimed : {};
  t.history = Array.isArray(t.history) ? t.history.slice(0, 8) : [];
  return t;
}

/* ======================= ĐỐI THỦ (bản gốc cS/oS/sS) ======================= */
function fighterSpec(fac, weaponCode) {   // oS: chỉ tiêu chiến đấu của phái
  const wc = Number.isFinite(+weaponCode) && +weaponCode >= 0 ? +weaponCode : (fac.wcode >= 0 ? fac.wcode : 9);
  return {
    key: fac.key, name: fac.n || 'Võ sĩ giang hồ', series: Number.isFinite(+fac.series) ? +fac.series : 0,
    weaponCode: wc, weaponName: WEAPON_NAMES[wc] || 'Vũ khí môn phái',
    ranged: RANGED_FACS.has(fac.key),
  };
}
function personSpec(facKey, excludeName = null) {   // sS: giới tính + tên nhân vật
  const sex = FEMALE_FACS.has(facKey) ? 1 : MALE_FACS.has(facKey) ? 0 : +(Math.random() < 0.5);
  const list = (sex ? VN_FEMALE : VN_MALE).filter(n => n !== excludeName);
  return { sex, name: pick(list.length ? list : sex ? VN_FEMALE : VN_MALE) };
}
/* Tạo spec đối thủ (bản gốc cS): Đồng Môn = phái mình (vũ khí đang mặc);
   Giang Hồ = phái ngẫu nhiên (khác phái đối thủ trước), danh xướng theo mốc
   (Đồng Môn) hoặc theo chuỗi (Giang Hồ). */
export function makeOpponent(mode, excludeFaction = null, excludePerson = null) {
  const prog = tvProgress();
  const facs = (J.factions || []).filter(f => f.skills && f.skills.length && f.key !== excludeFaction);
  const fac = mode === 'school' ? FAC[S.fac] : pick(facs.length ? facs : (J.factions || []));
  const table = FAC_TABLE[fac.key] || { starter: 0, weaponCodes: [], wcode: -1 };
  const weaponCode = mode === 'school' && fac.key === S.fac
    ? (S.eq.weapon ? (S.eq.weapon.d === 1 ? 7 : S.eq.weapon.k === 6 ? 9 : S.eq.weapon.k) : (table.wcode >= 0 ? table.wcode : 9))
    : pick(table.weaponCodes.length ? table.weaponCodes : [table.wcode >= 0 ? table.wcode : 9]);
  const fs = fighterSpec(fac, weaponCode);
  const streak = mode === 'school' ? 0 : Math.max(0, (R.tyvo && R.tyvo.streak) || 0);
  const step = mode === 'school' ? Math.min(prog.school, TVX_RANKS.length - 1) : streak;
  const rank = mode === 'school' ? TVX_RANKS[step] : ['Võ sĩ giang hồ', 'Cao thủ giang hồ', 'Danh túc võ lâm'][Math.min(2, Math.floor(step / 5))];
  const person = personSpec(fac.key, excludePerson);
  const title = mode === 'school' ? TVX_TITLES[step] : rank;
  const short = String(fac.n).replace(/\s+(?:phái|giáo)$/i, '');
  const full = `${title} ${short}`;
  return {
    mode, factionKey: fac.key, factionName: fac.n, factionTitle: short, series: fs.series,
    ranged: fs.ranged, weaponCode: fs.weaponCode, weaponName: fs.weaponName, rank, title: full,
    sex: person.sex, personName: person.name, name: `${full} · ${person.name}`,
  };
}
let cachedOpponent = null;   // Qx: đối thủ đang chờ (đổi khi đổi mốc/phái)
export function currentOpponent(mode = 'school') {   // lS
  if (!cachedOpponent || cachedOpponent.mode !== mode || (mode === 'school' && cachedOpponent.factionKey !== S.fac)) cachedOpponent = makeOpponent(mode);
  return cachedOpponent;
}
function nextMilestoneName(prog) { return TVX_RANKS[Math.min(prog.school, TVX_RANKS.length - 1)]; }
function pushHistory(prog, entry) { prog.history.unshift({ at: Date.now(), ...entry }); prog.history = prog.history.slice(0, 8); }

/* ======================= ĐỒ CỦA BOT (bản gốc pS/mS/hS) ======================= */
/* Món đồ dùng được cho bot: không phải ngựa (Bố Y), đủ giới tính / cấp / hệ / phái. */
function botItemOk(it, spec, lvl) {
  if (!it) return false;
  if (S.chal === 'white' && it.thanma) return false;
  const fid = FAC[spec.factionKey] ? FAC[spec.factionKey].id : -1;
  for (const pair of it.req || []) {
    const id = pair[0], v = pair[1];
    if (v < 0) continue;
    if (id === 38 && v !== (spec.sex || 0)) return false;
    if (id === 36 && v > lvl) return false;
    if (id === 37 && v !== spec.series) return false;
    if (id === 39 && v !== fid) return false;
  }
  return true;
}
/* Sinh 1 món cho ô đồ (bản gốc mS): detail = ô (0/1 vũ khí, 2 áo, 3 nhẫn, 4 bội,
   5 giày, 6 đai, 7 mũ, 8 hộ uyển, 9 ngọc), particular = loại (null = ngẫu nhiên). */
function botSlotItem(detail, particular, spec, lvl, refItem) {
  if (refItem && botItemOk(refItem, spec, lvl)) return refItem;
  for (let tries = 0; tries < 10; tries++) {
    const tier = clamp(Math.round(lvl / 12), 1, 10);
    const k = particular == null ? irnd(0, PART_MAX[detail] || 0) : particular;
    const it = makeItem(detail, k, tier, 4);
    if (it && botItemOk(it, spec, lvl)) return it;
  }
  return null;
}
/* Bộ đồ của bot (bản gốc hS): vũ khí môn phái + 9 ô còn lại, không ngựa. */
export function botEquipment(spec, lvl) {
  const wcode = spec.weaponCode;
  return {
    weapon: botSlotItem(wcode === 7 ? 1 : 0, wcode === 7 ? null : (wcode === 9 ? 6 : wcode), spec, lvl, null),
    armor: botSlotItem(2, null, spec, lvl, null),
    helm: botSlotItem(7, null, spec, lvl, null),
    belt: botSlotItem(6, null, spec, lvl, null),
    boot: botSlotItem(5, null, spec, lvl, null),
    cuff: botSlotItem(8, null, spec, lvl, null),
    amulet: botSlotItem(4, null, spec, lvl, null),
    ring1: botSlotItem(3, null, spec, lvl, null),
    ring2: botSlotItem(3, null, spec, lvl, null),
    pendant: botSlotItem(9, null, spec, lvl, null),
    horse: null,
  };
}
function botEqPower(eq) {
  let p = 0;
  for (const k in eq || {}) { const it = eq[k]; if (it) p += itemPower(it); }
  return p;
}

/* ======================= HỒ SƠ BOT (bản gốc CS + SS) ======================= */
/* Bản gốc dựng bot bằng cách clone save nhân vật rồi tính lại chỉ số; bản port
   (không clone được binding module) dùng quái Tinh Anh cùng cấp làm nền — đúng
   chuẩn calibration của bản gốc (CS cũng lấy quái tinh anh cùng cấp) — cộng thêm
   hệ số đồ từ bộ đồ đã sinh. Chiêu của bot lấy từ phái (req <= cấp, đúng vũ khí). */
export function combatProfile(spec, botEq) {
  const z = zoneOf(S.stage);
  const mobs = (z.m || []).filter(id => MON[id]);
  const e = makeEnemy(pick(mobs.length ? mobs : [0]), S.lvl, 'elite', H.x, H.y);
  e.series = spec.series;
  /* phụ cấp đồ: mỗi 100 điểm lực đồ → +8% chỉ số (gần tương đương người chơi cùng cấp) */
  const gear = Math.min(1.6, 1 + (botEqPower(botEq) || 0) / 100);
  e.def = Math.round(e.def * gear);
  e.ar = Math.round(e.ar * gear);
  for (const k of ELEM) e.res[k] = Math.min(75, Math.round((e.res[k] || 0) * gear));
  e.regen = 0.02 * gear;
  e.dmg *= gear;
  return e;
}
/* Chiêu bot: chiêu tấn công của phái, req <= cấp, đúng vũ khí, mạnh nhất (bản gốc SS). */
function botSkills(spec, lvl) {
  const fac = FAC[spec.factionKey];
  if (!fac) return [];
  const wc = spec.weaponCode;
  return fac.skills.map(id => J.skills[id]).filter(s =>
    s && s.enemy && s.req <= lvl && (s.weapon == null || s.weapon === wc || wc === 9) &&
    (s.attr.physicsdamage_v || s.attr.poisondamage_v || s.attr.colddamage_v || s.attr.firedamage_v || s.attr.lightingdamage_v || s.attr.physicsenhance_p))
    .sort((a, b) => b.req - a.req || b.id - a.id).slice(0, 3)
    .map(s => ({ id: s.id, n: s.n, L: clamp(1 + Math.floor((lvl - s.req) / 3), 1, s.max || 20), series: s.series >= 0 ? s.series : spec.series, radius: s.radius || 90 }));
}
/* Lực chiến bot (cùng công thức với power() của stats.ts, cho tvDamageScale). */
function botPower(d) {
  const L = S.lvl, eDef = 8 + 3.2 * L, eAr = 30 + 9 * L;
  const hit = hitPercent(d.ar, eDef, 0) / 100;
  const dodge = 1 - hitPercent(eAr, d.def) / 100;
  const avgRes = ELEM.reduce((t, e) => t + (d.res[e] || 0), 0) / ELEM.length;
  const rate = d.cd ? 1 / d.cd : 1;
  const dps = Math.max(1, d.dmg) * rate * hit;
  const ehp = Math.max(1, d.max) / Math.max(0.2, 1 - avgRes / 100) / Math.max(0.3, 1 - dodge);
  return Math.pow(dps, 0.7) * Math.pow(ehp, 0.3);
}

/* ======================= TẠO QUÁI TỶ VÕ (bản gốc wS) ======================= */
export function makeTyvoEnemy(spec, powerScale = 1, profile, botEq) {
  const lvl = Math.max(1, S.lvl);
  const d = profile || combatProfile(spec, botEq);
  const modeScale = (R.tyvo.mode === 'school' ? 0.85 : 1) * (S.chal === 'white' ? 0.85 : 1);
  const diffScale = ([1, 1.1, 1.2][R.tyvo.difficulty] || 1) * modeScale;
  const playerDps = Math.max(1, (R.P.main && R.P.main.dps) || R.P.dps || 1);
  const hpPerDps = 8 + R.tyvo.difficulty * 2;
  const overpower = playerDps * 8 > d.max * 1.5;                 // người chơi mạnh hơn nhiều → đối thủ được đệm
  const h = (overpower ? 0.9 : 1) * diffScale;
  const zoneMobs = (zoneOf(S.stage).m || []).filter(id => MON[id]);
  const e = makeEnemy(pick(zoneMobs.length ? zoneMobs : [0]), lvl, 'elite', H.x, H.y);
  Object.assign(e, {
    n: spec.name, series: spec.series, ranged: spec.ranged, tvFighter: true,
    tvTitle: spec.title, tvPersonName: spec.personName,
  });
  const table = FAC_TABLE[spec.factionKey] || { starter: 0 };
  const skills = botSkills(spec, lvl);
  e.tvP = e.tvBaseP = d;
  e.tvSkills = skills;
  e.tvBaseSkills = skills;
  e.tvSupport = { id: table.starter, heal: true, healRatio: 0.12, duration: 0 };
  e.tvSupportActive = false;
  e.tvModeScale = modeScale;
  /* chiêu bot scale theo tỷ lệ lực chiến (bản gốc: u(ii(P)*h*t/power, .2, 10)) */
  e.tvDamageScale = clamp(playerDps * h * powerScale / Math.max(1, botPower(d)), 0.2, 10);
  e.max = e.hp = Math.max(d.max * diffScale, playerDps * hpPerDps * h) * powerScale;
  const defMul = (overpower ? 0.68 : 0.5) * diffScale, chain = Math.pow(powerScale, 0.2);
  e.def = Math.max(e.def * modeScale, R.P.ar * defMul * chain, d.def * defMul * chain);
  e.ar = Math.max(e.ar * modeScale, d.ar * (0.95 + R.tyvo.difficulty * 0.1) * chain * modeScale);
  for (const k of ELEM) e.res[k] = Math.max((e.res[k] || 0) * modeScale, (d.res[k] || 0) * defMul);
  e.regen = (e.regen || 0) * modeScale;
  if (overpower) {
    for (const k of ELEM) e.res[k] = Math.max(e.res[k] || 0, (d.res[k] || 0) * 0.72 * diffScale * chain);
    e.regen = Math.max(e.regen || 0, 0.72 * diffScale);
  }
  /* sát thương: không quá 60% máu tối đa nhân vật mỗi đòn (bản gốc giữ ngách này) */
  e.dmg = Math.min(Math.max(e.dmg, d.dmg * 3, R.P.life * 0.28) * diffScale * Math.min(powerScale, 2.5), R.P.life * 0.6);
  e.spd = Math.max(e.spd * (spec.ranged ? 1.05 : 1.16), 150 * (R.P.speed || 1) * (spec.ranged ? 1 : 1.1));
  e.r = Math.max(e.r, 22);
  e.cd = clamp(0.9 / Math.max(0.5, d.cd ? 1 / d.cd : 1), 0.55, 1.05);
  e.atkCd = rnd(0.18, 0.38);
  e.tvSupportCd = rnd(0.35, 0.65);
  e.tvSkillCd = rnd(0.25, 0.45);
  e.tvNaturalDef = e.def; e.tvNaturalAr = e.ar;
  e.tvNaturalRes = { ...e.res };
  e.tvDefenseRatio = defMul; e.tvChainDefense = chain;
  return e;
}

/* ======================= LUỒNG TRẬN (bản gốc kS/DS/OS/MS/AS) ======================= */
export const tyvoActive = () => !!R.tyvo;
let tvDifficultyState = 0;   // Zx: cấp khó Giang Hồ (đặt trước khi vào trận)
export const tvGetDifficulty = () => tvDifficultyState;
export function tvSetDifficulty(d) { tvDifficultyState = clamp(+d || 0, 0, 2); }
/* Bắt đầu (bản gốc kS). */
export function tyvoStart(mode = 'school') {
  if (!S.fac || S.lvl < TVX_MIN_LEVEL) { toast(`Tỷ Võ Trường mở ở cấp ${TVX_MIN_LEVEL}`); return; }
  if (R.dg || R.tyvo || R.tower || R.tk || R.wbArena || R.petRealm || R.deadT > 0) { toast('Hãy kết thúc hoạt động hiện tại và hồi phục trước'); return; }
  if (R.town) backFromTown();
  const m = mode === 'school' ? 'school' : 'jianghu';
  const prog = tvProgress();
  if (m === 'school' && prog.school === 5 && S.lvl < TVX_GRAND_LEVEL) { toast('Đại đệ tử chân truyền mở ở cấp 80'); return; }
  const opp = currentOpponent(m);
  const before = {
    enemies: R.enemies, corpses: R.corpses, ground: R.ground, hitSeq: R.hitSeq,
    moveTo: R.moveTo, pickTarget: R.pickTarget, field: R.field, spawnT: R.spawnT,
    stall: R.stall, lootWait: R.lootWait, zoneShown: R.zoneShown, wave: S.wave,
    atkT: R.atkT, hitClock: R.hitClock, activeT: R.activeT, tpCd: R.tpCd, hurtT: R.hurtT,
    fx: R.fx, txt: R.txt, petPos: R.petPos,
  };
  R.tyvo = {
    mode: m, difficulty: m === 'school' ? 0 : tvGetDifficulty(), streak: 0, powerScale: 1,
    day: tvDay(), resetPending: false, damageWindow: null, roundActive: false,
    roundDeadline: 0, roundLeft: TVX_ROUND_SECONDS, firstOpponent: opp, opponent: opp, before,
  };
  R.field = null; R.enemies = []; R.corpses = []; R.ground = []; R.hitSeq = [];
  R.moveTo = null; R.pickTarget = null; R.spawnT = 0.35; R.atkT = 0; R.fx = []; R.txt = [];
  R.petPos = null; R.petGuardT = R.petRageT = 0; R.petGuardMult = R.petRageMult = 1;
  R.life = R.P.life; R.mana = R.P.mana;
  H.poisonT = H.burnT = H.coldT = 0;
  document.body.classList.add('tyvo-active');
  closeModal(true);
  tyvoHud();
  R.banner = { t: 2.4, text: 'Tỷ Võ Trường', sub: m === 'school' ? 'Tỷ Khí Đồng Môn · thắng nối tiếp đối thủ' : 'Giang Hồ Tỷ Võ · ngẫu nhiên mười môn phái' };
  log(`<span class="dim">Vào Tỷ Võ Trường — ${m === 'school' ? 'Tỷ Khí Đồng Môn' : 'Giang Hồ Tỷ Võ'}.</span>`);
  tyvoSpawnOpponent();
  save(); refresh();
}
/* Gọi đối thủ tiếp theo (bản gốc DS): sinh bot + quái, mở đồng hồ 5 phút. */
export function tyvoSpawnOpponent() {
  const t = R.tyvo;
  if (!t || t.building) return;
  const opp = t.firstOpponent || makeOpponent(t.mode, t.mode === 'jianghu' && t.opponent ? t.opponent.factionKey : null, t.opponent && t.opponent.personName);
  t.firstOpponent = null; t.resolved = false; t.roundActive = false; t.roundDeadline = 0; t.roundLeft = TVX_ROUND_SECONDS;
  t.opponent = opp;
  const botEq = botEquipment(opp, S.lvl);
  const profile = combatProfile(opp, botEq);
  const e = makeTyvoEnemy(opp, t.powerScale, profile, botEq);
  R.enemies = [e]; R.corpses = []; R.spawnT = 0;
  t.roundActive = true; t.roundDeadline = Date.now() + TVX_ROUND_SECONDS * 1000; t.roundLeft = TVX_ROUND_SECONDS;
  R.stall = 0; R.banner = null;
  tyvoHud();
  refresh();
}
/* Đồng hồ ngày + cửa sổ sát thương + đồng hồ trận (bản gốc OS). Trả về true nếu hết giờ. */
export function tyvoDailyTick(dt = 1 / 60) {
  const t = R.tyvo;
  if (!t) return false;
  const day = tvDay();
  if (t.day !== day) { t.day = day; t.resetPending = true; }
  if (t.damageWindow) t.damageWindow.left -= dt;
  if (t.roundActive) {
    const prev = Math.ceil(t.roundLeft);
    t.roundLeft = Math.max(0, ((t.roundDeadline || Date.now()) - Date.now()) / 1000);
    if (Math.ceil(t.roundLeft) !== prev) tyvoHud();
    if (t.roundLeft <= 0) { tyvoStop(false, 'timeout'); return true; }
  }
  return false;
}
/* Thắng 1 trận (bản gốc MS). */
export function tyvoWin() {
  const t = R.tyvo;
  if (!t || t.resolved) return;
  t.resolved = true; t.roundActive = false;
  const newDay = t.resetPending || t.day !== tvDay();
  const prog = tvProgress();
  const reward = [1, 2, 3][t.difficulty] || 1;
  let milestone = null;
  if (t.mode === 'school' && prog.school < TVX_RANKS.length && !(prog.school === 5 && S.lvl < TVX_GRAND_LEVEL)) {
    milestone = tyvoClaim(prog, prog.school);
    prog.school = Math.min(TVX_RANKS.length, prog.school + 1);
    cachedOpponent = null;
  }
  grantTyvo({ vh: reward }, `Thắng ${t.opponent.name}`);
  prog.wins++;
  if (newDay) { t.streak = 0; t.powerScale = 1; t.resetPending = false; t.day = tvDay(); }
  else { t.streak++; t.powerScale *= 1.003; }
  prog.best = Math.max(prog.best, t.streak);
  pushHistory(prog, {
    mode: t.mode, name: t.opponent.personName || t.opponent.name, faction: t.opponent.factionName,
    result: 'Thắng', reward, streak: t.streak,
  });
  heal(R.P.life * 0.12, true);
  R.mana = Math.min(R.P.mana, R.mana + R.P.mana * 0.12);
  R.enemies = []; R.corpses = []; R.spawnT = 1.1;
  const nextLine = newDay ? 'Ngày mới · chuỗi bắt đầu lại' : `Đối thủ kế tiếp · chuỗi ${t.streak}`;
  R.banner = { t: 2.1, text: milestone ? `${milestone} · chiến thắng` : 'Chiến thắng', sub: `+${reward} Võ Huân · ${nextLine}` };
  tyvoHud();
  save(); refresh();
}
/* Kết thúc (bản gốc AS). */
export function tyvoStop(win = false, reason = 'quit') {
  const t = R.tyvo;
  if (!t) return;
  const prog = tvProgress();
  const opp = t.opponent;
  if (!t.resolved) pushHistory(prog, {
    mode: t.mode, name: opp ? (opp.personName || opp.name) : 'Tỷ Võ Trường', faction: opp ? opp.factionName : '',
    result: win ? 'Thắng' : reason === 'loss' ? 'Thua' : reason === 'timeout' ? 'Hết giờ' : 'Dừng', streak: t.streak,
  });
  if (!(t.resetPending || t.day !== tvDay())) prog.best = Math.max(prog.best, t.streak);
  const before = t.before || {};
  R.tyvo = null;
  R.enemies = before.enemies || []; R.corpses = before.corpses || []; R.ground = before.ground || [];
  R.hitSeq = before.hitSeq || []; R.moveTo = before.moveTo || null; R.pickTarget = before.pickTarget || null;
  R.field = before.field || null; R.spawnT = before.spawnT || 0; R.stall = before.stall || 0;
  R.lootWait = before.lootWait || 0; R.zoneShown = before.zoneShown || 0; S.wave = before.wave || 1;
  R.atkT = before.atkT || 0; R.hitClock = before.hitClock || 0; R.activeT = before.activeT || 0;
  R.tpCd = before.tpCd || 0; R.hurtT = before.hurtT || 0; R.fx = before.fx || []; R.txt = before.txt || [];
  R.petPos = before.petPos || null;
  R.deadT = 0; R.dirty = true; recalc();
  R.life = R.P.life; R.mana = R.P.mana;
  H.poisonT = H.burnT = H.coldT = 0;
  document.body.classList.remove('tyvo-active');
  tyvoHudRemove();
  const msg = win ? 'Đã dừng chuỗi Tỷ Võ.'
    : reason === 'loss' ? 'Bạn đã bại trận. Chuỗi sức mạnh bắt đầu lại từ đầu.'
    : reason === 'timeout' ? 'Hết 5 phút. Bạn bị đưa khỏi đài tỷ võ.'
    : 'Đã dừng chuỗi Tỷ Võ.';
  log(`<span class="dim">${msg}</span>`);
  R.banner = { t: 2.4, text: win ? 'Tỷ Võ kết thúc' : reason === 'loss' ? 'Bại trận' : reason === 'timeout' ? 'Hết giờ' : 'Đã dừng chuỗi', sub: `Đã thắng liên tiếp ${t.streak} trận · Võ Huân vẫn được giữ` };
  save(); refresh();
  setTimeout(() => { if (S.fac && !R.tyvo) openGiftTab('tyvo'); }, 120);
}
/* Thưởng mốc Đồng Môn (bản gốc jS): nhận 1 lần. */
export function tyvoClaim(prog, idx) {
  if (prog.claimed[idx] || (idx === 5 && S.lvl < TVX_GRAND_LEVEL)) return null;
  prog.claimed[idx] = 1;
  if (idx === 4 || idx === 5) {
    const w = factionWeaponItem(idx);
    if (w) { addItem(w, true, true, true); log(`🎁 ${idx === 5 ? 'Vũ khí chấn phái' : `Vũ khí ${FAC[S.fac].n}`}: <b style="color:${RAR_COL[w.r]}">${esc(w.n)}</b>`); }
    else grantTyvo({ ht: 2 }, `Tỷ Khí Đồng Môn · ${TVX_RANKS[idx]}`);
  } else grantTyvo(TVX_MILESTONE_REWARDS[idx] || {}, `Tỷ Khí Đồng Môn · ${TVX_RANKS[idx]}`);
  return TVX_RANKS[idx];
}
/* Vũ khí phù hợp môn phái (mốc 4: thường · mốc 5: cao cấp, Bố Y nhận Trắng/Xanh). */
function factionWeaponItem(tier) {
  const fac = FAC[S.fac];
  const table = FAC_TABLE[S.fac];
  if (!fac || !table || table.wcode < 0) return null;
  const wc = table.wcode;
  const cap = S.lvl + 15;
  for (let tries = 0; tries < 10; tries++) {
    const it = makeItem(wc === 7 ? 1 : 0, wc === 7 ? irnd(0, 2) : (wc === 9 ? 6 : wc), clamp(Math.round(S.lvl / 12) + 1, 1, 10), tier === 5 ? 4 : 3);
    if (!it) continue;
    const bad = it.req.some(p => (p[0] === 36 && p[1] > cap) || (p[0] === 39 && p[1] >= 0 && p[1] !== fac.id) || (p[0] === 38 && p[1] >= 0 && p[1] !== (S.sex || 0)));
    if (!bad) return it;
  }
  return null;
}
/* Cửa hàng: đổi Võ Huân (bản gốc NS). */
export function tyvoBuy(idx) {
  const offer = TVX_SHOP[idx];
  if (!offer) return;
  const r = RW();
  if (r.vh < offer.cost) { toast(`Cần ${offer.cost} Võ Huân`); return; }
  r.vh -= offer.cost;
  grantTyvo(offer.gift, `Cửa hàng Tỷ Võ · ${offer.name}`);
  save(); refresh();
}

/* ======================= CỬA SỔ SÁT THƯƠNG (bản gốc fS) ======================= */
/* Mỗi đòn nhận vào tối đa 12% máu tối đa, cả cửa sổ 3s tối đa 28% —
   cửa sổ làm mới sau 3 giây (tyvoDailyTick đếm ngược damageWindow.left). */
export function tyvoDamageCap(d) {
  const t = R.tyvo;
  if (!t) return d;
  const maxLife = Math.max(1, R.P.life);
  let w = t.damageWindow;
  if (!w || w.left <= 0) w = t.damageWindow = { left: 3, spent: 0 };
  const room = Math.max(0, Math.min(maxLife * 0.12, maxLife * 0.28 - w.spent));
  const capped = Math.min(Math.max(0, d), room);
  w.spent += capped;
  return capped;
}

/* ======================= AI QUÁI TỶ VÕ (bản gốc gl/ml phần tyvo) ======================= */
/* Chiêu thức + đồng hành hỗ trợ của bot. Gọi từ enemyAI (combat.ts). */
export function tyvoFighterAI(e, dt, dist, reach) {
  const t = R.tyvo;
  if (!t || !e.tvFighter) return;
  /* đồng hành hỗ trợ (bản gốc ml): hồi máu khi dưới 68% */
  const sup = e.tvSupport;
  if (sup) {
    e.tvSupportCd = (e.tvSupportCd || 0) - dt;
    if (sup.heal && e.tvSupportCd <= 0 && e.hp < e.max * 0.68) {
      const amount = Math.min(e.max - e.hp, e.max * (sup.healRatio || 0.12));
      e.hp += amount;
      e.tvSupportCd = 6;
      addText(e.x, e.y - e.r - 18, `✦ ${J.skills[sup.id] ? J.skills[sup.id].n : 'Hỗ trợ'}`, '#9fffc4', 11);
      e.act = 'mag'; e.actT = 0;
    }
  }
  /* chiêu: cast tvSkills[0] mỗi tvSkillCd khi nhân vật trong tầm */
  e.tvSkillCd -= dt;
  if (e.tvSkillCd <= 0 && dist <= reach + 60 && e.tvSkills && e.tvSkills.length) {
    e.tvSkillCd = Math.max(0.5, (e.cd || 1) * 0.9);
    const sk = e.tvSkills[0];
    const mul = (0.6 + 0.2 * (sk.L || 1)) * (e.tvDamageScale || 1);
    const dmg = Math.max(1, e.dmg * mul);
    const el = ELEM[sk.series >= 0 ? sk.series % 5 : e.series] || 'phys';
    enemyHit(e, { dmg, el });
  }
}

/* ======================= THƯỞNG: VÕ HUÂN + VẬT PHẨM (bản gốc Kv) ======================= */
/* grant() của rewards.ts xử lý gold/pot/fd/item/set/pts/so/mat; phần còn lại
   của bản gốc (vh/ht/mats/stackItems) xử lý tại đây rồi delegate. */
export function grantTyvo(g, why) {
  const out = [];
  const r = RW();
  if (g.vh) { r.vh = Math.max(0, Math.floor(+r.vh || 0)) + Math.max(0, Math.floor(+g.vh)); out.push(`${Math.floor(+g.vh)} Võ Huân`); }
  if (g.ht) { const tier = clamp(Math.floor(S.lvl / 15) + 1, 1, HT_MAX); matAdd('ht', tier, g.ht); out.push(`${g.ht} Huyền Tinh cấp ${tier}`); }
  if (g.mats) for (const k in g.mats) { matAdd('misc', k, g.mats[k]); out.push(`${g.mats[k]} ${MAT_NAMES[k] || k}`); }
  if (g.stackItems) for (const k in g.stackItems) { matAdd('misc', k, g.stackItems[k]); out.push(`${g.stackItems[k]} ${MAT_NAMES[k] || k}`); }
  const rest = {};
  for (const k in g) if (!{ vh: 1, ht: 1, mats: 1, stackItems: 1 }[k]) rest[k] = g[k];
  if (Object.keys(rest).length) grant(rest, why);
  if (out.length) log(`🎁 ${esc(why)}: ${out.join(', ')}`);
  save();
  return out;
}

/* ======================= UI: BẢNG TỶ VÕ (bản gốc FS/IS) ======================= */
let cachedMode = 'school';
export function tyvoBody(r) {
  const prog = tvProgress();
  const t = R.tyvo;
  const mode = t ? t.mode : cachedMode;
  const opp = t ? t.opponent : currentOpponent(mode);
  const done = prog.school >= TVX_RANKS.length;
  const nextName = done ? 'Đã hoàn thành tuyến môn phái' : nextMilestoneName(prog);
  const grandLocked = mode === 'school' && prog.school === 5 && S.lvl < TVX_GRAND_LEVEL;
  const diffIdx = tvGetDifficulty();
  const diffReward = [1, 2, 3][diffIdx] || 1;
  const history = prog.history.slice(0, 5).map(h => `<div class="tyvo-history-row"><span class="tyvo-history-result ${h.result === 'Thắng' ? 'up' : 'dim'}">${esc(h.result)}</span><b>${esc(h.name)}</b><small>${esc(h.faction || '')}${h.reward ? ` · +${h.reward} Võ Huân` : ''}</small></div>`).join('');
  return `<section class="tyvo-panel">
    <header class="tyvo-heading"><div><span class="tyvo-eyebrow">ĐẤU TRƯỜNG MÔ PHỎNG</span><h3>Tỷ Võ Trường</h3><p>Thắng để nhận Võ Huân và gọi đối thủ tiếp theo.</p></div><div class="tyvo-currency"><small>VÕ HUÂN</small><b>${fmt(r.vh || 0)}</b></div></header>
    <div class="tyvo-reset-line"><span>Chuỗi mạnh dần reset lúc <b>00:00 giờ Việt Nam</b></span><small>còn ${tvResetIn()} · hôm nay ${prog.wins} trận · kỷ lục ${prog.best}</small></div>
    ${t ? `<div class="tyvo-active-card"><span class="tyvo-live-dot"></span><div><small>ĐANG TRÊN ĐÀI · ${t.mode === 'school' ? 'TỶ KHÍ ĐỒNG MÔN' : 'GIANG HỒ TỶ VÕ'}</small><b>${esc(t.opponent ? t.opponent.title || t.opponent.name : 'Đang gọi đối thủ')}</b>${t.opponent && t.opponent.personName ? `<b>${esc(t.opponent.personName)}</b>` : ''}<span>Thắng liên tiếp ${t.streak}</span></div><button class="btn red sm" id="tvStop">Dừng</button></div>`
    : `<div class="tyvo-mode-switch" role="tablist" aria-label="Chọn hình thức tỷ võ"><button type="button" data-tv-mode="school" class="${mode === 'school' ? 'on' : ''}">Tỷ Khí Đồng Môn</button><button type="button" data-tv-mode="jianghu" class="${mode === 'jianghu' ? 'on' : ''}">Giang Hồ Tỷ Võ</button></div>
    <div class="tyvo-opponent-card"><div class="tyvo-opponent-medal">⚔</div><div class="tyvo-opponent-copy"><small>${mode === 'school' ? 'MÔN PHÁI CỦA BẠN' : 'ĐỐI THỦ NGẪU NHIÊN'}</small><b>${esc(opp.title || opp.name)}</b><b>${esc(opp.personName || '')}</b><span>Cấp ${S.lvl} · ${esc(opp.weaponName)}</span></div>${mode === 'jianghu' ? `<button class="tyvo-reroll" id="tvReroll" type="button" title="Đổi đối thủ">↻</button>` : ''}</div>`}
    ${mode === 'school'
      ? `<div class="tyvo-progress"><div><span>Mốc kế tiếp</span><b>${esc(nextName)}${grandLocked ? ' · mở cấp 80' : ''}</b></div><div class="tyvo-progress-track"><i style="width:${Math.min(100, prog.school / TVX_RANKS.length * 100)}%"></i></div><small>${done ? `${TVX_RANKS.length}/${TVX_RANKS.length} mốc · đã nhận hết thưởng một lần; trận thắng vẫn nhận 1 Võ Huân` : `${prog.school}/${TVX_RANKS.length} mốc · thưởng: ${esc(TVX_MILESTONE_NAMES[prog.school])} · nhận một lần`}</small></div>`
      : `<div class="tyvo-difficulty">${TVX_DIFF_NAMES.map((n, i) => `<button type="button" data-tv-diff="${i}" class="${diffIdx === i ? 'on' : ''}"><b>${n}</b><small>Thưởng +${i + 1} Võ Huân</small></button>`).join('')}</div>`}
    <div class="tyvo-start-row"><span>${mode === 'school' ? 'Cùng môn phái · thắng +1 Võ Huân' : `Thắng trận nhận ${diffReward} Võ Huân`}</span><button class="btn" id="tvStart" ${S.lvl < TVX_MIN_LEVEL || grandLocked ? 'disabled' : ''}>${S.lvl < TVX_MIN_LEVEL ? `Cần cấp ${TVX_MIN_LEVEL}` : grandLocked ? 'Cần cấp 80' : 'Vào tỷ võ'}</button></div>
    <div class="tyvo-rule"><b>Chuỗi không giới hạn · mỗi trận 5 phút</b><span>Thắng để nhận Võ Huân và chạm các mốc thưởng. Hết 5 phút sẽ rời đài.</span></div>
    ${history ? `<details class="tyvo-history"><summary>Trận gần đây <span>${prog.history.length}</span></summary><div>${history}</div></details>` : ''}
    <div class="tyvo-shop-head"><b>Đổi Võ Huân</b><small>Không giới hạn lượt mua</small></div>${TVX_SHOP.map((o, i) => `<div class="tyvo-shop-row"><span>${esc(o.name)}</span><small>${o.cost} VH</small><button class="btn sm" data-tv-buy="${i}" ${(r.vh || 0) >= o.cost ? '' : 'disabled'}>Đổi</button></div>`).join('')}
  </section>`;
}
export function tyvoBind() {
  tvExpose();
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  const rerender = () => openGiftTab('tyvo');   // refresh() chỉ vẽ lại bảng bên, modal phải vẽ lại riêng
  on('#tvStart', () => tyvoStart(cachedMode));
  on('#tvStop', () => tyvoStop(false, 'quit'));
  on('#tvReroll', () => { const f = cachedOpponent && cachedOpponent.factionKey, p = cachedOpponent && cachedOpponent.personName; cachedOpponent = makeOpponent(cachedMode, f, p); rerender(); });
  document.querySelectorAll('#mBody [data-tv-mode]').forEach(b => b.onclick = () => { cachedMode = b.dataset.tvMode; cachedOpponent = null; rerender(); });
  document.querySelectorAll('#mBody [data-tv-diff]').forEach(b => b.onclick = () => { tvSetDifficulty(+b.dataset.tvDiff); rerender(); });
  document.querySelectorAll('#mBody [data-tv-buy]').forEach(b => b.onclick = () => tyvoBuy(+b.dataset.tvBuy));
}
/* HUD trên sân đấu (bản gốc ES). */
export function tyvoHud() {
  let el = $('#tyVoHud');
  if (!el) {
    el = document.createElement('section');
    el.id = 'tyVoHud';
    el.className = 'tyvo-hud';
    const battle = $('#battle');
    if (battle) battle.appendChild(el);
  }
  const t = R.tyvo;
  if (!t) { el.remove(); return; }
  const left = Math.max(0, Math.ceil(t.roundLeft || 0));
  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  if (el.__tvOpponent !== t.opponent || el.__tvMode !== t.mode || el.__tvRound !== t.streak) {
    el.innerHTML = `<div class="tyvo-hud-kicker">TỶ VÕ TRƯỜNG · ${t.mode === 'school' ? 'TỶ KHÍ ĐỒNG MÔN' : 'GIANG HỒ TỶ VÕ'}</div><b>${esc(t.opponent.title || t.opponent.name)}</b><b>${esc(t.opponent.personName || '')}</b><div class="tyvo-hud-meta">Trận ${t.streak + 1}</div><div class="tyvo-round-clock">Thời gian trận <b>${mmss}</b></div><button class="tyvo-hud-stop" type="button">Dừng chuỗi</button>`;
    el.__tvOpponent = t.opponent; el.__tvMode = t.mode; el.__tvRound = t.streak;
    const btn = el.querySelector('button');
    if (btn) btn.onclick = () => tyvoStop(false, 'quit');
  }
  const clock = el.querySelector('.tyvo-round-clock b');
  const txt = mmss;
  if (clock && clock.textContent !== txt) clock.textContent = txt;
}
export function tyvoHudRemove() { const el = $('#tyVoHud'); if (el) el.remove(); }
/* Số Võ Huân hiện tại (cho HUD nhanh / badge). */
export const tvVh = () => Math.max(0, Math.floor(+RW().vh || 0));
/* Mo truy cap test E2E (cach SV): doc/ghi Võ Huân + goi truc tiep. */
function tvExpose() {
  try {
    const g = (window as any).__G;
    if (g && !('TV' in g)) Object.defineProperty(g, 'TV', { get: () => ({ tvVh, tyvoBuy, tyvoStart, tyvoStop, tyvoDailyTick, tyvoDamageCap, RW, save }) });
  } catch (e) { /* bo qua */ }
}

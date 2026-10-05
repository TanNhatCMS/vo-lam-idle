// @ts-nocheck — tính năng mới, viết theo phong cách engine (spec: docs/BOSS-THE-GIOI-VA-QUAY-VO-SO.md)
import { H, R, makeEnemy, stageLevel, zoneOf } from './combat';
import { INPUT, manual, setCtrl } from './control';
import {
  $,
  FAC,
  J,
  MON,
  RAR_COL,
  RAR_VI,
  STAGES,
  W,
  WORLD,
  attrName,
  attrText,
  clamp,
  esc,
  inWorld,
  irnd,
  pick,
  rnd,
} from './core';
import { playMusic, uiSfx } from './audio';
import { obsLoad, obsOpen, obsOpenNear } from './mapobs';
import { dropToGround, makeItem, sexPart } from './loot';
import { makeSetItem } from './sets';
import { sexReqOk } from './stats';
import { RW, grant } from './rewards';
import { addText, img, snapCamera } from './render';
import { S, save } from './save';
import { uiBump } from './store';
import { SV } from './survival';
import { log, modal, closeModal, toast } from './ui';

/* ======================= BOSS THE GIOI =======================
   Ra mỗi WB_EVERY giây THỜI GIAN THỰC (mốc epoch, không phải thời gian chơi): tới giờ là ra, kể cả đang ở thành/tháp/luyện công hay vừa mở lại app.
   Khi ra: banner + log + popup NHẮC (không khóa, không tự teleport) — bấm "Đến" mới vào bí cảnh.
   Vỏ Sò rớt khi hạ boss (spec mục 2.5); quay Vỏ Sò nằm ở rewards.ts (tab Quay Sò của giftModal). */
'use strict';
const ARG = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const numArg = (k, d) => { const v = ARG ? Number(ARG.get(k)) : NaN; return v > 0 ? v : d; };
export const WB_EVERY = numArg('wbe', 1200);              // GIÂY THỰC giữa 2 lần boss ra (mặc định 20 phút) — đếm theo đồng hồ, không theo thời gian chơi
export const WB_FIRST = numArg('wbf', 300);               // nhân vật MỚI: con boss đầu tiên sau 5 phút (đỡ sốt ruột chờ 20 phút)
export const WB_LIFE = numArg('wbl', 1200);
export const WB_MIN_LV = 10;
const WB_HP_X = 3, WB_DMG_X = 1.15, WB_EXIT_T = 60, WB_WAIT_MAX = 12, SO_MIN = 8, SO_MAX = 15, SO_FIRST_DAY = 5;
// WB_EXIT_T: sau khi hạ boss được ở lại 60s nhặt đồ (hết 60s còn đồ mới thì gia hạn tối đa WB_WAIT_MAX); WB_LIFE: mỗi lần vào bí cảnh có bấy nhiêu giây để hạ boss, hết là rút lui
const WB_MAP = 'town';                                    // bí cảnh dùng lại bản đồ Thành phố (Biện Kinh) — W.town
let wbBgWarmed = false;
/* Điểm vào bí cảnh: dữ liệu vật cản không biết cây trang trí -> quét pixel ảnh nền quanh tâm,
   chọn ô ÍT MÀU XANH LÁ nhất (đá/sân) mà vẫn thoáng va chạm — tránh "xuất hiện trong lùm cây". */
function wbEntrySpot(): [number, number] {
  const D: any = DEV ? (window as any).__WB_ENTRY_DIAG = { steps: [] } : null;
  try {
    const bg = img(W.town.bg);
    if (D) D.steps.push({ bg: !!bg, complete: !!(bg && bg.complete), w: bg ? bg.naturalWidth : 0 });
    if (bg && bg.complete && bg.naturalWidth >= 128) {
      const A = bg.naturalWidth, W2 = WORLD.w, C = document.createElement('canvas');
      C.width = 64; C.height = 64;
      const g = C.getContext('2d', { willReadFrequently: true });
      if (D) { D.steps.push({ ctx: !!g }); }
      const greenRatio = (wx, wy) => {                                   // tỉ lệ pixel xanh lá (cây/cỏ) quanh (wx,wy)
        const mx = Math.round(wx < W2 / 2 ? wx : W2 - wx), my = Math.round(wy < W2 / 2 ? wy : W2 - wy);   // nền 2x2 lat guong
        g.clearRect(0, 0, 64, 64);
        g.drawImage(bg, clamp(mx - 32, 0, A - 64), clamp(my - 32, 0, A - 64), 64, 64, 0, 0, 64, 64);
        const d = g.getImageData(0, 0, 64, 64).data; let green = 0, n = 0;
        for (let i = 0; i < d.length; i += 16) { const R = d[i], G = d[i + 1], B = d[i + 2]; if (G > R + 12 && G > B + 12) green++; n++; }
        return green / n;
      };
      let best = null, bestG = 1e9, probed = [];
      /* dải quét lệch BẮC tâm: cổng chùa (bậc thang + 2 tượng sư tử) ở phía trên sân trung tâm */
      for (let dx = -512; dx <= 128; dx += 64) for (let dy = -512; dy <= -96; dy += 64) {
        const px = WORLD.w / 2 + dx, py = WORLD.h / 2 + dy;
        const open = obsOpen(px, py, 14);
        const gr = open ? greenRatio(px, py) : -1;
        probed.push({ px, py, open, gr: Math.round(gr * 1000) / 1000 });
        if (open && gr < bestG) { bestG = gr; best = [Math.round(px), Math.round(py)]; }
      }
      if (DEV) (window as any).__WB_ENTRY_PROBE = probed;
      D.steps.push({ best, bestG });
      if (best && bestG < 0.45) return best;
    }
  } catch (e) { if (DEV) (window as any).__WB_ENTRY_DIAG.err = String((e && e.message) || e); }
  return obsOpenNear(WORLD.w / 2, WORLD.h / 2, 14);
}
const DEV = !!(ARG && ARG.get('wbe'));                    // bật WB_DEBUG khi test (?wbe=15&wbl=30)

function wb() {                                           // trạng thái lưu: next = mốc epoch (ms) lần ra kế, up = boss đang chờ
  const w = RW().wb;
  if (w.next == null) w.next = Date.now() + WB_EVERY * 1000;
  if (!('up' in w)) w.up = null;
  return w;
}

/* ---------- vòng đời ---------- */
export function wbTick(dt) {
  if (!S || !S.fac) return;
  if (!wbBgWarmed) { wbBgWarmed = true; try { img(W.town.bg); } catch (e) { /* bỏ qua */ } }   // nạp sớm ảnh nền cho wbEntrySpot (không đặt cấp module: vấp TDZ vòng import tròn)
  const w = wb();
  if (R.wbArena) {
    if (R.wbExitT > 0) {
      R.wbExitT -= dt;
      if (R.wbExitT <= 0) {
        /* chỉ chờ ĐỒ MỚI rơi từ boss (trên mốc wbLootAt ghi lúc hạ) — đồ cũ trên đất không giữ người lại */
        if (R.ground.length > (R.wbLootAt || 0) && R.wbWaited < WB_WAIT_MAX) {
          R.wbWaited += 2; R.wbExitT = 2; return;
        }
        backFromBossArena();
      }
      return;
    }
    if (R.wbLife > 0) { R.wbLife -= dt; if (R.wbLife <= 0) wbFlee(); }              // đồng hồ chạy liên tục khi ở bí cảnh; vào lại là đầy lại
    return;
  }
  if (w.up) return;                                       // boss đang chờ: không hẹn con mới
  if (S.lvl < WB_MIN_LV) return;                          // dưới cấp tối thiểu: chưa có boss
  if (Date.now() >= w.next) spawnUp();                    // MỐC THỜI GIAN THỰC: tới giờ là ra, kể cả đang ở thành/tháp/luyện công
}
function spawnUp() {
  const w = wb(), st = Math.min(S.stage, STAGES), z = zoneOf(st);
  const L = Math.min(stageLevel(st), S.lvl) + 2;
  w.up = { tid: z.boss, L, n: 'Thế Giới · ' + (MON[z.boss] ? MON[z.boss].n : 'Trùm') };
  uiSfx('levelup');
  R.banner = { t: 3, text: '⚔ Boss Thế Giới xuất hiện!', sub: `${w.up.n} · Cấp ${L}` };
  log(`<b style="color:#ff8a5a">⚔ ${esc(w.up.n)}</b> xuất hiện! Hạ để nhận Vỏ Sò.`);
  if ($('#modal').classList.contains('hidden')) wbSpawnModal();
  else toast('⚔ Boss Thế Giới xuất hiện — bấm chip Boss để vào!');   // không đè modal đang mở
}
function wbFlee() {
  const w = wb(), e = R.wbE;
  log(`<span class="dim">${esc(w.up ? w.up.n : 'Boss Thế Giới')} rút lui — sẽ quay lại sau ${Math.round(WB_EVERY / 60)} phút.</span>`);
  toast('Boss Thế Giới rút lui!');
  R.banner = { t: 2, text: 'Boss Thế Giới rút lui', sub: 'Hẹn gặp lại' };
  w.up = null; R.wbE = null; R.wbLife = 0; w.next = Date.now() + WB_EVERY * 1000;
  backFromBossArena();
}

/* ---------- popup nhắc (không khóa màn) ---------- */
export function wbSpawnModal() {
  const up = wb().up; if (!up) return;
  modal(`<h3>⚔ Boss Thế Giới xuất hiện!</h3>
    <p class="desc" style="text-align:center"><b style="color:#ff8a5a">${esc(up.n)}</b> · Cấp ${up.L}</p>
    <p class="desc">Hạ boss để nhận <b>Vỏ Sò</b> — dùng quay thưởng ở nút 🎁. Boss chịu được <b>${Math.round(WB_LIFE / 60)} phút</b> đấu trong bí cảnh; rời đi sẽ chờ lần sau.</p>
    <div class="btnrow"><button class="btn" id="wbGo">⚔ Đến Boss Thế Giới</button><button class="btn" id="wbLater">Để sau</button></div>`,
    () => {
      $('#wbGo').onclick = () => { closeModal(); goBossArena(); };
      $('#wbLater').onclick = () => closeModal();
    });
}

/* ---------- bí cảnh (khuôn goTown / backFromTown) ---------- */
export function goBossArena() {
  const w = wb();
  if (!S || !S.fac || !w.up) return;
  if (R.tower) { toast('Rời tháp thử thách trước khi vào bí cảnh'); return; }
  if (SV.on) { toast('Tạm dừng Luyện Công trước khi vào bí cảnh'); return; }
  R.town = false; R.wbArena = true; R.enemies = []; R.corpses = []; R.pickTarget = null; R.moveTo = null; R.autoPick = null; INPUT.target = null;
  obsLoad(WB_MAP);
  { const [hx, hy] = wbEntrySpot(); H.x = hx; H.y = hy; }   // điểm vào sân đá thoáng, không lùm cây
  snapCamera();
  R.bgImg = img(W.town.bg); playMusic(W.town.id);
  if (!R.wbE) {                                           // lần đầu trong phiên: tạo boss; vào lại sau khi gục → giữ HP cũ
    const a = rnd(0, Math.PI * 2), [bx, by] = obsOpenNear(H.x + Math.cos(a) * 180, H.y + Math.sin(a) * 180, 34);   // boss bán kính 30: cần khoảng trống đủ rộng
    const e = makeEnemy(w.up.tid, w.up.L, 'boss', bx, by);
    e.hp = e.max = e.max * WB_HP_X; e.dmg *= WB_DMG_X; e.n = w.up.n; e.wboss = true;
    R.wbE = e;
  }
  R.enemies = [R.wbE];
  R.wbLife = WB_LIFE;                                    // mỗi lần vào bí cảnh: đầy lại 20 phút để hạ boss
  R.banner = { t: 2.2, text: 'Bí Cảnh Boss Thế Giới', sub: `${w.up.n} · Cấp ${w.up.L}` };
  log(`Vào bí cảnh — đối đầu <b style="color:#ff8a5a">${esc(w.up.n)}</b>.`);
  uiBump();
}
export function backFromBossArena() {
  if (!R.wbArena) return;
  R.wbArena = false; R.enemies = []; R.corpses = []; R.spawnT = 0.5;
  const z = zoneOf(Math.min(S.stage, STAGES));
  obsLoad(z.id); [H.x, H.y] = inWorld(H.x, H.y); snapCamera();
  R.bgImg = z.bg ? img(z.bg) : null; playMusic(z.id);
  R.banner = { t: 1.6, text: 'Trở lại ải', sub: z.n };
  uiBump();
}

/* ---------- kết cục ---------- */
/* Đồ bộ xịn rơi riêng cho Boss Thế Giới: chọn pool như rollSetDrop nhưng bỏ gate tỉ lệ, may mắn cao */
function wbSetDrop(kind, eL, luck) {
  const lvCap = Math.max(S.lvl, eL) + 10, fid = FAC[S.fac] ? FAC[S.fac].id : -1;
  const reqOf = (r, id) => (r.req.find(q => q[0] === id) || [0, -1])[1];
  let pool = J.sets[kind].filter(r => reqOf(r, 36) <= lvCap && sexReqOk(r.req));
  if (!pool.length) return null;
  const worn = new Set(Object.values(S.eq).filter(i => i && i.set).map(i => i.set.grp));       // ưu tiên đúng bộ đang mặc -> dễ kích hoạt bộ
  const sameSet = pool.filter(r => worn.has(r.grp));
  if (sameSet.length && Math.random() < 0.8) pool = sameSet;
  else {
    const mine = pool.filter(r => reqOf(r, 39) === fid);
    if (mine.length && Math.random() < 0.7) pool = mine;
  }
  return makeSetItem(kind, pick(pool), luck);
}
function wbDropPremium(e) {                                            // trang bị xịn rơi cạnh boss (auto-nhặt trong 30s)
  if (!e) return;
  const tier = clamp(Math.round(S.lvl / 12) + 1, 1, 10);
  const want = irnd(4, 5);                                             // chắc chắn 1 món 4 hoặc 5 dòng (đồ Vàng — khuôn người chơi quen)
  let it = null;
  for (let t = 0; t < 20 && (!it || it.mag.length !== want); t++) { const d = irnd(0, 9); it = makeItem(d, sexPart(d, 0), tier, want); }
  if (it && it.mag.length >= 4) {
    dropToGround(it, e);
    log(`Rơi ra: <b style="color:${RAR_COL[it.r]}">${esc(it.n)}</b> (${it.mag.length} dòng · ${RAR_VI[it.r]})!`);
  }
  const roll = Math.random();
  const kind = roll < 0.10 ? 'platina' : roll < 0.45 ? 'gold' : null;  // 10% Bạch Kim · 35% Hoàng Kim
  if (kind) {
    const s = wbSetDrop(kind, e.L, 8);
    if (s) { dropToGround(s, e); log(`<b style="color:${RAR_COL[s.r]}">${esc(s.n)}</b> (${s.mag.length} dòng · ${kind === 'gold' ? 'Hoàng Kim' : 'Bạch Kim'} bộ) rơi ra!`); }
  }
}
export function wbVictory() {                             // gọi từ waveCleared khi boss gục trong bí cảnh
  const w = wb(), e = R.wbE, so = RW().so;
  const d = new Date(), dayKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let n = irnd(SO_MIN, SO_MAX);
  if (so.day !== dayKey) { n += SO_FIRST_DAY; so.day = dayKey; }   // con đầu tiên trong ngày +5
  if (e) addText(e.x, e.y - 60, `+${n} Vỏ Sò`, '#ffd24a', 13);
  RW().stat.wboss++;
  grant({ so: n }, 'Hạ Boss Thế Giới');
  if (e) log(`Hạ <b style="color:#ff8a5a">${esc(e.n)}</b>! Đã hạ tổng cộng ${RW().stat.wboss} Boss Thế Giới.`);
  wbDropPremium(e);                                       // trang bị xịn: chắc chắn Tím 6 dòng + 35% Hoàng Kim / 10% Bạch Kim
  R.banner = { t: 2.5, text: 'Boss Thế Giới bị hạ!', sub: `+${n} Vỏ Sò` };
  uiSfx('levelup');
  w.up = null; R.wbE = null; R.wbLife = 0; w.next = Date.now() + WB_EVERY * 1000; R.wbWaited = 0; R.wbLootAt = R.ground.length; R.wbExitT = WB_EXIT_T;   // chờ nhặt hết đồ MỚI rơi rồi tự về ải
}

/* ---------- HUD giữa màn hình cho React (Battle.tsx): tên + máu boss, đếm ngược rút lui / rời bí cảnh ---------- */
export function wbHudState(): { on: boolean; name: string; hpPct: number; life: number; exit: number } {
  if (!S || !S.fac || !R.wbArena) return { on: false, name: '', hpPct: 0, life: 0, exit: 0 };
  const e = R.wbE;
  if (e && e.hp > 0) return { on: true, name: e.n, hpPct: Math.max(0, Math.min(100, e.hp / e.max * 100)), life: Math.max(0, Math.round(R.wbLife || 0)), exit: 0 };
  if (R.wbExitT > 0) return { on: true, name: '', hpPct: 0, life: 0, exit: Math.ceil(R.wbExitT) };
  return { on: false, name: '', hpPct: 0, life: 0, exit: 0 };
}

/* ---------- trạng thái chip cho React (Battle.tsx) ---------- */
export function wbUiState(): { mode: 'hidden' | 'ready' | 'inside' | 'count'; label: string; t: number } {
  if (!S || !S.fac || R.tower || SV.on) return { mode: 'hidden', label: '', t: 0 };
  if (R.wbArena) return { mode: 'inside', label: '⚔ Rời bí cảnh', t: 0 };
  const w = (S.rw && S.rw.wb) || {};
  if (w.up) return { mode: 'ready', label: '⚔ Boss Thế Giới', t: 0 };
  const left = w.next != null ? w.next - Date.now() : Infinity;                       // mốc thời gian thực
  if (S.lvl >= WB_MIN_LV) {                                                           // luôn hiện đếm ngược tới con boss kế
    const sec = Math.max(0, Math.ceil(left / 1000));
    return { mode: 'count', label: `⚔ Boss ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, t: sec };
  }
  return { mode: 'hidden', label: '', t: 0 };
}

/* ---------- hook test (?wbe=15&wbl=30) ---------- */
if (DEV && typeof window !== 'undefined') {
  (window as any).WB_DEBUG = {
    state: () => ({ so: RW().so, wb: wb(), wboss: RW().stat.wboss, arena: !!R.wbArena, hp: R.wbE ? R.wbE.hp : 0, max: R.wbE ? R.wbE.max : 0, ground: R.ground.length, life: Math.round(R.wbLife || 0) }),
    spawnNow: () => spawnUp(),
    setBossHp: (v: number) => { if (R.wbE) R.wbE.hp = v; },
    die: () => { R.life = -1; },   // máu ÂM: regen cộng trước khi kiểm <= 0 thì vẫn chết (máu đúng 0 sẽ được regen cứu)
    addSo: (n: number) => { RW().so.n += n; save(); },
    forcePity: (n: number) => { RW().so.pity = n; save(); },
    setLvl: (v: number) => { S.lvl = v; R.dirty = true; },
    setLife: (v: number) => { R.wbLife = v; },
    setNext: (sec: number) => { RW().wb.next = Date.now() + sec * 1000; save(); },
    clearGround: () => { R.ground.length = 0; },
    heroPos: () => ({ x: Math.round(H.x), y: Math.round(H.y) }),
    go: (x, y) => { if (!manual()) setCtrl('manual', true); INPUT.target = { x, y }; },   // đi tới điểm (test kẹt vật cản)
    testSetDrop: (kind) => { try { const s = wbSetDrop(kind, R.wbE ? R.wbE.L : (S.lvl + 5), 8); return s ? { n: s.n, r: s.r, kind: s.set && s.set.kind } : null; } catch (e) { return { err: String((e && e.message) || e) }; } },
    testPremiumItem: () => { const tier = clamp(Math.round(S.lvl / 12) + 1, 1, 10); const out = []; for (let i = 0; i < 12; i++) { const want = irnd(4, 5); let it = null; for (let t = 0; t < 20 && (!it || it.mag.length !== want); t++) { const d = irnd(0, 9); it = makeItem(d, sexPart(d, 0), tier, want); } out.push({ want, got: it ? it.mag.length : -1, r: it ? it.r : -1, n: it ? it.n : '' }); } return out; },
    findItem: (name) => { const it = S.inv.find(i => i.n === name) || Object.values(S.eq).find(i => i && i.n === name) || (R.ground.find(g => g.it.n === name) || {}).it; return it ? { n: it.n, r: it.r, lines: it.mag.map(m => attrText(attrName(m.a), m.p.map(v => v === -1 ? 0 : v))) } : null; },
    clearUp: () => { RW().wb.up = null; save(); },
    dbg: () => ({ ctrl: S.ctrl, town: !!R.town, arena: !!R.wbArena, up: !!RW().wb.up, next: Math.round((RW().wb.next - Date.now()) / 1000), target: INPUT.target ? { x: Math.round(INPUT.target.x), y: Math.round(INPUT.target.y) } : null, h: { x: Math.round(H.x), y: Math.round(H.y) } }),
  };
}

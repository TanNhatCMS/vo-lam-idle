/* ======================= KHOI DONG + VONG LAP (engine) =======================
   Chuyen tu js/main.js cua ban goc: moi phu buoc co dinh 60 lan/giay + noi suy vi tri khi ve.
   Phan gan nut / doi tab da chuyen sang React (ui/*.jsx) — loop.js chi giu mo phong, ve, luu.
   Import theo dung thu tu <script> trong index.html goc de giu thu tu khoi tao toan cuc. */
import { W, $, STAGES, WORLD, inWorld, fmt, esc } from './core';
import { obsLoad } from './mapobs';
import { loadJData } from './jdata';
import { autoSpendAttrs, autoSpendSkills } from './stats';
import { restoreGround } from './loot';
import { R, H, zoneOf, inZone, tick, recalc } from './combat';
import { S, newSave, save, pickSlot, load, offlineGains, setS, setSlot } from './save';
import { RW } from './rewards';
import { matAdd, matHave } from './recipes';
import { CV, img, isMobileUI, resizeArena, snapCamera, draw, setCanvas } from './render';
import { initWorldChat } from './chat';
import { AUD, sndCfg, audApply, audInit, uiSfx, playMusic, preloadZoneSounds, audioSuspendForBackground, audioResumeFromBackground } from './audio';
import {
  curTab,
  invDirty,
  log,
  modal,
  closeModal,
  autoEquipAll,
  renderLogOnly,
  renderInv,
  renderAutoLootPanel,
  showTab,
  refresh,
  toast,
  updateDots,
  slotMenu,
  pickFaction,
} from './ui';
import { gamepadPoll, renderPad, bindControls } from './control';
import { jrAdd } from './journal';
import { renderSkBuffs } from './skillsys';
import { clanCheck } from './depth';
import { loginCheck, LV_MS, achCheck, dotGift } from './rewards';
import { checkHints } from './guide';
import { SV, svExit, svTick, svDraw, svPause } from './survival';
import { uiBump } from './store';

let lastT = performance.now(), saveT = 0, uiT = 0;
/* Tuy chon hien thi luu rieng cho thiet bi (khong theo nhan vat): thu gon, co chu, tiet kiem pin */
export const UI_KEY = 'jxidle_ui', UI_FS = [0.9, 1, 1.15, 1.3], UI_FS_NAME = ['Nhỏ', 'Vừa', 'Lớn', 'Rất lớn'];
let UIP: any = null;
export function uiPrefs() {
  if (!UIP) { try { UIP = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch (e) { UIP = {}; } }
  UIP.fs = Number.isInteger(UIP.fs) && UIP.fs >= 0 && UIP.fs < UI_FS.length ? UIP.fs : 1; UIP.saver = !!UIP.saver; UIP.compact = !!UIP.compact;
  UIP.invBorderGlow = !!UIP.invBorderGlow; UIP.invHoverPreview = UIP.invHoverPreview === true; UIP.superFrames = !!UIP.superFrames; UIP.chatTransparency = !!UIP.chatTransparency;
  return UIP;
}
/* FPS hiệu lực (nguồn): tiết kiệm pin 30fps được ưu tiên; điện thoại mặc định 30,
   siêu khung hình cho phép chạy đầy; máy tính luôn đầy */
export const fullFps = () => { const p = uiPrefs(); return p.saver ? false : (isMobileUI() ? p.superFrames : true); };
/* Tiết kiệm pin: vẽ mỗi 4 khung trên điện thoại (15 FPS), mỗi 2 khung trên máy tính (30 FPS) — nguồn afk-saver-toggle */
export const saverStep = () => (isMobileUI() ? 4 : 2);
export function applyUiPrefs() { const p = uiPrefs(); document.documentElement.style.setProperty('--fs', String(UI_FS[p.fs])); document.body.classList.toggle('saver', p.saver); document.body.classList.toggle('compact', p.compact); document.body.classList.toggle('inv-border-glow', p.invBorderGlow); document.body.classList.toggle('chat-transparency', p.chatTransparency); }
export function setUiPref(o) { Object.assign(uiPrefs(), o); try { localStorage.setItem(UI_KEY, JSON.stringify(UIP)); } catch (e) { /* che do rieng tu */ } applyUiPrefs(); fitApp(); }
export function onZoneChange(z) { obsLoad(z.id); [H.x, H.y] = inWorld(H.x, H.y); for (const e of R.enemies) [e.x, e.y] = inWorld(e.x, e.y); for (const d of R.ground) [d.x, d.y] = inWorld(d.x, d.y); snapCamera(); R.bgImg = z.bg ? img(z.bg) : null; playMusic(z.id); preloadZoneSounds(z); if (curTab === 'log') refresh(); }
export function onStageChange() { if (curTab === 'log') refresh(); }
export function onLevelUp() { if (S.autoPts === true) { autoSpendAttrs(); autoSpendSkills(); } autoEquipAll(); if (!R.quiet) { checkHints(); updateDots(); renderPad(); dotGift(); if (LV_MS.some(m => m[0] === S.lvl)) toast(`Đạt mốc cấp ${S.lvl}: nhận quà ở nút 🎁`); } }
const STEP = 1 / 60, MAX_STEPS = 10, LERP_MAX = 120;
let simAcc = 0;
/* Toc do game (Bang thu nghiem): nhan vao thoi gian mo phong — vat ly van buoc 1/60s, chi chay nhieu buoc hon. */
export const GAME_SPEEDS = [1, 1.5, 2.5];
export const gameSpeed = () => (S && GAME_SPEEDS.includes(+(S as any).speed) ? +(S as any).speed : 1);
function movers() { return [H, R.petPos].concat(SV.on ? SV.en : R.enemies).filter(Boolean); }
function simulateFrame(dt) {
  simAcc += dt; let n = 0;
  while (simAcc >= STEP && n < MAX_STEPS) {
    for (const o of movers()) { o._px = o.x; o._py = o.y; }
    if (SV.on) svTick(STEP); else tick(STEP);
    simAcc -= STEP; n++;
  }
  if (n === MAX_STEPS) simAcc = 0;                       // may cham: bo phan tre, khong don buoc
}
function drawLerp(dt) {
  const a = simAcc / STEP, list = movers().filter(o => o._px !== undefined && Math.hypot(o.x - o._px, o.y - o._py) < LERP_MAX);
  for (const o of list) { o._cx = o.x; o._cy = o.y; o.x = o._px + (o.x - o._px) * a; o.y = o._py + (o.y - o._py) * a; }
  try { if (SV.on) svDraw(dt); else draw(dt); }
  finally { for (const o of list) { o.x = o._cx; o.y = o._cy; } }
}
/* Vong lap khong bao gio chet: moi buoc co try / catch rieng va luon dat lai requestAnimationFrame. */
let loopErr = 0, loopLast = '', drawCnt = 0;
export function guard(what, fn) {
  try { fn(); loopErr = Math.max(0, loopErr - 0.02); }
  catch (e) {
    loopErr++; const k = what + ': ' + (e && e.message) + (e && e.stack ? ' — ' + String(e.stack).split(String.fromCharCode(10)).slice(1, 4).map(x => x.trim()).join(' ← ') : '');
    if (k !== loopLast) { loopLast = k; console.error('[loi vong lap]', what, e); }
    if (loopErr > 30) {
      loopErr = 0; R.fx = []; R.txt = []; R.enemies = []; if (typeof SV !== 'undefined' && SV.on) { try { svExit(); } catch (x) { SV.on = false; } }
      R.spawnT = 0.5; R.deadT = 0; simAcc = 0; R.quiet = false; closeModal(true);
    }
  }
}
/* Phan giao dien nhe cua vong lap: log moi, hanh trang khi thay doi + bao React ve lai HUD */
function uiPump() {
  if (R.logDirty && curTab === 'log') { R.logDirty = false; renderLogOnly(); }
  if (invDirty && (curTab === 'inv' || curTab === 'auto')) { if (curTab === 'auto') renderAutoLootPanel(); else renderInv(); }
  renderSkBuffs();
  uiBump();
}
function frame(now) {
  const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
  guard('tay cam', gamepadPoll);
  if (S.fac && !document.hidden) {
    if (!R.town && !SV.on) jrAdd('sec', dt);              // so tay: giay choi that (khong tinh thanh / Luyen Cong)
    const gdt = dt * gameSpeed(); guard('mo phong', () => simulateFrame(gdt));
    drawCnt = (drawCnt + 1) % (fullFps() ? 1 : saverStep());
    if (fullFps() || drawCnt === 0) guard('ve', () => drawLerp(gdt));
  }
  uiT += dt;
  if (uiT > 0.1 && S.fac) {
    uiT = 0;
    guard('giao dien', uiPump);
  }
  saveT += dt;
  if (saveT > 10 && S.fac) guard('luu', () => { saveT = 0; loginCheck(); achCheck(); dotGift(); clanCheck(); const el = R.activeT || 0; if (el > 30) S.kps = R.kills / el; save(); });
  requestAnimationFrame(frame);
}
function showOffline(o) {
  if (!o) return;
  const h = Math.floor(o.secs / 3600), m = Math.floor(o.secs % 3600 / 60);
  modal(`<h3>Chào mừng trở lại!</h3><p class="desc">Vắng mặt ${h ? h + ' giờ ' : ''}${m} phút, nhân vật vẫn luyện công tại ${esc(zoneOf(Math.min(S.stage, STAGES)).n)}.</p>
    <div class="card stats"><span>Quái bị hạ</span><span>${fmt(o.kills)}</span><span>Kinh nghiệm</span><span>${fmt(o.xp)}</span>
    <span>Ngân lượng</span><span>${fmt(o.gold)}</span><span>Cấp</span><span>${o.lv0} → ${o.lv1}</span><span>Vật phẩm</span><span>${o.got}${o.sold ? ` (+${o.sold} bán)` : ''}</span>
    <span>Rương tu luyện</span><span>${o.chests || 0} / 3 mốc (1 · 4 · 8 giờ)</span></div>
    ${o.chests ? '<p class="desc">Quà các mốc đã vào túi — xem nhật ký Giang hồ.</p>' : ''}
    <div class="btnrow"><button class="btn" id="bOffOk">Nhận</button></div>`, () => { $('#bOffOk').onclick = () => closeModal(); });
}
/* ---------- che do treo may (AFK): overlay ☯ + tiet kiem pin + tat tieng, phuc hoi cau hinh khi thoat (nguon v119) ---------- */
const AFK_KEY = 'jxidle_afk';
let afkOn = false, afkPrev: any = null, afkEl: HTMLElement | null = null;
const afkReadSaved = () => { try { return JSON.parse(localStorage.getItem(AFK_KEY) || 'null'); } catch (e) { return null; } };
function afkStatus() {
  if (!afkOn || !S.fac) return;
  const st = document.querySelector('#afkSt'); if (!st) return;
  const stage = Math.min(S.stage, STAGES);
  st.innerHTML = `Cấp <b>${fmt(S.lvl)}</b> · ${esc(zoneOf(stage).n)} · Ải ${inZone(stage)}<br>Ngân lượng <b>${fmt(S.gold)}</b> · Tốc độ <b>x${gameSpeed()}</b>`;
}
export function setAfk(on: boolean) {
  if (on === afkOn) return;
  const snd = sndCfg();
  if (on) {
    if (!S.fac) return;                                   // man hinh chon nhan vat: chua treo duoc
    afkPrev = { saver: uiPrefs().saver, lowFx: S.lowFx, snd: snd.on, music: snd.music };
    try { localStorage.setItem(AFK_KEY, JSON.stringify(afkPrev)); } catch (e) { /* che do rieng tu */ }
    afkOn = true;
    setUiPref({ saver: true }); S.lowFx = true; snd.on = false; snd.music = false; audApply();
    afkStatus();
    if (afkEl) afkEl.classList.remove('hidden');
  } else {
    const saved = afkPrev || afkReadSaved();
    if (saved) { setUiPref({ saver: !!saved.saver }); S.lowFx = saved.lowFx; snd.on = !!saved.snd; snd.music = !!saved.music; audApply(); }
    afkPrev = null;
    try { localStorage.removeItem(AFK_KEY); } catch (e) { /* bo qua */ }
    afkOn = false;
    if (afkEl) afkEl.classList.add('hidden');
    if (S.fac) toast('Thoát chế độ treo máy');
    refresh();
  }
}
function initAfk() {
  if (afkEl || !$('#app')) return;
  afkEl = document.createElement('div');
  afkEl.id = 'afk'; afkEl.className = 'hidden';
  afkEl.setAttribute('role', 'status'); afkEl.setAttribute('aria-live', 'polite');
  afkEl.innerHTML = '<div class="afkbox"><div class="afkic" aria-hidden="true">☯</div><b>ĐANG TREO MÁY</b><div class="afkst" id="afkSt"></div><small>Chạm bất kỳ đâu hoặc nhấn B để tiếp tục</small></div>';
  $('#app').appendChild(afkEl);
  afkEl.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); setAfk(false); });
  (window as any).jxAfk = setAfk;
  try { Object.defineProperty(window as any, 'JXAFK', { configurable: true, get: () => afkOn }); } catch (e) { /* da co */ }
  setInterval(() => { if (afkOn) afkStatus(); }, 2000);
  /* Dong app khi dang treo may: tra lai cau hinh truoc do (nguon: boot retry xj) */
  const saved = afkReadSaved();
  if (saved) { setUiPref({ saver: !!saved.saver }); S.lowFx = saved.lowFx; const s2 = sndCfg(); s2.on = !!saved.snd; s2.music = !!saved.music; audApply(); try { localStorage.removeItem(AFK_KEY); } catch (e) { /* bo qua */ } }
}
/* Chieu cao that cua vung nhin (trinh duyet dien thoai: 100vh tinh ca phan bi thanh cong cu che) */
function fitApp() {
  document.body.classList.toggle('mob', isMobileUI());
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  if (h > 0) document.documentElement.style.setProperty('--app-h', Math.round(h) + 'px');
  document.documentElement.scrollTop = 0; document.body.scrollTop = 0;   // tranh trinh duyet tu cuon lam xep UI
  if (CV) resizeArena();
}
/* Che do thu gon: an bang thong tin + thanh tab, san dau chiem ca man hinh */
export function setCompact(on) { setUiPref({ compact: on }); if (!on && S.fac) refresh(); }
/* Goi mot lan sau khi React da mount (co #arena trong DOM). */
let booted = false;
export async function boot() {
  if (booted) return; booted = true;
  /* Hook gỡ lỗi: instance thật chạy boot mới gắn (bản port có thể có 2 bản module —
     island React + entry), getter đọc binding sống nên luôn thấy state đang chạy. */
  try { (window as any).__G = { get R() { return R; }, get H() { return H; }, get S() { return S; }, get MON() { return W.mon; }, recalc, RW, save, matAdd, matHave }; } catch (e) { /* bo qua */ }
  /* Du lieu mo ta media (hieu ung fx, vat can ban do, am thanh) nam trong goi assets —
     cho nap xong moi dung chi muc / bat dau ve. Thieu file thi van chay (khong hieu ung/am thanh). */
  /* Nap save NGAY (dong bo — load() chi doc localStorage, khong can
     du lieu jdata): S la save that truoc khi bat ki handler nao cua
     island co the goi (cua so React mount -> boot, HMR dev). */
  const pk = pickSlot(); setSlot(pk.slot);
  if (pk.menu) setS(newSave());          // man hinh chon nhan vat: chua nap nhan vat nao
  const had = pk.menu ? false : load();
  await loadJData();
  setCanvas($('#arena'));
  applyUiPrefs();
  fitApp();
  bindControls();
  initAfk();                       // overlay treo may + phuc hoi cau hinh (nguon v119)
  initWorldChat();                 // khung chat the gioi (offline: xem nhat ky he thong)
  window.addEventListener('resize', fitApp); window.addEventListener('orientationchange', fitApp);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitApp);
  const unlock = () => { audInit(); const z = zoneOf(Math.min(S.stage, STAGES)); preloadZoneSounds(z); if (AUD.music && sndCfg().music && AUD.music.paused) AUD.music.play().catch(() => {}); else if (!AUD.music && S.fac) playMusic(R.town ? W.town.id : z.id); };
  document.addEventListener('pointerdown', unlock, true); document.addEventListener('keydown', unlock, true);
  resizeArena(); [H.x, H.y] = inWorld(WORLD.w / 2, WORLD.h / 2); snapCamera(); restoreGround();
  if (pk.menu) slotMenu();
  else if (!S.fac) pickFaction();
  else {
    recalc(); R.life = R.P.life; R.mana = R.P.mana;
    if (had) { recalc(); showOffline(offlineGains()); }
    showTab('log'); log('Tiếp tục hành tẩu giang hồ…');
    if ((window as any).__tampered) { log('<span class="dim">Dữ liệu lưu không khớp chữ ký (đã chỉnh sửa ngoài game): dùng bản sao lưu gần nhất nếu có.</span>'); toast('Phát hiện chỉnh sửa file lưu'); }
    loginCheck(); dotGift();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (S.fac) save(); if (SV.on) svPause(); audioSuspendForBackground(); }
    else { audioResumeFromBackground(); if (S.fac && !SV.on && Date.now() - S.last > 60000) { R.dirty = true; recalc(); showOffline(offlineGains()); refresh(); } }
    lastT = performance.now();
  });
  window.addEventListener('pagehide', () => { if (S.fac) save(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal(); });   // Esc dong hop thoai
  /* Nguon: B bat "Treo may"; khi dang treo chi B/Escape thoat, moi phim khac bi chan */
  window.addEventListener('keydown', e => {
    const tg = e.target as HTMLElement | null;
    if (/INPUT|TEXTAREA|SELECT/.test((tg && tg.tagName) || '') || (tg && tg.isContentEditable) || e.repeat) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ((window as any).JXAFK) { e.preventDefault(); e.stopImmediatePropagation(); if (k === 'b' || k === 'Escape') setAfk(false); return; }
    if (k !== 'b' || e.ctrlKey || e.metaKey || e.altKey || SV.on) return;   // Luyện Công: không treo máy
    if (!S.fac) return;
    e.preventDefault(); e.stopImmediatePropagation(); setAfk(true);
  }, true);
  requestAnimationFrame(frame);
}

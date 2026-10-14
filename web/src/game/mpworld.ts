// @ts-nocheck — PK / Thế Giới multiplayer client, port nguồn v152 (bản 2.6.21)
/* ======================= THẾ GIỚI MULTIPLAYER (PK thường / Đồ Sát) =======================
   Port client từ bundle nguồn (state `$` quanh `volam_mp_mode`, hàm OF/kF/uF/mF/vF/gF/hF/DF/xm).
   KHÔNG wire-compatible với server nguồn (nguồn dùng Colyseus 0.17 binary) — chủ đích: ta TỰ
   dựng server, client dùng **WebSocket thuần JSON**, mỗi message 1 frame `{t:'move',...}` giữ
   nguyên TÊN + NGỮ NGHĨA 12 message của nguồn:
     move · profile · monsters · monster_skill · enemy_attack · enemy_damage · player_skill ·
     ground_drop · drop_pickup · pk_attack · pk_death · pk_mode
   Server URL: window.VOLAM_MP_URL || `${proto}//${host}/mp` (giống nguồn uF()).
   Chế độ: Map Mình (offline, mặc định) ↔ Thế Giới (nối room theo map, localStorage
   'volam_mp_mode'). PK 3 mức: tắt → PK thường (chỉ đánh người bật PK) → Đồ Sát (đánh mọi
   người cùng map ngoài trời), phím F9 — đúng nguồn mF().
   Mạn áp: Đồ Sát hạ người +1 điểm, 10 phút/điểm, còn điểm thì KHÔNG được về Map Mình (OF guard).
   Phase 1 (bản này): presence + di chuyển + PK state + UI + mạn áp + trọng thương modal.
   Phase 2 (khi có server): đồng bộ quái (monsters/mapHosts), đòn đánh người (pk_attack/
   enemy_damage), đồ rơi chung (ground_drop/drop_pickup) — plumbing sẵn, chưa kích hoạt.
   Kill switch: window.JX_MP_OFF = true → không tạo nút, không nối. window.__MP = test hooks. */
import { FAC, SERIES_COL, WORLD, clamp } from './core';
import { R, H } from './combat';
import { SV } from './survival';
import { S } from './save';
import { modal, toast, closeModal } from './ui';
import { goTown } from './control';

const MP_MODE_KEY = 'volam_mp_mode';
const MP_CLIENT_KEY = 'jxidle_mp_client_id';
const MURDER_MINUTES = 10;                       // nguồn: 10 phút/mạng
const MOVE_HZ = 10;                              // gửi toạ độ tối đa 10 lần/s
const MAX_PLAYERS = 60;

const $ = {
  worldMode: false, connected: false, remoteMode: false,
  statusState: '', statusText: '',
  pkMode: false, massacreMode: false, pkProtocolReady: true,
  murderCount: 0, murderDecayAt: 0,
  pkTargetId: '', autoPkTargetId: '', autoPkIgnoredId: '',
  ws: null, attempts: 0, reconnectTimer: 0, nextConnect: 0,
  players: new Map(),                             // id -> {id,name,fac,lvl,x,y,tx,ty,pk,mass,seen}
  activeRoom: '', lastMoveAt: 0, selfId: '',
};

const mpUrl = () => {
  if (typeof window !== 'undefined' && window.VOLAM_MP_URL) return String(window.VOLAM_MP_URL).replace(/\/+$/, '');
  if (typeof location === 'undefined') return 'ws://127.0.0.1:2567/mp';
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/mp`;
};
const clientId = () => {
  try {
    const saved = localStorage.getItem(MP_CLIENT_KEY);
    if (saved && /^[0-9a-f-]{16,64}$/i.test(saved)) return saved;
    const fresh = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(MP_CLIENT_KEY, fresh);
    return fresh;
  } catch (_) { return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`; }
};
const murderActive = () => $.murderCount > 0;
/* gF/hF nguồn: còn X mạng · khoảng ~Y đến khi về 0 (10 phút/điểm) */
const murderMinutesLeft = () => murderActive()
  ? Math.max(0, Math.round(($.murderDecayAt - Date.now()) / 60000) + ($.murderCount - 1) * MURDER_MINUTES) : 0;
const murderText = () => murderActive()
  ? `Đồ Sát · còn ${$.murderCount} mạng · khoảng ${murderMinutesLeft()} phút đến khi về 0. Chưa thể về Map Mình.` : '';

/* kF nguồn: room key theo chế độ đang chơi + chế độ thử thách (white/standard) */
export const roomKey = () => {
  const chal = S && S.chal === 'white' ? 'white' : 'standard';
  if (R.town) return `town:${chal}`;
  if (SV && SV.on) return `survival:${SV.zone && SV.zone.id || 'field'}:${chal}`;
  if (R.tk) return `tong-kim:${chal}`;
  if (R.tyvo) return `ty-vo:${chal}`;
  if (R.tower) return `tower:${R.tower.id || 1}:${R.tower.floor || 1}:${chal}`;
  if (R.dg) return `activity:${R.dg.kind || 'dungeon'}:${R.zoneShown || 'room'}:${chal}`;
  return `field:${(S && S.stage) || 1}:${chal}`;
};

function setStatus(text, state) {
  $.statusText = text; $.statusState = state || '';
  const el = document.getElementById('mpStatus');
  if (el) {
    el.textContent = text;
    el.dataset.state = $.worldMode ? ($.statusState || 'local') : 'local';
    el.setAttribute('aria-pressed', String($.worldMode));
  }
}
const statusRefresh = () => {
  if (!$.worldMode) setStatus('Map Mình', 'local');
  else if (!$.connected) setStatus('Thế giới · đang nối', 'wait');
  else setStatus(`Thế giới · ${$.players.size} người${$.pkMode ? ` · ${$.massacreMode ? 'ĐỒ SÁT' : 'PK'}` : ''}`, 'ok');
  pkButtonRefresh();
};

/* ---------- kết nối (JSON-WS, retry backoff như chat.ts) ---------- */
function connect() {
  if ($.ws || !$.worldMode || stopped()) return;
  const url = `${mpUrl()}?room=${encodeURIComponent(roomKey())}&cid=${encodeURIComponent(clientId())}`;
  let ws;
  try { ws = new WebSocket(url); } catch (e) { scheduleReconnect(); return; }
  $.ws = ws;
  setStatus('Thế giới · đang nối', 'wait');
  ws.onopen = () => {
    $.connected = true; $.attempts = 0; $.activeRoom = roomKey(); $.selfId = clientId();
    send('profile', profilePayload());
    send('pk_mode', { mode: $.pkMode ? ($.massacreMode ? 'massacre' : 'pk') : 'off' });
    statusRefresh();
  };
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
    if (m && m.t) handle(m);
  };
  ws.onclose = () => {
    $.ws = null; $.connected = false;
    $.players.clear(); $.remoteMode = false;
    if ($.worldMode) { setStatus('Thế giới đang mất kết nối', 'error'); scheduleReconnect(); }
    else statusRefresh();
  };
  ws.onerror = () => { try { ws.close(); } catch (_) { /* onclose lo phần còn lại */ } };
}
function scheduleReconnect() {
  if ($.reconnectTimer || !$.worldMode) return;
  const wait = Math.min(30000, 1000 * 2 ** Math.min($.attempts++, 5)) * (0.75 + Math.random() * 0.5);
  $.reconnectTimer = setTimeout(() => { $.reconnectTimer = 0; connect(); }, wait);
}
function disconnect() {
  if ($.reconnectTimer) { clearTimeout($.reconnectTimer); $.reconnectTimer = 0; }
  const ws = $.ws;
  $.ws = null; $.connected = false; $.remoteMode = false;
  $.pkMode = false; $.massacreMode = false;
  $.players.clear(); $.activeRoom = '';
  try { ws && ws.close(); } catch (_) {}
  statusRefresh();
}
const send = (t, data) => {
  const ws = $.ws;
  if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ t, ...data })); } catch (_) {} }
};

function profilePayload() {
  const fac = S && S.fac;
  return {
    id: $.selfId || clientId(), name: String((S && S.name) || (FAC[fac] && FAC[fac].n) || 'Hiệp khách').slice(0, 24),
    faction: fac || '', level: Math.max(1, Number(S && S.lvl) || 1),
    reborn: Math.max(0, Number(S && S.rw && S.rw.stat && S.rw.stat.reborn) || 0),
    chal: (S && S.chal) || '',
  };
}

/* ---------- nhận message (nguồn: các room.on handler) ---------- */
function handle(m) {
  switch (m.t) {
    case 'welcome':
      $.selfId = m.id || $.selfId;
      $.pkProtocolReady = m.protocol !== 1;          // server cũ protocol 1: chưa có Đồ Sát
      if (typeof m.murder === 'number') { $.murderCount = m.murder | 0; $.murderDecayAt = Number(m.murderDecayAt) || 0; }
      statusRefresh();
      break;
    case 'profile': {                                 // người vào room / cập nhật hồ sơ
      const id = String(m.id || '');
      if (!id || id === $.selfId) break;
      const p = $.players.get(id) || { x: H.x, y: H.y, tx: H.x, ty: H.y };
      $.players.set(id, {
        ...p, id, name: String(m.name || 'Hiệp khách').slice(0, 24), fac: String(m.faction || ''),
        lvl: Math.max(1, Number(m.level) || 1), pk: m.pkMode === true, mass: m.massacre === true,
        seen: Date.now(),
      });
      if ($.players.size > MAX_PLAYERS) {
        const oldest = [...$.players.entries()].sort((a, b) => a[1].seen - b[1].seen)[0];
        if (oldest) $.players.delete(oldest[0]);
      }
      statusRefresh();
      break;
    }
    case 'move': {
      const p = $.players.get(String(m.id || ''));
      if (p) { p.tx = clamp(Number(m.x) || 0, 0, WORLD.w); p.ty = clamp(Number(m.y) || 0, 0, WORLD.h); p.seen = Date.now(); }
      break;
    }
    case 'leave': $.players.delete(String(m.id || '')); statusRefresh(); break;
    case 'pk_mode':                                   // server xác nhận trạng thái PK của chính mình
      $.pkMode = m.mode === 'pk' || m.mode === 'massacre';
      $.massacreMode = m.mode === 'massacre';
      if (typeof m.murder === 'number') { $.murderCount = m.murder | 0; $.murderDecayAt = Number(m.murderDecayAt) || 0; }
      statusRefresh();
      break;
    case 'murder':                                    // server cập nhật mạn áp (giết/người khác报告)
      $.murderCount = Math.max(0, Number(m.count) | 0);
      $.murderDecayAt = Number(m.decayAt) || 0;
      statusRefresh();
      break;
    case 'pk_death':                                  // người khác chết vì ta → server đã cộng mạn áp
      if (typeof m.murder === 'number') { $.murderCount = m.murder | 0; $.murderDecayAt = Number(m.murderDecayAt) || 0; statusRefresh(); }
      break;
    /* Phase 2 — plumbing nhận, chưa kích hoạt hành vi game: */
    case 'monsters': case 'monster_skill': case 'enemy_attack': case 'enemy_damage':
    case 'player_skill': case 'ground_drop': case 'drop_pickup': case 'pk_attack':
      if (typeof window !== 'undefined' && window.__MP_PHASE2) window.__MP_PHASE2(m);
      break;
  }
}

/* ---------- đổi chế độ Thế giới/Map Mình (nguồn OF) ---------- */
function toggleWorld(target) {
  target = !!target;
  if ($.worldMode === target) return;
  if (!target && murderActive()) { toast(murderText()); return; }
  $.worldMode = target;
  try { localStorage.setItem(MP_MODE_KEY, target ? 'world' : 'local'); } catch (_) {}
  $.nextConnect = 0;
  if (!target) { disconnect(); }
  else { connect(); }
  statusRefresh();
}

/* ---------- vòng 3 mức PK (nguồn mF): tắt → PK thường → Đồ Sát → tắt ---------- */
function cyclePk() {
  if (!$.worldMode || !$.connected || !$.ws) { toast('Hãy kết nối bản đồ Thế giới để đổi chế độ PK'); return; }
  if ($.pkMode && !$.massacreMode && !$.pkProtocolReady) {
    toast('Máy chủ multiplayer chưa cập nhật. Cần khởi động lại server để bật Đồ Sát.');
    return;
  }
  if ($.pkMode) {
    if ($.massacreMode) { $.pkMode = false; $.massacreMode = false; }
    else $.massacreMode = true;
  } else { $.pkMode = true; $.massacreMode = false; }
  send('pk_mode', { mode: $.pkMode ? ($.massacreMode ? 'massacre' : 'pk') : 'off' });
  pkButtonRefresh(); statusRefresh();
}
function pkButtonRefresh() {
  const el = document.getElementById('mpPkMode');
  if (!el) return;
  el.textContent = $.massacreMode ? 'ĐỒ SÁT' : $.pkMode ? 'PK · BẬT' : 'PK · TẮT';
  el.dataset.state = $.massacreMode ? 'mass' : $.pkMode ? 'on' : 'off';
  el.setAttribute('aria-pressed', String($.pkMode));
  const hint = murderActive() ? `${murderText()} ` : '';
  el.title = $.worldMode && $.connected
    ? `${hint}Bấm hoặc nhấn F9 để đổi. PK thường chỉ đánh người đã bật PK; Đồ Sát đánh được mọi người chơi cùng map ngoài trời.${$.pkProtocolReady ? '' : ' Cần khởi động lại máy chủ multiplayer để bật Đồ Sát.'}`
    : 'Cần kết nối bản đồ Thế giới để đổi chế độ PK';
  el.hidden = !($.worldMode && $.connected);
}

/* ---------- trọng thương (nguồn: chết bởi người chơi → modal Về thành dưỡng sức) ---------- */
export function onDeathByPlayer(killerName) {
  modal(`<h3>Bạn đã trọng thương</h3><p class="desc">Bạn bị ${String(killerName || 'đối thủ')} đánh trọng thương.</p>
    <div class="btnrow pk-death-actions"><button type="button" class="btn sm detail-count-btn" id="pkReturnTown">Về thành dưỡng sức</button></div>`, () => {
    const b = document.getElementById('pkReturnTown');
    if (b) b.onclick = () => { closeModal(); goTown(); };
  });
}

/* ---------- tick: gửi move + vẽ người khác (gọi từ loop) ---------- */
export function mpTick(dt) {
  if (!$.worldMode) return;
  if ($.connected && $.ws) {
    if (roomKey() !== $.activeRoom) { disconnect(); connect(); }        // đổi map → đổi room
    const now = Date.now();
    if (now - $.lastMoveAt > 1000 / MOVE_HZ && (H.x !== H.px || H.y !== H.py || now - $.lastMoveAt > 1000)) {
      $.lastMoveAt = now;
      send('move', { x: Math.round(H.x), y: Math.round(H.y), map: roomKey() });
    }
  }
  // nội suy di chuyển + dọn người biến mất quá 30s
  const now = Date.now();
  for (const [id, p] of $.players) {
    const k = Math.min(1, dt * 8);
    p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
    if (now - p.seen > 30000) $.players.delete(id);
  }
}

/* ---------- vẽ (render.ts gọi qua ents(): người chơi khác chen vào y-sort chung) ---------- */
export function mpEnts() {
  if (!$.worldMode || !$.players.size) return [];
  return [...$.players.values()].filter(p => Math.abs(p.x - H.x) < 900 && Math.abs(p.y - H.y) < 600)
    .map(p => ({ mp: true, y: p.y, p }));
}
export function mpDrawOne(c, e) {
  const p = e.p;
  c.save();
  c.fillStyle = '#0007'; c.beginPath(); c.ellipse(p.x, p.y, 13, 5, 0, 0, 7); c.fill();
  c.fillStyle = p.mass ? '#ff5b5b' : SERIES_COL[p.fac] || '#cfd6ff';
  c.beginPath(); c.arc(p.x, p.y - 16, 10, 0, 7); c.fill();
  c.strokeStyle = p.pk ? '#ffd24a' : '#0006'; c.lineWidth = 1.6; c.stroke();
  c.font = '10px "IBM Plex Mono", monospace'; c.textAlign = 'center';
  c.fillStyle = '#000a'; c.fillText(`${p.name} · Lv${p.lvl}`, p.x + 1, p.y - 31);
  c.fillStyle = p.mass ? '#ff8a8a' : '#e8e2d0'; c.fillText(`${p.name} · Lv${p.lvl}`, p.x, p.y - 32);
  c.restore();
}

/* ---------- UI + phím ---------- */
let stopped = () => typeof window !== 'undefined' && window.JX_MP_OFF === true;
export function mpWire() {
  if (stopped() || typeof document === 'undefined') return;
  try { $.worldMode = localStorage.getItem(MP_MODE_KEY) === 'world'; } catch (_) {}
  const battle = document.getElementById('battle');
  if (battle && !document.getElementById('mpStatus')) {
    const wrap = document.createElement('div');
    wrap.className = 'mp-wrap';
    wrap.innerHTML = `<button type="button" id="mpStatus" class="mp-status" aria-pressed="false">Map Mình</button>
      <button type="button" id="mpPkMode" class="mp-pk" hidden>PK · TẮT</button>`;
    battle.appendChild(wrap);
    wrap.querySelector('#mpStatus').addEventListener('click', () => toggleWorld(!$.worldMode));
    wrap.querySelector('#mpPkMode').addEventListener('click', cyclePk);
  }
  if (!mpWire.bound) {
    mpWire.bound = true;
    document.addEventListener('keydown', e => {
      if (e.key === 'F9' && !window.JX_MP_OFF) { e.preventDefault(); cyclePk(); }
    });
  }
  if ($.worldMode) connect();
  statusRefresh();
}

/* ---------- test hooks + boot wiring ---------- */
if (typeof window !== 'undefined') {
  window.__MP = {
    get state() { return $; },
    toggleWorld, cyclePk, connect, disconnect,
    roomKey, mpEnts, mpDrawOne, onDeathByPlayer,
    handle, send, murderText,
    /* test: tiêm socket giả */
    _setSocket(fake) { $.ws = fake; $.connected = true; $.activeRoom = roomKey(); },
  };
}

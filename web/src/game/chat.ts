// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { FAC, RAR_COL, SERIES_COL, clamp, esc } from './core';
import { itemSharePayload, modal } from './ui';
import { R } from './combat';
import { S } from './save';

/* ======================= CHAT THE GIOI (port tu volam.vinarpg.com/js/chat.js) =======================
   Ket noi server chat qua Cloudflare Worker proxy: /api/chat/* tuyet doi ve
   https://vo-lam-idle.tannhatcms.io.vn (Worker lo CORS). PHAI DUNG URL TUYET DOI
   vi tren Android WebView chay o origin androidplatform.net (WebViewAssetLoader) —
   URL tuong doi se resolve thanh androidplatform.net/api/chat/* -> 404:
   - GET  /api/chat/status            kiem tra API san sang (fallback GET /api/chat/messages?limit=1)
   - GET  /api/chat/stream?client_id  EventSource SSE: open / ready {messages,online} / message / presence / error
   - POST /api/chat/messages          gui tin {name,faction,level,message,client_id,item?}
   - POST /api/chat/presence          heartbeat 45s {client_id, profile?} — server luu profile
                                      theo ten (port chat.js nguon: do client day profile len,
                                      GET /api/chat/profile?name= doc lai — khong thi 404).
   client_id: crypto.randomUUID() luu localStorage "jxidle_chat_client_id".
   Gioi han: tin <=240 ky tu, cooldown 1500ms phia client, DOM toi da 80 tin, dedupe theo id,
   reconnect backoff min(30000,1000*2^attempts) x jitter 0.75-1.25.
   Identity (name/faction/level) doc tu state luu S — chi doc BEN TRONG ham (goi sau khi boot),
   KHONG doc o top-level module (bi crash "at module evaluation" + SSR next build).
   Kill switch: window.JX_CHAT_OFFLINE = true -> bo ket noi, khung chi con tab Nhat ky he thong.
   Tab "Nhat ky" = R.logs (cung nhat ky voi the Giang ho; ui.ts log() goi window.syncWorldChatSystem).
   Chia se trang bi: window.prepareWorldChatItem (ui.ts "Dang the gioi" goi),
   xem tin chia se: window.showSharedItem (ui.ts). */

/* Viet tat ten mon phai (giong chat.js ban nguon). */
const FACTION_SHORT = {
  shaolin: 'TL', emei: 'NM', tangmen: 'ĐM', wudang: 'VĐ', wudu: 'NĐ',
  cuiyan: 'TY', gaibang: 'CB', kunlun: 'CL', tianwang: 'TV', tianren: 'TN'
};
const CHAT_SHOW_TIME_KEY = 'jxidle_chat_show_time';
const GM_TOKEN_SESSION_KEY = 'jxidle_chat_gm_token';
const CLIENT_ID_KEY = 'jxidle_chat_client_id';
const IDLE_FRAME_MS = 5000;
/* Ô trang bị trong hồ sơ nhân vật (gồm 11 ô như lt ban nguồn). */
const PROFILE_SLOTS = [
  ['weapon', 'Vũ khí'], ['armor', 'Áo'], ['helm', 'Mũ'], ['belt', 'Đai lưng'],
  ['boot', 'Giày'], ['cuff', 'Hộ uyển'], ['amulet', 'Dây chuyền'],
  ['ring1', 'Nhẫn 1'], ['ring2', 'Nhẫn 2'], ['pendant', 'Ngọc bội'], ['horse', 'Ngựa']
];
const PROFILE_CHALLENGE = { nopot: 'Không dùng thuốc', white: 'Bố Y', hard: 'Khó' };
/* Base URL tuyet doi cua Worker proxy (xem comment tren — de chat chay duoc
   tren WebViewAssetLoader cua Android, origin khac voi domain web). */
const CHAT_API = 'https://vo-lam-idle.tannhatcms.io.vn';
const MAX_MESSAGES = 80;

/* Ten mien (JX_VI.names: Han -> Viet) — giong core.js ban nguon; duong du lieu nay
   khong co trong game ta nen viMessage la identity pass-through (khong anh huong gi).
   Tinh regex LAN (doc window.JX_VI ben trong ham — module nay co the duoc SSR dung
   luc next build, khong duoc dung window o top-level). */
const viName = s => { const text = String(s); return (typeof window !== 'undefined' && window.JX_VI && window.JX_VI.names[text]) || text; };
let viNameRe = null, viNameReDone = false;
const viMessage = s => {
  const text = String(s);
  if (typeof window === 'undefined' || !window.JX_VI) return text;
  if (!viNameReDone) {
    viNameReDone = true;
    const names = Object.keys(window.JX_VI.names || {}).sort((a, b) => b.length - a.length);
    viNameRe = names.length ? new RegExp(names.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu') : null;
  }
  return viNameRe && /\p{Script=Han}/u.test(text) ? text.replace(viNameRe, m => viName(m)) : text;
};

/* Con tro DOM (null cho den khi initWorldChat — khoi tao trong boot, sau khi nap save). */
let root = null, battle = null, inputModeButton = null;
let toggle = null, panel = null, maximizeButton = null;
let list = null, systemList = null, form = null, input = null, sendButton = null;
let emojiToggle = null, emojiPicker = null, emojiGrid = null, emojiClose = null;
let unreadBadge = null, onlineLabel = null, statusLabel = null;
let tabButtons = [];

let showTime = true;
let source = null;
let reconnectTimer = 0;
let reconnectAttempts = 0;
let stopped = false;
let updatePaused = false;
let apiAvailable = false;
let unread = 0;
let lastSentAt = 0;
let idleFrameTimer = 0;
let draftItemPayload = null;
let itemDraftEnterArmed = false;
let activeTab = 'world';
const knownIds = new Set();
const recent = [];
let smileyEmojis = null;

/* GM token: luu session + fragment ?gm= cua URL (giong ban nguon). Tinh LAN vi
   sessionStorage/location chi dung duoc tren client, khong dung khi SSR. */
let gmTokenCache = null, gmTokenLoaded = false;
function consumeGmToken() {
  let token = '';
  try { token = sessionStorage.getItem(GM_TOKEN_SESSION_KEY) || ''; } catch (_) { /* Token fragment vẫn dùng được nếu storage bị chặn. */ }
  if (typeof location === 'undefined' || !location.hash) return token;
  let linkedToken = '';
  try { linkedToken = new URLSearchParams(location.hash.slice(1)).get('gm') || ''; } catch (_) { /* Bỏ qua fragment lỗi định dạng. */ }
  if (!linkedToken) return token;
  token = linkedToken.slice(0, 256);
  try { sessionStorage.setItem(GM_TOKEN_SESSION_KEY, token); } catch (_) { /* Dùng token trong phiên hiện tại. */ }
  try { history.replaceState(history.state, '', `${location.pathname}${location.search}`); } catch (_) { /* Không làm gián đoạn chat nếu không xóa được fragment. */ }
  return token;
}
function gmToken() {
  if (!gmTokenLoaded) { gmTokenCache = consumeGmToken(); gmTokenLoaded = true; }
  return gmTokenCache;
}

/* Đẩy nút #inBtn lên trên khung chat (desktop landscape) để không bị che —
   nút này do React ve, chỉ thêm inline style top (React không quản lý style đó). */
function positionInputModeButton() {
  if (!inputModeButton || !panel) return;
  if (root.hidden || panel.hidden || !document.body.classList.contains('deskland')) {
    inputModeButton.style.removeProperty('top');
    inputModeButton.style.removeProperty('bottom');
    return;
  }
  const panelRect = panel.getBoundingClientRect();
  const battleRect = battle.getBoundingClientRect();
  const scale = battle.offsetHeight ? battleRect.height / battle.offsetHeight : 1;
  const top = Math.max(0, (panelRect.top - battleRect.top) / scale - inputModeButton.offsetHeight - 8);
  inputModeButton.style.setProperty('top', `${top}px`, 'important');
  inputModeButton.style.setProperty('bottom', 'auto', 'important');
}

/* Bang bieu cuoi (giong chat.js ban nguon). */
function buildSmileyEmojis() {
  const ranges = [
    [0x2639, 0x263a], [0x1f600, 0x1f644],
    [0x1f910, 0x1f917], [0x1f920, 0x1f92f],
    [0x1f970, 0x1f97a], [0x1f9d0, 0x1f9d0],
    [0x1fae0, 0x1fae8]
  ];
  const emojis = [];
  for (const [from, to] of ranges) for (let cp = from; cp <= to; cp++) {
    const char = String.fromCodePoint(cp);
    emojis.push(cp <= 0x263a ? `${char}\ufe0f` : char);
  }
  return [...new Set(emojis)];
}

function renderSmileys() {
  if (!smileyEmojis) smileyEmojis = buildSmileyEmojis();
  const fragment = document.createDocumentFragment();
  for (const emoji of smileyEmojis) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wc-emoji-item';
    button.dataset.emoji = emoji;
    button.textContent = emoji;
    button.title = emoji;
    button.setAttribute('aria-label', emoji);
    button.setAttribute('role', 'gridcell');
    fragment.append(button);
  }
  emojiGrid.replaceChildren(fragment);
  emojiGrid.scrollTop = 0;
}

function setEmojiPicker(open, refresh = true) {
  if (open) renderSmileys();
  emojiPicker.hidden = !open;
  panel.classList.toggle('wc-emoji-open', open);
  root.classList.toggle('wc-emoji-active', open);
  emojiToggle.setAttribute('aria-expanded', String(open));
  if (refresh && !panel.hidden) showFrameAndStartIdle();
}

function insertEmoji(emoji) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  if (input.value.length - (end - start) + emoji.length > input.maxLength) return;
  input.setRangeText(emoji, start, end, 'end');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  setEmojiPicker(false);
  input.focus({ preventScroll: true });
}

function clientId() {
  try {
    const saved = localStorage.getItem(CLIENT_ID_KEY);
    if (saved && /^[0-9a-f-]{16,64}$/i.test(saved)) return saved;
    const fresh = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, fresh);
    return fresh;
  } catch (_) {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  }
}

/* Identity bat buoc: ten + mon phai. Doc S (live binding cua save.ts) ben trong
   ham — goi khi gui tin, luc nay save da nap xong. Chua co nhan vat -> ten rong
   -> send() bao "Hay tao nhan vat truoc". */
function identity() {
  const st = S;
  const playerFaction = st && st.fac && FAC[st.fac] ? FAC[st.fac] : null;
  return {
    name: playerFaction ? String(st.name || playerFaction.n).trim().slice(0, 24) : '',
    faction: playerFaction ? st.fac : '',
    level: st && st.fac ? Math.max(1, Number(st.lvl) || 1) : 1,
    challenge_mode: st && ['white', 'hard', 'nopot'].includes(st.chal) ? st.chal : ''
  };
}

/* ======================= PRESENCE (port upstream chat.js Ce()/ke()) =====================
   Ban nguon ONLINE-FIRST: server game = server chat, ho so nhan vat doc tu
   session. Ban port ta: server chi biet ten tin nhan -> CLIENT phai day
   profile len qua POST /api/chat/presence (heartbeat 45s, chi gui khi doi).
   Server luu profile theo ten -> GET /api/chat/profile?name= doc lai duoc,
   ke ca chinh minh (khong do: bam ten minh tren chat = 404 "chua gui ho so"). */
function chatProfile() {
  const who = identity();
  const st = S;
  if (!who.name || !who.faction || !st) return null;
  const stat = (st.rw && st.rw.stat) || {};
  const equipment = {};
  for (const [slot] of PROFILE_SLOTS) {
    const item = st.eq && st.eq[slot];
    equipment[slot] = item ? itemSharePayload(item) : null;
  }
  return {
    ...who,
    rank_id: null,
    attributes: Object.fromEntries(['str', 'dex', 'vit', 'eng'].map(key => [key, Math.max(0, Math.floor(Number((st.attr || {})[key]) || 0))])),
    tower_best: Math.max(0, Number(stat.towerBest) || 0, Number(stat.tower2Best) || 0),
    bosses: Math.max(0, Number(stat.bosses) || 0),
    reborn: Math.max(0, Number(stat.reborn) || 0),
    combat_power: Math.min(2e9, Math.max(0, Math.floor(Number(R.power) || 0))),
    equipment
  };
}

const PRESENCE_INTERVAL_MS = 45000;      // giong ban nguon: setInterval(ke, 45e3)
let presenceTimer = 0;
let presenceInFlight = false;
let presenceKnown = false;               // server da co profile cua ta chua
let presenceStatsJson = '';              // JSON cac field khong doi -> khong gui lai
let presenceEquipmentJson = '';

/* Mo ket noi thanh cong -> goi 1 lan, sau do dinh ky 45s. Idempotent
   (reconnect khong tao nhieu interval). */
function startPresence() {
  if (presenceTimer || stopped) return;
  presenceTimer = setInterval(() => { void sendPresence(); }, PRESENCE_INTERVAL_MS);
  void sendPresence();
}

async function sendPresence(retry = 0) {
  if (stopped || presenceInFlight) return;
  const profile = chatProfile();
  presenceInFlight = true;
  try {
    const statsJson = profile ? JSON.stringify({
      name: profile.name, faction: profile.faction, level: profile.level,
      rank_id: profile.rank_id, attributes: profile.attributes,
      challenge_mode: profile.challenge_mode, tower_best: profile.tower_best,
      bosses: profile.bosses, reborn: profile.reborn, combat_power: profile.combat_power
    }) : '';
    const equipmentJson = profile ? JSON.stringify(profile.equipment) : '';
    const equipmentChanged = !!profile && (!presenceKnown || equipmentJson !== presenceEquipmentJson);
    const statsChanged = equipmentChanged || (!!profile && (!presenceKnown || statsJson !== presenceStatsJson));
    // Luon ping {client_id} (giup server biet ta con truc tuyen); profile
    // chi dang ky khi moi (hoac doi) — giong ke() ban nguon.
    const payload = { client_id: clientId() };
    if (!profile) payload.profile = null;
    else if (statsChanged) {
      payload.profile = { ...profile };
      if (!equipmentChanged && presenceKnown) delete payload.profile.equipment;
    }
    const response = await fetch(`${CHAT_API}/api/chat/presence`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 409 && result.needs_profile) {
      // Server dam bao co profile day du: xoa cache, gui lai ngay (to da 1 lan).
      presenceKnown = false;
      presenceStatsJson = '';
      presenceEquipmentJson = '';
      if (retry < 1) return void sendPresence(retry + 1);
      return;
    }
    if (!response.ok) return;
    presenceKnown = !!profile;
    presenceStatsJson = statsJson;
    presenceEquipmentJson = equipmentJson;
  } catch (_) { /* Heartbeat khong quan trong — bo qua loi mang. */ }
  finally { presenceInFlight = false; }
}

function showStatus(text, state = '') {
  statusLabel.textContent = text;
  statusLabel.dataset.state = state;
  statusLabel.hidden = !text;
}

/* ======================= HO SO NHAN VAT (port upstream 2026-10-11) =======================
   Bam ten nhan vat tren chat the gioi -> GET /api/chat/profile?name= (404 = dang
   offline hoac chua gui ho so) -> modal thong tin: phai, cap, chuyen sinh, challenge
   mode, luc chien / Thap / trum da ha, luoi trang bi (mo itemModal qua
   window.showSharedItem — dinh dang snapshot giong tin nhan chia se). */
function openProfile(name) {
  if (!name) return;
  showStatus('Đang tải hồ sơ trực tuyến…', 'wait');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  fetch(`${CHAT_API}/api/chat/profile?name=${encodeURIComponent(name)}`, { cache: 'no-store', signal: controller.signal })
    .then(async response => {
      const data = await response.json().catch(() => ({}));
      if (response.status === 404) { showStatus('', ''); return; }
      if (!response.ok) throw new Error(data.error || 'Không tải được hồ sơ nhân vật.');
      if (typeof window.showWorldChatProfile !== 'function') throw new Error('Màn hình hồ sơ chưa sẵn sàng.');
      window.showWorldChatProfile(data.profile);
      showStatus('', 'ok');
    })
    .catch(error => {
      if (error.name === 'AbortError') { showStatus('', ''); return; }
      const text = error.message || 'Không kết nối được hồ sơ trực tuyến.';
      showStatus(text, 'error');
      console.warn('[chat] ' + text);
    })
    .finally(() => clearTimeout(timer));
}

const profileNum = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const profileReqLevel = item => {
  const row = Array.isArray(item.requirements)
    ? item.requirements.find(q => Array.isArray(q) && Number(q[0]) === 36) : null;
  return row ? profileNum(row[1]) : 0;
};
function showWorldChatProfile(profile) {
  if (!profile || typeof profile !== 'object' || !profile.equipment) return;
  const faction = FAC[profile.faction];
  const factionName = faction ? faction.n : String(profile.faction || 'Giang hồ');
  const updated = new Date(Number(profile.updated_at) * 1000);
  const updatedText = Number.isFinite(updated.getTime())
    ? updated.toLocaleString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : 'đang trực tuyến';
  const reborn = profileNum(profile.reborn);
  const subtitle = `${esc(factionName)} · cấp ${profileNum(profile.level)}${reborn ? ` · chuyển sinh ${reborn}` : ''}`;
  const slots = PROFILE_SLOTS.map(([key, label]) => {
    const item = profile.equipment[key];
    if (!item) return `<div class="world-profile-slot"><span>${esc(label)}</span><div class="world-profile-empty" aria-label="${esc(label)}: chưa trang bị">—</div></div>`;
    const rarity = clamp(Number(item.rarity) || 0, 0, RAR_COL.length - 1);
    const setCls = item.set && item.set.kind === 'gold' ? ' goldset' : item.set && item.set.kind === 'platina' ? ' platinaset' : !item.set && rarity === 3 ? ' purpleitem' : !item.set && rarity === 1 ? ' magicitem' : '';
    const enhance = profileNum(item.enhancement) || profileNum(item.platinum);
    const reqLevel = profileReqLevel(item);
    const seriesColor = Number.isInteger(item.series) && item.series >= 0 ? SERIES_COL[item.series] : '';
    const dot = seriesColor ? `<b class="s5" style="background:${seriesColor}"></b>` : '';
    const locked = item.locked ? `<u class="lk" aria-label="Đã khóa">🔒</u>` : '';
    const icon = item.icon ? `<img src="${esc(String(item.icon))}" alt="" draggable="false">` : '';
    const tip = `${String(item.name || 'Trang bị')} · yêu cầu cấp ${reqLevel || '—'} · bậc ${profileNum(item.tier)}${enhance ? ` · +${enhance}` : ''}${profileNum(item.platinum) ? ` · Bạch Kim +${profileNum(item.platinum)}` : ''}`;
    return `<div class="world-profile-slot"><span>${esc(label)}</span><button type="button" class="it world-profile-item r${rarity}${setCls}" data-profile-item="${esc(key)}" title="${esc(tip)}" aria-label="Xem thuộc tính ${esc(tip)}">${icon}<i>${reqLevel || '—'}</i>${enhance ? `<em>+${enhance}</em>` : ''}${dot}${locked}</button></div>`;
  }).join('');
  const challenge = PROFILE_CHALLENGE[profile.challenge_mode] ? `<small class="world-profile-challenge">${esc(PROFILE_CHALLENGE[profile.challenge_mode])}</small>` : '';
  const tower = profileNum(profile.tower_best), bosses = profileNum(profile.bosses), power = profileNum(profile.combat_power);
  modal(`<header class="world-profile-heading"><div><h3>${esc(String(profile.name || 'Nhân vật').slice(0, 24))}</h3><div class="world-profile-meta">${subtitle}${challenge}</div></div></header>
    <div class="world-profile-stats">${power ? `Lực chiến ${power.toLocaleString('vi-VN')} <i>·</i> ` : ''}Tháp tầng ${tower.toLocaleString('vi-VN')} <i>·</i> Trùm đã hạ ${bosses.toLocaleString('vi-VN')} <small>· cập nhật ${esc(updatedText)}</small></div>
    <div class="world-profile-equip">${slots}</div>`, () => {
      document.querySelectorAll('#mBody [data-profile-item]').forEach(button => {
        button.onclick = () => {
          const item = profile.equipment[button.dataset.profileItem];
          if (item && typeof window.showSharedItem === 'function') window.showSharedItem(item, null);
        };
      });
    });
  const modalEl = document.getElementById('modal');
  if (modalEl) modalEl.classList.add('item-preview-modal', 'world-player-profile');
}
window.showWorldChatProfile = showWorldChatProfile;

function setUnread(value) {
  unread = value;
  unreadBadge.textContent = unread > 99 ? '99+' : String(unread);
  unreadBadge.hidden = unread < 1;
}

function timeText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function renderMessage(message) {
  const article = document.createElement('div');
  article.className = 'wc-line';
  const time = document.createElement('span');
  time.className = 'wc-time';
  time.textContent = timeText(message.created_at);
  time.hidden = !showTime;
  const timeSpace = document.createElement('span');
  timeSpace.className = 'wc-time-space';
  timeSpace.textContent = ' ';
  timeSpace.hidden = !showTime;
  const player = document.createElement('button');
  player.type = 'button';
  player.className = 'wc-name wc-profile-link';
  const isGm = message.is_gm === true;
  if (isGm) player.classList.add('wc-gm-name');
  if (message.challenge_mode === 'white') player.classList.add('wc-boyo-name');
  if (message.challenge_mode === 'hard') player.classList.add('wc-hard-name');
  player.textContent = `${isGm ? '[GM]' : ''}${String(message.name || 'Tân thủ')}`;
  player.title = 'Xem hồ sơ khi nhân vật đang trực tuyến';
  player.setAttribute('aria-label', `Xem hồ sơ trực tuyến của ${String(message.name || 'Tân thủ')}`);
  player.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    openProfile(String(message.name || ''));
  });
  const faction = FAC[message.faction];
  const factionName = document.createElement('span');
  factionName.className = 'wc-faction';
  factionName.textContent = FACTION_SHORT[message.faction] || (faction ? faction.n : String(message.faction || 'Giang hồ'));
  const level = document.createElement('span');
  level.className = 'wc-level';
  level.textContent = `Lv${Number(message.level) || 1}:`;
  const body = document.createElement('span');
  body.className = 'wc-message-text';
  const messageText = String(message.message || '');
  const sharedItem = message.item && typeof message.item === 'object' ? message.item : null;
  const rawSharedName = sharedItem && String(sharedItem.name || '').trim();
  const sharedName = rawSharedName ? viMessage(rawSharedName) : '';
  const sharedLabel = sharedName
    ? `${sharedName}${Number(sharedItem.enhancement) > 0 ? ` +${Number(sharedItem.enhancement)}` : ''}${Number(sharedItem.platinum) > 0 ? ` · Bạch Kim +${Number(sharedItem.platinum)}` : ''}`
    : '';
  const bracketedLabel = sharedName ? `[${sharedName}]` : '';
  const names = [...new Set([rawSharedName, sharedName].filter(Boolean))];
  const sharedMatches = names.flatMap(name => [
    { text: `[${name}]`, label: bracketedLabel },
    { text: `${name}${sharedLabel.slice(sharedName.length)}`, label: sharedLabel },
    { text: name, label: sharedName }
  ]).map(match => ({ ...match, at: messageText.indexOf(match.text) }))
    .filter(match => match.at >= 0)
    .sort((a, b) => a.at - b.at || b.text.length - a.text.length);
  const sharedMatch = sharedMatches[0];
  if (sharedMatch && typeof window.showSharedItem === 'function') {
    body.append(document.createTextNode(messageText.slice(0, sharedMatch.at)));
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'wc-shared-item-link';
    link.textContent = sharedMatch.label;
    link.sharedItemData = sharedItem;
    link.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation(); window.showSharedItem(sharedItem, link);
    });
    body.append(link, document.createTextNode(messageText.slice(sharedMatch.at + sharedMatch.text.length)));
  } else body.textContent = messageText;
  article.append(time, timeSpace, player, document.createTextNode(' '), factionName, document.createTextNode(' '), level, document.createTextNode(' '), body);
  return article;
}

function addMessage(message, notify = false) {
  if (!message || message.id == null) return;
  const id = String(message.id);
  if (knownIds.has(id)) return;
  knownIds.add(id);
  recent.push(id);
  if (recent.length > MAX_MESSAGES * 2) knownIds.delete(recent.shift());
  list.append(renderMessage(message));
  while (list.children.length > MAX_MESSAGES) list.firstElementChild.remove();

  if (notify && (panel.hidden || activeTab !== 'world')) setUnread(unread + 1);
  else if (!panel.hidden && activeTab === 'world') list.scrollTop = list.scrollHeight;
}

function loadInitial(messages) {
  list.replaceChildren();
  knownIds.clear();
  recent.length = 0;
  for (const message of messages || []) addMessage(message, false);
  list.scrollTop = list.scrollHeight;
}

/* Dong bo Nhat ky he thong (R.logs, moi nhat dau tien -> hien cuoi cung).
   ui.ts log() goi qua window.syncWorldChatSystem. */
export function syncWorldChatSystem(logs) {
  if (!systemList) return;
  systemList.replaceChildren();
  for (const entry of (Array.isArray(logs) ? logs : []).slice(0, 40).reverse()) {
    const row = document.createElement('div');
    row.innerHTML = String(entry);
    systemList.append(row);
  }
  if (activeTab === 'system') systemList.scrollTop = systemList.scrollHeight;
}

function setTab(tab) {
  activeTab = tab === 'system' ? 'system' : 'world';
  const isWorld = activeTab === 'world';
  list.hidden = !isWorld;
  systemList.hidden = isWorld;
  form.hidden = !isWorld;
  tabButtons.forEach(button => {
    const selected = button.dataset.chatTab === activeTab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (isWorld) {
    setUnread(0);
    list.scrollTop = list.scrollHeight;
  } else {
    systemList.scrollTop = systemList.scrollHeight;
  }
}

document.addEventListener('world-chat-time-visibility-change', event => {
  showTime = !!event.detail?.visible;
  if (root) root.querySelectorAll('.wc-time, .wc-time-space').forEach(element => { element.hidden = !showTime; });
});

function updatePresence(count) {
  const online = Math.max(0, Number(count) || 0);
  onlineLabel.textContent = `Online ${online}`;
}

function scheduleReconnect(callback) {
  if (stopped) return;
  clearTimeout(reconnectTimer);
  const delay = Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempts++, 5));
  reconnectTimer = setTimeout(callback, delay * (0.75 + Math.random() * 0.5));
}

function connect() {
  if (source || stopped || !apiAvailable) return;
  clearTimeout(reconnectTimer);
  source = new EventSource(`${CHAT_API}/api/chat/stream?client_id=${encodeURIComponent(clientId())}`);
  const currentSource = source;
  source.addEventListener('open', () => {
    showStatus('', 'ok');
    startPresence();                 // (re)khởi heartbeat sau khi nối lại
  });
  source.addEventListener('ready', event => {
    try {
      const data = JSON.parse(event.data);
      reconnectAttempts = 0;
      loadInitial(data.messages);
      updatePresence(data.online);
      void sendPresence();           // đẩy profile ngay khi stream sẵn sàng
    } catch (_) { showStatus('Dữ liệu chat không hợp lệ', 'error'); }
  });
  source.addEventListener('message', event => {
    try { addMessage(JSON.parse(event.data), true); } catch (_) { /* Bỏ qua sự kiện lỗi định dạng. */ }
  });
  source.addEventListener('presence', event => {
    try { updatePresence(JSON.parse(event.data).online); } catch (_) { /* Bỏ qua sự kiện lỗi định dạng. */ }
  });
  source.addEventListener('error', () => {
    if (source !== currentSource || stopped) return;
    currentSource.close();
    source = null;
    showStatus('Đang nối lại…', 'wait');
    // Spread reconnects after an origin/tunnel restart instead of making all
    // players reconnect to PostgreSQL at the same instant.
    scheduleReconnect(connect);
  });
}

async function start() {
  if (stopped) return;
  // Kill switch: tắt nhanh kênh chat (giống bản gốc kiểm tra window.JX_CHAT_OFFLINE).
  if (typeof window !== 'undefined' && window.JX_CHAT_OFFLINE) {
    showStatus('Đã tắt chat (JX_CHAT_OFFLINE)', 'wait');
    return;
  }
  try {
    let response = await fetch(`${CHAT_API}/api/chat/status`, { cache: 'no-store' });
    // Keep chat available if the new app shell arrives before the origin
    // process has been restarted with the async backend.
    if (response.status === 404 || !response.headers.get('content-type')?.includes('application/json')) {
      response = await fetch(`${CHAT_API}/api/chat/messages?limit=1`, { cache: 'no-store' });
    }
    if (!response.headers.get('content-type')?.includes('application/json')) {
      if (response.status >= 500) scheduleReconnect(start);
      return;
    }
    apiAvailable = true;
    root.hidden = false;
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      showStatus(result.error || 'Database chat chưa sẵn sàng', 'error');
    }
    startPresence();
    connect();
  } catch (_) {
    // Retry temporary network/tunnel failures during page startup as well.
    scheduleReconnect(start);
  }
}

function setOpen(open) {
  if (!open) {
    clearTimeout(idleFrameTimer);
    idleFrameTimer = 0;
    setEmojiPicker(false, false);
    panel.classList.remove('wc-idle');
    setMaximized(false);
  }
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Đóng chat thế giới' : 'Mở chat thế giới');
  root.classList.toggle('wc-open', open);
  positionInputModeButton();
  if (open) {
    showFrameAndStartIdle();
    if (activeTab === 'world') {
      setUnread(0);
      list.scrollTop = list.scrollHeight;
    } else systemList.scrollTop = systemList.scrollHeight;
  }
}

function showFrameAndStartIdle() {
  if (panel.hidden) return;
  clearTimeout(idleFrameTimer);
  panel.classList.remove('wc-idle');
  idleFrameTimer = setTimeout(() => {
    if (!panel.hidden && !panel.classList.contains('wc-emoji-open')) panel.classList.add('wc-idle');
  }, IDLE_FRAME_MS);
}

function hideFrameForJoystick() {
  if (panel.hidden) return;
  clearTimeout(idleFrameTimer);
  idleFrameTimer = 0;
  panel.classList.add('wc-idle');
}

function setMaximized(maximized) {
  panel.classList.toggle('wc-maximized', maximized);
  root.classList.toggle('wc-maximized', maximized);
  maximizeButton.textContent = maximized ? '×' : '⛶';
  maximizeButton.setAttribute('aria-expanded', String(maximized));
  maximizeButton.setAttribute('aria-label', maximized ? 'Thu nhỏ khung chat' : 'Phóng to khung chat');
  maximizeButton.title = maximized ? 'Thu nhỏ khung chat' : 'Phóng to khung chat';
  positionInputModeButton();
  if (maximized) list.scrollTop = list.scrollHeight;
}

async function send(event, overrideText = null, itemPayload = null) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  const who = identity();
  const useComposer = overrideText == null;
  const sourceText = useComposer ? input.value : String(overrideText);
  const attachedItem = itemPayload || (useComposer ? draftItemPayload : null);
  const cleanedText = [...sourceText.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()];
  if (cleanedText.length > 240) { showStatus('Tin nhắn tối đa 240 ký tự · hãy rút gọn để giữ đủ tên trang bị', 'error'); return false; }
  const message = cleanedText.join('');
  if (!who.name || !who.faction) { showStatus('Hãy tạo nhân vật trước', 'wait'); return false; }
  if (!message) return false;
  if (sendButton.disabled) { showStatus('Đang gửi tin nhắn…', 'wait'); return false; }
  const wait = 1500 - (Date.now() - lastSentAt);
  if (wait > 0) { showStatus(`Chờ ${Math.ceil(wait / 1000)} giây rồi gửi tiếp`, 'wait'); return false; }

  itemDraftEnterArmed = false;
  if (useComposer) {
    input.value = '';
    if (attachedItem === draftItemPayload) draftItemPayload = null;
  }
  showStatus('Đang gửi…', 'wait');
  sendButton.disabled = true;
  input.disabled = true;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (gmToken()) headers['X-Chat-GM-Token'] = gmToken();
    const response = await fetch(`${CHAT_API}/api/chat/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...who, message, ...(attachedItem ? { item: attachedItem } : {}), client_id: clientId() })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Không gửi được tin nhắn.');
    lastSentAt = Date.now();
    if (attachedItem === draftItemPayload) draftItemPayload = null;
    showStatus('Đã gửi', 'ok');
    if (result.message) addMessage(result.message, false);
    return true;
  } catch (error) {
    if (useComposer) {
      input.value = message;
      if (attachedItem) draftItemPayload = attachedItem;
    }
    showStatus(error.message || 'Không kết nối được chat', 'error');
    return false;
  } finally {
    sendButton.disabled = false;
    input.disabled = false;
  }
}

function stopChat() {
  stopped = true;
  clearTimeout(reconnectTimer);
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = 0;
  if (source) source.close();
  source = null;
}

/* Khoi tao khung chat: tiêm markup (giong index.html ban nguon) vao <aside id="worldChat">
   — App.tsx de element nay trong, React khong quan ly con cua no nen an toan.
   Chi chay tren client (boot goi tu useEffect). */
export function initWorldChat() {
  if (typeof document === 'undefined') return;      // SSR luc next build — chi chay tren client
  root = document.getElementById('worldChat');
  if (!root || root.childElementCount) return;      // da khoi tao (hot reload)
  root.innerHTML = `<section class="wc-panel" aria-label="Chat thế giới" hidden>
      <header class="wc-topline">
        <nav class="wc-tabs" aria-label="Các tab chat">
          <button class="wc-tab active" type="button" data-chat-tab="world" aria-pressed="true">Thế giới</button>
          <button class="wc-tab" type="button" data-chat-tab="system" aria-pressed="false">Nhật ký</button>
        </nav>
        <div class="wc-header-right">
          <small class="wc-online">Online 0</small>
          <span class="wc-status" role="status" aria-live="polite" hidden></span>
          <button class="wc-maximize" type="button" aria-expanded="false" aria-label="Phóng to khung chat" title="Phóng to khung chat">⛶</button>
        </div>
      </header>
      <div class="wc-list" role="log" aria-label="Tin nhắn chat thế giới" aria-live="polite" aria-relevant="additions"></div>
      <div class="wc-system-list" aria-label="Nhật ký hệ thống" hidden></div>
      <form class="wc-form">
        <div class="wc-compose">
          <button class="wc-emoji-toggle" type="button" aria-label="Mở bảng biểu cảm" aria-expanded="false">☺</button>
          <input class="wc-input" type="text" maxlength="240" autocomplete="off" placeholder="Nhập tin nhắn…" aria-label="Tin nhắn">
          <button class="wc-send" type="submit">Gửi</button>
        </div>
      </form>
      <div class="wc-emoji-picker" role="dialog" aria-label="Biểu cảm" hidden>
        <div class="wc-emoji-toolbar"><span>Biểu cảm</span><button class="wc-emoji-close" type="button" aria-label="Đóng bảng biểu cảm">✕</button></div>
        <div class="wc-emoji-grid" role="grid" aria-label="Chọn biểu cảm"></div>
      </div>
    </section>
    <button class="wc-toggle" type="button" aria-expanded="false" aria-label="Mở chat thế giới" title="Chat thế giới">💬<span class="wc-unread" hidden></span></button>`;
  battle = document.getElementById('battle');
  inputModeButton = document.getElementById('inBtn');
  toggle = root.querySelector('.wc-toggle');
  panel = root.querySelector('.wc-panel');
  maximizeButton = root.querySelector('.wc-maximize');
  list = root.querySelector('.wc-list');
  systemList = root.querySelector('.wc-system-list');
  form = root.querySelector('.wc-form');
  input = root.querySelector('.wc-input');
  sendButton = root.querySelector('.wc-send');
  emojiToggle = root.querySelector('.wc-emoji-toggle');
  emojiPicker = root.querySelector('.wc-emoji-picker');
  emojiGrid = root.querySelector('.wc-emoji-grid');
  emojiClose = root.querySelector('.wc-emoji-close');
  unreadBadge = root.querySelector('.wc-unread');
  onlineLabel = root.querySelector('.wc-online');
  statusLabel = root.querySelector('.wc-status');
  tabButtons = [...root.querySelectorAll('[data-chat-tab]')];
  try { showTime = localStorage.getItem(CHAT_SHOW_TIME_KEY) !== 'false'; } catch (_) { /* Mặc định hiện giờ nếu storage bị chặn. */ }

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || input.value.trim()) return;
    const modal = document.getElementById('modal');
    if (modal && !modal.classList.contains('hidden')) return;
    event.preventDefault();
    if (panel.hidden) {
      setTab('world');
      setOpen(true);
      input.focus({ preventScroll: true });
    } else if (activeTab === 'system') {
      setTab('world');
      showFrameAndStartIdle();
      input.focus({ preventScroll: true });
    } else {
      setOpen(false);
    }
  });
  maximizeButton.addEventListener('click', () => setMaximized(!panel.classList.contains('wc-maximized')));
  emojiToggle.addEventListener('click', () => setEmojiPicker(emojiPicker.hidden));
  emojiClose.addEventListener('click', () => setEmojiPicker(false));
  emojiGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-emoji]');
    if (button) insertEmoji(button.dataset.emoji);
  });
  document.addEventListener('click', event => {
    if (emojiPicker && !emojiPicker.hidden && !emojiPicker.contains(event.target) && !emojiToggle.contains(event.target)) setEmojiPicker(false);
  });
  for (const type of ['pointerdown', 'pointermove', 'click', 'keydown', 'focusin', 'wheel']) {
    panel.addEventListener(type, showFrameAndStartIdle, { passive: type === 'pointermove' || type === 'wheel' });
  }
  tabButtons.forEach(button => button.addEventListener('click', () => setTab(button.dataset.chatTab)));
  form.addEventListener('submit', send);
  window.prepareWorldChatItem = item => {
    if (!item || typeof item.name !== 'string') return false;
    setTab('world');
    setOpen(true);
    draftItemPayload = item;
    const draft = input.value;
    const separator = draft && !/\s$/.test(draft) ? ' ' : '';
    const marker = `[${viMessage(item.name)}]`;
    input.value = `${draft}${separator}${marker} `;
    itemDraftEnterArmed = true;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    showStatus('Thêm nội dung rồi nhấn Enter để đăng', 'wait');
    return true;
  };
  window.isWorldChatPanelOpen = () => !root.hidden && !panel.hidden;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && emojiPicker && !emojiPicker.hidden) {
      event.preventDefault();
      event.stopPropagation();
      setEmojiPicker(false);
      return;
    }
    const plainEnter = event.key === 'Enter' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey;
    const isTextEntry = /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable;
    const onChatTab = !!event.target.closest('.wc-tabs [data-chat-tab]');
    if (plainEnter && itemDraftEnterArmed && !isTextEntry && !root.hidden && !panel.hidden) {
      const modal = document.getElementById('modal');
      if (!modal || modal.classList.contains('hidden')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        itemDraftEnterArmed = false;
        input.focus({ preventScroll: true });
        form.requestSubmit();
      }
      return;
    }
    if (plainEnter && !root.hidden && !panel.hidden && activeTab === 'system' && !isTextEntry
      && (!event.target.closest('button,a,[role="button"]') || onChatTab)) {
      const modal = document.getElementById('modal');
      if (!modal || modal.classList.contains('hidden')) {
        event.preventDefault();
        event.stopPropagation();
        setTab('world');
        showFrameAndStartIdle();
        input.focus({ preventScroll: true });
      }
      return;
    }
    if (plainEnter && !root.hidden && !isTextEntry
      && !event.target.closest('button,a,[role="button"]')) {
      const modal = document.getElementById('modal');
      if (!modal || modal.classList.contains('hidden')) {
        event.preventDefault();
        if (panel.hidden) {
          setTab('world');
          setOpen(true);
          input.focus({ preventScroll: true });
        } else if (activeTab === 'system') {
          setTab('world');
          showFrameAndStartIdle();
          input.focus({ preventScroll: true });
        } else {
          setOpen(false);
        }
      }
      return;
    }
    if (event.key !== 'Escape' || panel.hidden) return;
    if (panel.classList.contains('wc-maximized')) {
      event.preventDefault();
      event.stopPropagation();
      setMaximized(false);
      showFrameAndStartIdle();
    } else {
      setOpen(false);
    }
  });
  window.addEventListener('game-update-pause', () => {
    updatePaused = true;
    stopChat();
  });
  window.addEventListener('game-update-resume', () => {
    if (!updatePaused) return;
    updatePaused = false; stopped = false;
    scheduleReconnect(apiAvailable ? connect : start);
  });
  window.addEventListener('pagehide', stopChat);
  window.addEventListener('pageshow', event => {
    if (event.persisted && !updatePaused) { stopped = false; if (apiAvailable) connect(); else start(); }
  });
  window.syncWorldChatSystem = syncWorldChatSystem;
  window.hideWorldChatFrameForJoystick = hideFrameForJoystick;
  window.positionWorldChatModeButton = positionInputModeButton;
  setUnread(0);
  syncWorldChatSystem(R.logs);
  setTab('world');                                   // mac dinh: tab The gioi (giong ban goc)
  showStatus('Đang kết nối…', 'wait');
  window.addEventListener('resize', positionInputModeButton);
  start();
}

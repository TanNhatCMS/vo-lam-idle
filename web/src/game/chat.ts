// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
import { R } from './combat';

/* Chat the gioi ban OFFLINE: kenh chat da TAT (ban vinarpg noi server qua
   EventSource/POST — ban ngoai tuyen khong co server nen bo), khung chat
   chi dung de xem Nhat ky he thong (R.logs — cung nhat ky voi the Giang ho).
   Port tu js/chat.js ban vinarpg, giu lai: nut toggle, tab Thế giới / Nhật ký,
   phóng to ⛶, khung mờ khi không chạm 5s, Enter mở Nhật ký, Esc đóng. */
const IDLE_FRAME_MS = 5000;
let root = null, panel, toggle, maximizeButton, list, systemList;
let idleFrameTimer = 0, activeTab = 'system';

/* Dong bo nhat ky he thong (R.logs, moi nhat dau tien → hien cuoi cung). */
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
  activeTab = tab === 'world' ? 'world' : 'system';
  const isWorld = activeTab === 'world';
  list.hidden = !isWorld;
  systemList.hidden = isWorld;
  root.querySelectorAll('[data-chat-tab]').forEach(b => {
    const on = b.dataset.chatTab === activeTab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (isWorld) list.scrollTop = list.scrollHeight; else systemList.scrollTop = systemList.scrollHeight;
}

function showFrameAndStartIdle() {
  if (panel.hidden) return;
  clearTimeout(idleFrameTimer);
  panel.classList.remove('wc-idle');
  idleFrameTimer = setTimeout(() => { if (!panel.hidden) panel.classList.add('wc-idle'); }, IDLE_FRAME_MS);
}

function setOpen(open) {
  if (!open) { clearTimeout(idleFrameTimer); idleFrameTimer = 0; panel.classList.remove('wc-idle'); }
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Đóng chat thế giới' : 'Mở chat thế giới');
  root.classList.toggle('wc-open', open);
  if (open) showFrameAndStartIdle();
}

function setMaximized(maximized) {
  panel.classList.toggle('wc-maximized', maximized);
  root.classList.toggle('wc-maximized', maximized);
  maximizeButton.textContent = maximized ? '×' : '⛶';
  maximizeButton.setAttribute('aria-expanded', String(maximized));
  maximizeButton.setAttribute('aria-label', maximized ? 'Thu nhỏ khung chat' : 'Phóng to khung chat');
  maximizeButton.title = maximized ? 'Thu nhỏ khung chat' : 'Phóng to khung chat';
  if (maximized && !panel.hidden) { if (activeTab === 'world') list.scrollTop = list.scrollHeight; else systemList.scrollTop = systemList.scrollHeight; }
}

export function initWorldChat() {
  root = document.getElementById('worldChat');
  if (!root || root.childElementCount) return;      // da khoi tao (hot reload)
  root.innerHTML = `<section class="wc-panel" aria-label="Chat thế giới" hidden>
      <header class="wc-topline">
        <nav class="wc-tabs" aria-label="Các tab chat">
          <button class="wc-tab" type="button" data-chat-tab="world" aria-pressed="false">Thế giới</button>
          <button class="wc-tab active" type="button" data-chat-tab="system" aria-pressed="true">Nhật ký</button>
        </nav>
        <div class="wc-header-right">
          <small class="wc-online">Offline</small>
          <span class="wc-status" role="status" aria-live="polite" hidden></span>
          <button class="wc-maximize" type="button" aria-expanded="false" aria-label="Phóng to khung chat" title="Phóng to khung chat">⛶</button>
        </div>
      </header>
      <div class="wc-list" role="log" aria-label="Chat thế giới" aria-live="polite" aria-relevant="additions"><div class="wc-offline">Bản offline: kênh chat thế giới đã tắt.<br>Xem <b>Nhật ký</b> hệ thống ở tab bên cạnh.</div></div>
      <div class="wc-system-list" aria-label="Nhật ký hệ thống" hidden></div>
    </section>
    <button class="wc-toggle" type="button" aria-expanded="false" aria-label="Mở chat thế giới" title="Chat thế giới">💬<span class="wc-unread" hidden></span></button>`;
  panel = root.querySelector('.wc-panel');
  toggle = root.querySelector('.wc-toggle');
  maximizeButton = root.querySelector('.wc-maximize');
  list = root.querySelector('.wc-list');
  systemList = root.querySelector('.wc-system-list');
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  maximizeButton.addEventListener('click', () => setMaximized(!panel.classList.contains('wc-maximized')));
  root.querySelectorAll('[data-chat-tab]').forEach(b => b.addEventListener('click', () => { setTab(b.dataset.chatTab); showFrameAndStartIdle(); }));
  for (const type of ['pointerdown', 'pointermove', 'click', 'keydown', 'focusin', 'wheel'])
    panel.addEventListener(type, showFrameAndStartIdle, { passive: type === 'pointermove' || type === 'wheel' });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden) {
      e.preventDefault(); e.stopPropagation();
      if (panel.classList.contains('wc-maximized')) { setMaximized(false); showFrameAndStartIdle(); } else setOpen(false);
      return;
    }
    const plainEnter = e.key === 'Enter' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!plainEnter || root.hidden || !panel.hidden) return;
    const t = e.target;
    if (!t || !t.tagName || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
    if (t.closest && t.closest('button,a,[role="button"]')) return;
    const modal = document.getElementById('modal');
    if (modal && !modal.classList.contains('hidden')) return;
    e.preventDefault(); e.stopPropagation();
    setTab('system'); setOpen(true);                  // offline: Enter mở thẳng Nhật ký
  });
  syncWorldChatSystem(R.logs);
  setTab('system');                                   // mặc định: Nhật ký — mục đích chính của khung
  /* Hợp đồng với bản gốc: module khác gọi qua window (ui.js log(), control.js kéo joystick). */
  window.syncWorldChatSystem = syncWorldChatSystem;
  window.hideWorldChatFrameForJoystick = () => { if (!panel.hidden) { clearTimeout(idleFrameTimer); idleFrameTimer = 0; panel.classList.add('wc-idle'); } };
}

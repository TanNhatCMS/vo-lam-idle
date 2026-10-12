/* Test E2E chat the gioi (chat.ts) — MOCK toan bo cac URL /api/chat/*
   qua page.route, KHONG gui tin nhan that den server chat nguồn (volam.vinarpg.com).
   Stream SSE mock: lan 1 = ready(2 tin) + message(tin 3, chua panel dong -> unread)
   + presence; cac lan sau (reconnect) = ready(idempotent, co ca tin da gui).
   POST /api/chat/messages: bat body, tra JSON success + message echo. */
import { test, expect, Page } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
});

const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

/* Tạo nhân vật mới (context test = localStorage trống → luôn màn chọn phái). */
async function createCharacter(page: Page, name = 'ChatHiệp') {
  await page.goto('/');
  await expect(page.locator('#pfName')).toBeVisible();
  await page.fill('#pfName', name);
  await page.locator('.facpick button').first().click();
  await expect(page.locator('#bNotice')).toBeVisible();
  await page.locator('#bNotice').click();
  const skip = page.locator('#tSkip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  await expect(page.locator('#qBar .qb')).toHaveCount(14);
}

/* Dung luong chat chung cho cac test: tin goc + tin da gui (server "luu"
   -> ready ke tiep co them, giong server that -> reconnect idempotent). */
interface ChatMock {
  posts: any[];        // body cac POST /api/chat/messages
  presences: any[];    // body cac POST /api/chat/presence
  sent: any[];         // tin nguoi choi gui thanh cong (server luu)
  streamCalls: number; // so lan EventSource mo /api/chat/stream
}

const BASE_MESSAGES = [
  { id: 1, created_at: '2026-10-09T10:00:00.000Z', name: 'CaoThu', faction: 'shaolin', level: 42, message: 'Hello thế giới' },
  { id: 2, created_at: '2026-10-09T10:01:00.000Z', name: 'LãoGM', faction: 'gaibang', level: 99, message: 'Chào mừng đến Võ Lâm', is_gm: true },
  { id: 3, created_at: '2026-10-09T10:02:00.000Z', name: 'TânThủ', faction: 'emei', level: 5, message: 'Mới vào game' },
];

const sse = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;

/* Mock cac URL /api/chat/* — chi intercept tuyet doi, khong cho request nao ra ngoai.
   holdStream: stream SSE "treo" (khong bao gio tra response) de EventSource
   dung o trang thai CONNECTING — khong fire error/reconnect, tranh status
   "Đang nối lại…" ghi de cac trang thai đang test (gui tin/cooldown). */
function mockChatApi(page: Page, opts: { holdStream?: boolean } = {}): ChatMock {
  const mock: ChatMock = { posts: [], presences: [], sent: [], streamCalls: 0 };
  page.route('**/api/chat/status', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 1 }) }));
  page.route('**/api/chat/stream*', route => {
    if (opts.holdStream) return;   // treo: EventSource cho CONNECTING, khong reconnect
    mock.streamCalls++;
    const body = mock.streamCalls === 1
      ? sse('ready', { messages: BASE_MESSAGES.slice(0, 2), online: 7 })
        + sse('message', BASE_MESSAGES[2])
        + sse('presence', { online: 9 })
      : sse('ready', { messages: [...BASE_MESSAGES, ...mock.sent], online: 9 });
    route.fulfill({ contentType: 'text/event-stream', headers: { 'Cache-Control': 'no-store' }, body });
  });
  page.route('**/api/chat/presence*', route => {
    if (route.request().method() === 'POST') {
      mock.presences.push(JSON.parse(route.request().postData() || '{}'));
    }
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  page.route('**/api/chat/messages*', route => {
    if (route.request().method() === 'POST') {
      const sent = JSON.parse(route.request().postData() || '{}');
      mock.posts.push(sent);
      const message = {
        id: 100 + mock.sent.length, created_at: new Date().toISOString(),
        name: sent.name, faction: sent.faction, level: sent.level,
        message: sent.message, ...(sent.item ? { item: sent.item } : {}),
      };
      mock.sent.push(message);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, message }) });
    }
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) });
  });
  return mock;
}

test('chat: widget an/hien, tin nhan render (ten/mon phai/cap), badge unread, tab, phóng to', async ({ page }) => {
  mockChatApi(page);
  await createCharacter(page);

  // toggle hien, panel mac dinh an
  const toggle = page.locator('#worldChat .wc-toggle');
  await expect(toggle).toBeVisible();
  const panel = page.locator('#worldChat .wc-panel');
  await expect(panel).toBeHidden();

  // tin "Mới vào game" den khi panel dong -> badge unread
  await expect(page.locator('#worldChat .wc-unread')).toBeVisible();
  await expect(page.locator('#worldChat .wc-unread')).toHaveText('1');

  // mo panel -> badge dat lai, 3 tin render
  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(page.locator('#worldChat .wc-unread')).toBeHidden();
  await expect(page.locator('#worldChat .wc-line')).toHaveCount(3);

  // noi dung tin: ten / viet tat mon phai / cap / noi dung
  const first = page.locator('#worldChat .wc-line').nth(0);
  await expect(first.locator('.wc-name')).toHaveText('CaoThu');
  await expect(first.locator('.wc-faction')).toHaveText('TL');
  await expect(first.locator('.wc-level')).toHaveText('Lv42:');
  await expect(first.locator('.wc-message-text')).toHaveText('Hello thế giới');
  // tin GM
  await expect(page.locator('#worldChat .wc-line').nth(1).locator('.wc-name')).toHaveText('[GM]LãoGM');
  // online tu presence
  await expect(page.locator('#worldChat .wc-online')).toHaveText('Online 9');

  // tab Nhat ky: danh sach he thong hien, list the gioi + form an
  await page.locator('#worldChat [data-chat-tab="system"]').click();
  await expect(page.locator('#worldChat .wc-system-list')).toBeVisible();
  await expect(page.locator('#worldChat .wc-list')).toBeHidden();
  await expect(page.locator('#worldChat .wc-form')).toBeHidden();
  // tab The gioi
  await page.locator('#worldChat [data-chat-tab="world"]').click();
  await expect(page.locator('#worldChat .wc-list')).toBeVisible();
  await expect(page.locator('#worldChat .wc-form')).toBeVisible();

  // phóng to / thu nho
  await page.locator('#worldChat .wc-maximize').click();
  await expect(panel).toHaveClass(/wc-maximized/);
  await page.locator('#worldChat .wc-maximize').click();
  await expect(panel).not.toHaveClass(/wc-maximized/);

  assertNoErrors();
});

test('chat: gui tin (intercept POST), identity tu nhan vat, cooldown 1500ms', async ({ page }) => {
  const mock = mockChatApi(page, { holdStream: true });
  await createCharacter(page);
  await page.locator('#worldChat .wc-toggle').click();
  await expect(page.locator('#worldChat .wc-panel')).toBeVisible();

  const S = await page.evaluate(() => (window as any).__G.S);
  const input = page.locator('#worldChat .wc-input');
  await input.fill('Chào các hiệp sĩ');
  await page.locator('#worldChat .wc-send').click();

  // POST /api/chat/messages: body co identity lay tu state S (name/fac/lvl)
  await expect.poll(() => mock.posts.length).toBe(1);
  expect(mock.posts[0].message).toBe('Chào các hiệp sĩ');
  expect(mock.posts[0].name).toBe(S.name);
  expect(mock.posts[0].faction).toBe(S.fac);
  expect(mock.posts[0].level).toBe(S.lvl);
  expect(mock.posts[0]).toHaveProperty('challenge_mode', '');
  const clientId = await page.evaluate(() => localStorage.getItem('jxidle_chat_client_id'));
  expect(clientId).toMatch(/^[0-9a-f-]{16,64}$/i);
  expect(mock.posts[0].client_id).toBe(clientId);

  // server tra message -> render them tin (stream treo -> chi co tin gui), status "Đã gửi"
  await expect(page.locator('#worldChat .wc-line')).toHaveCount(1);
  const last = page.locator('#worldChat .wc-line').nth(0);
  await expect(last.locator('.wc-name')).toHaveText(S.name);
  await expect(last.locator('.wc-message-text')).toHaveText('Chào các hiệp sĩ');
  await expect(page.locator('#worldChat .wc-status')).toHaveText('Đã gửi');

  // cooldown: gui ngay sau khi gui xong -> bi cho, khong tang POST
  await input.fill('Tin thu hai');
  await page.locator('#worldChat .wc-send').click();
  await expect(page.locator('#worldChat .wc-status')).toHaveText(/Chờ \d+ giây rồi gửi tiếp/);
  await expect.poll(() => mock.posts.length).toBe(1);
  assertNoErrors();
});

test('chat: reconnect khi SSE loi (stream ket thuc -> "Đang nối lại…" -> ket noi lai)', async ({ page }) => {
  const mock = mockChatApi(page);
  await createCharacter(page);
  await page.locator('#worldChat .wc-toggle').click();
  await expect(page.locator('#worldChat .wc-panel')).toBeVisible();

  // response stream mock ket thuc ngay -> EventSource error -> trang thai "Đang nối lại…"
  await expect(page.locator('#worldChat .wc-status')).toHaveText('Đang nối lại…');
  // backoff ~1s (min(30000, 1000*2^0) x jitter) -> EventSource mo lai -> streamCalls tang
  await expect.poll(() => mock.streamCalls, { timeout: 15000 }).toBeGreaterThan(1);
  // ready idempotent: tin nhan van du, khong bi trung
  await expect(page.locator('#worldChat .wc-line')).toHaveCount(3);
  assertNoErrors();
});

test('chat: chia se trang bi (prepareWorldChatItem -> POST co item, tao lien ket xem do)', async ({ page }) => {
  const mock = mockChatApi(page);
  await createCharacter(page);

  // mo chat + gan draft trang bi (giong nut "Đăng thế giới" trong itemModal ui.ts)
  const ok = await page.evaluate(() => (window as any).prepareWorldChatItem({
    name: 'Thanh Kiếm Cổ', enhancement: 5, platinum: 2,
    detail: 0, particular: 0, icon: '', tier: 1, series: 0, rarity: 3,
    base: [], requirements: [], magic: [], set_lines: [],
  }));
  expect(ok).toBe(true);
  await expect(page.locator('#worldChat .wc-panel')).toBeVisible();
  const input = page.locator('#worldChat .wc-input');
  await expect(input).toHaveValue(/\[Thanh Kiếm Cổ\]/);

  // them noi dung roi gui (Enter tren form)
  await input.pressSequentially('Xem thử');
  await page.locator('#worldChat .wc-send').click();

  // POST body co item {name, enhancement, platinum}
  await expect.poll(() => mock.posts.length).toBe(1);
  expect(mock.posts[0].message).toContain('Thanh Kiếm Cổ');
  expect(mock.posts[0].item).toMatchObject({ name: 'Thanh Kiếm Cổ', enhancement: 5, platinum: 2 });

  // tin render co lien ket trang bi (ten + +5 · Bạch Kim +2 trong label)
  const link = page.locator('#worldChat .wc-shared-item-link');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('[Thanh Kiếm Cổ]');
  // bam lien ket -> xem do (window.showSharedItem -> itemModal)
  await link.click();
  await expect(page.locator('#modal:not(.hidden)')).toBeVisible();
  assertNoErrors();
});

test('chat: kill switch JX_CHAT_OFFLINE -> khong ket noi, chi con Nhat ky', async ({ page }) => {
  const hits = { status: 0, stream: 0 };
  await page.addInitScript(() => { (window as any).JX_CHAT_OFFLINE = true; });
  page.route('**/api/chat/status', route => { hits.status++; route.fulfill({ contentType: 'application/json', body: '{}' }); });
  page.route('**/api/chat/stream*', route => { hits.stream++; route.fulfill({ contentType: 'text/event-stream', body: '' }); });
  await createCharacter(page);

  await page.locator('#worldChat .wc-toggle').click();
  await expect(page.locator('#worldChat .wc-panel')).toBeVisible();
  await expect(page.locator('#worldChat .wc-status')).toHaveText('Đã tắt chat (JX_CHAT_OFFLINE)');
  expect(hits.status).toBe(0);
  expect(hits.stream).toBe(0);
  // tab Nhat ky (R.logs) van hoat dong binh thuong
  await page.locator('#worldChat [data-chat-tab="system"]').click();
  await expect(page.locator('#worldChat .wc-system-list')).toBeVisible();
  assertNoErrors();
});

test('chat: chua co nhan vat -> "Hãy tạo nhân vật trước", khong gui POST', async ({ page }) => {
  const mock = mockChatApi(page);
  await page.goto('/');
  // cho boot nap xong (initWorldChat chay trong boot, async sau goto)
  await expect(page.locator('#worldChat .wc-toggle')).toBeVisible();
  // dang o man hinh chon phai (modal che) -> mo chat qua DOM truc tiep
  const opened = await page.evaluate(() => {
    const t = document.querySelector('#worldChat .wc-toggle');
    if (t) (t as HTMLElement).click();
    const p = document.querySelector('#worldChat .wc-panel') as HTMLElement | null;
    return !!p && !p.hidden;
  });
  expect(opened).toBe(true);
  // nhap tin + submit form qua DOM
  await page.evaluate(() => {
    const input = document.querySelector('#worldChat .wc-input') as HTMLInputElement;
    const form = document.querySelector('#worldChat .wc-form') as HTMLFormElement;
    input.value = 'test chưa có nhân vật';
    form.requestSubmit();
  });
  await expect(page.locator('#worldChat .wc-status')).toHaveText('Hãy tạo nhân vật trước');
  expect(mock.posts.length).toBe(0);
  assertNoErrors();
});

test('chat: presence heartbeat — day profile len server (profile chinh minh xem duoc)', async ({ page }) => {
  const mock = mockChatApi(page, { holdStream: true });
  await createCharacter(page);

  // Presence luc boot dau (chua co nhan vat) = {client_id, profile: null} — giong
  // upstream (Ce() tra null ki chua login). Reload: save da co -> boot nap save
  // -> initWorldChat (sau nap save) -> presence thu 2 co profile day du.
  await page.reload();
  await expect(page.locator('#qBar .qb')).toHaveCount(14);
  await expect.poll(() => mock.presences.length).toBe(2);
  const first = mock.presences.find(p => p.profile);
  expect(first).toBeTruthy();
  const S = await page.evaluate(() => (window as any).__G.S);
  const clientId = await page.evaluate(() => localStorage.getItem('jxidle_chat_client_id'));
  expect(first.client_id).toBe(clientId);
  expect(first.profile).toMatchObject({
    name: S.name,
    faction: S.fac,
    level: S.lvl,
    challenge_mode: '',
    rank_id: null,
    tower_best: 0,
    bosses: 0,
    reborn: 0,
  });
  // attributes: 4 chi so so >= 0
  for (const key of ['str', 'dex', 'vit', 'eng']) {
    expect(Number(first.profile.attributes[key])).toBeGreaterThanOrEqual(0);
  }
  expect(Number(first.profile.combat_power)).toBeGreaterThanOrEqual(0);
  // equipment: đủ 11 ô — nhân vật mới có vũ khí khởi tạo (đối tượng
  // snapshot), các ô còn lại null hoặc đồ.
  for (const slot of ['weapon', 'armor', 'helm', 'belt', 'boot', 'cuff', 'amulet', 'ring1', 'ring2', 'pendant', 'horse']) {
    expect(first.profile.equipment).toHaveProperty(slot);
  }
  expect(first.profile.equipment.weapon).toMatchObject({ snapshot_version: 2, name: expect.any(String) });
  // stream treo (holdStream) -> 'ready' khong fire, interval 45s chua kip
  // -> dung o 2 presence (boot chua NV + boot sau reload)
  await expect.poll(() => mock.presences.length, { timeout: 3000 }).toBe(2);
  assertNoErrors();
});

/* Server chat tu choi profile co item nao > 16 dong ma thuật
   (400 "Danh sách dòng ma thuật trang bị chia sẻ không hợp lệ")
   — kiểm tra itemSharePayload cat dung 16. */
test('chat: presence cat 16 dong magic tren moi item', async ({ page }) => {
  const mock = mockChatApi(page, { holdStream: true });
  await createCharacter(page);

  // Weapon với 20 dòng magic — chen vao save, ky lai, chen bang
  // addInitScript (chay truoc boot luc reload) vi pagehide se
  // autosave ghi de state cu len localStorage.
  const packed = await page.evaluate(() => localStorage.getItem('jxidle'));
  const state = JSON.parse(JSON.parse(packed).d);
  state.eq.weapon.mag = Array.from({ length: 20 }, (_, i) => ({ a: 240 + (i % 6), p: [i, -1, 0] }));
  const d2 = JSON.stringify(state);
  const signed = await page.evaluate(({ d2 }) => {
    function sigOf(str) {
      let h1 = 0xdeadbeef, h2 = 0x41c6ce57; const s = 'jx-idle-v1:' + str;
      for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
    }
    return JSON.stringify({ d: d2, h: sigOf(d2) });
  }, { d2 });
  await page.addInitScript(p => localStorage.setItem('jxidle', p), signed);

  await page.reload();
  await expect(page.locator('#qBar .qb')).toHaveCount(14);
  await expect.poll(() => mock.presences.some(x => x.profile && x.profile.equipment && x.profile.equipment.weapon)).toBe(true);
  const wp = mock.presences.find(x => x.profile && x.profile.equipment && x.profile.equipment.weapon);
  expect(wp.profile.equipment.weapon.magic).toHaveLength(16);
  for (const slot of ['weapon', 'armor', 'helm', 'belt', 'boot', 'cuff', 'amulet', 'ring1', 'ring2', 'pendant', 'horse']) {
    const item = wp.profile.equipment[slot];
    if (item) expect(item.magic.length).toBeLessThanOrEqual(16);
  }
  assertNoErrors();
});

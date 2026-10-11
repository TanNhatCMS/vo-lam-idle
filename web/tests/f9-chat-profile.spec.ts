/* Test E2E ho so nhan vat tren chat the gioi (port 2026-10-11):
   bam ten trong tin nhan -> GET /api/chat/profile?name= -> modal ho so
   (phai/cap/chuyen sinh/luc chien/Thap/trum + luoi trang bi) -> bấm ô
   trang bi mo itemModal. MOCK toan bo /api/chat/* qua page.route. */
import { test, expect, Page } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // 404 cua profile nguoi offline la du kien (browser log thanh console error)
    if (/Failed to load resource.*404/.test(m.text())) return;
    errors.push('console: ' + m.text());
  });
});

const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

async function createCharacter(page: Page, name = 'ProfileHiệp') {
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

const sse = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;

const MESSAGES = [
  { id: 1, created_at: '2026-10-09T10:00:00.000Z', name: 'CaoThu', faction: 'shaolin', level: 1000, message: 'Ai xem profile tôi không' },
  { id: 2, created_at: '2026-10-09T10:01:00.000Z', name: 'OfflineMá', faction: 'emei', level: 30, message: 'Tôi đang offline' },
];

/* Trang bi dang snapshot (dinh dang chia se — showSharedItem hieu duoc). */
const WEAPON = {
  name: 'Đao Giả', detail: 0, particular: 1, icon: 'img/i/g0001.png',
  tier: 3, series: 1, rarity: 2, enhancement: 4, platinum: 0,
  base: [[28, 50, 50]], requirements: [[36, 40]],
  magic: [{ a: 239, p: [245, -1, 0] }], set_lines: [{ a: 190, p: [9, -1, 0] }],
};
const ARMOR = {
  name: 'Giáp Cỏ', detail: 2, particular: 0, icon: '', tier: 2, series: 0, rarity: 1,
  enhancement: 0, platinum: 2, base: [[30, 90, 90]], requirements: [[36, 20]],
  magic: [], set_lines: [],
};

const PROFILE = {
  name: 'CaoThu', faction: 'shaolin', level: 1000, reborn: 10,
  challenge_mode: 'white', tower_best: 889, bosses: 500, combat_power: 2000000000,
  updated_at: 1760000000,
  equipment: { weapon: WEAPON, armor: ARMOR },
};

function mockChatApi(page: Page, profileStatus = 200) {
  const profileReqs: string[] = [];
  let streamCalls = 0;
  page.route('**/api/chat/status', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 1 }) }));
  page.route('**/api/chat/stream*', route => {
    streamCalls++;
    if (streamCalls > 1) return;   // treo: EventSource dung CONNECTING, khong reconnect tiep
    return route.fulfill({
      contentType: 'text/event-stream', headers: { 'Cache-Control': 'no-store' },
      body: sse('ready', { messages: MESSAGES, online: 7 }),
    });
  });
  page.route('**/api/chat/messages*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) }));
  page.route('**/api/chat/profile*', route => {
    profileReqs.push(new URL(route.request().url()).searchParams.get('name') || '');
    const fulfill = () => {
      if (profileStatus === 404) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Người chơi đang offline hoặc chưa gửi hồ sơ trực tuyến.' }) });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ profile: PROFILE }) });
    };
    setTimeout(fulfill, 300);   // tre 300ms de test quan sat status "Dang tai..."
  });
  return profileReqs;
}

test('chat profile: bam ten -> modal ho so, bam trang bi -> itemModal, offline -> 404', async ({ page }) => {
  const profileReqs = mockChatApi(page);
  await createCharacter(page);

  // mo panel chat (mac dinh an)
  await page.locator('#worldChat .wc-toggle').click();
  await expect(page.locator('#worldChat .wc-line')).toHaveCount(2);
  // stream SSE da dong -> EventSource dang noi lai (treo) -> status on dinh
  await expect(page.locator('#worldChat .wc-status')).toHaveText('Đang nối lại…');

  // ten la nut bấm co wc-profile-link
  const nameBtn = page.locator('#worldChat .wc-line').nth(0).locator('.wc-name');
  await expect(nameBtn).toHaveClass(/wc-profile-link/);
  await expect(nameBtn).toHaveText('CaoThu');

  // bam ten -> dang tai -> modal ho so
  await nameBtn.click();
  await expect(page.locator('#worldChat .wc-status')).toHaveText('Đang tải hồ sơ trực tuyến…');
  await expect(page.locator('#modal')).not.toHaveClass(/hidden/);
  await expect(page.locator('#modal')).toHaveClass(/world-player-profile/);
  await expect(page.locator('#mBody .world-profile-heading h3')).toHaveText('CaoThu');
  await expect(page.locator('#mBody .world-profile-meta')).toContainText('Thiếu Lâm');
  await expect(page.locator('#mBody .world-profile-meta')).toContainText('cấp 1000');
  await expect(page.locator('#mBody .world-profile-meta')).toContainText('chuyển sinh 10');
  await expect(page.locator('#mBody .world-profile-challenge')).toHaveText('Bố Y');
  await expect(page.locator('#mBody .world-profile-stats')).toContainText('Lực chiến 2.000.000.000');
  await expect(page.locator('#mBody .world-profile-stats')).toContainText('Tháp tầng 889');
  await expect(page.locator('#mBody .world-profile-stats')).toContainText('Trùm đã hạ 500');

  // 11 ô trang bị: 2 có đồ + 9 trống
  await expect(page.locator('#mBody .world-profile-slot')).toHaveCount(11);
  await expect(page.locator('#mBody [data-profile-item]')).toHaveCount(2);
  await expect(page.locator('#mBody .world-profile-empty')).toHaveCount(9);
  // tooltip yêu cầu cấp trên ô vũ khí
  const weaponSlot = page.locator('#mBody [data-profile-item="weapon"]');
  await expect(weaponSlot).toHaveAttribute('title', /yêu cầu cấp 40/);

  // bấm ô vũ khí -> itemModal (showSharedItem)
  await weaponSlot.click();
  await expect(page.locator('#mBody')).toContainText('Đao Giả');

  // dong modal -> bam ten nguoi offline (404) -> khong modal, khong crash
  await page.evaluate(() => { document.getElementById('modal')?.classList.add('hidden'); });
  await expect(page.locator('#modal')).toHaveClass(/hidden/);
  await page.locator('#worldChat .wc-line').nth(1).locator('.wc-name').click();
  await expect.poll(() => profileReqs).toContain('OfflineMá');
  await expect(page.locator('#modal')).toHaveClass(/hidden/);

  assertNoErrors();
});

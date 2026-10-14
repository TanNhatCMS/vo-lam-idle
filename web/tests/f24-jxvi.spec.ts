/* Test JX_VI (jxvi.json): dich ten Han -> Viet qua window.JX_VI.
   Chat mock: tin chua do chia se ten Han "伏魔之大慈佛戒" -> render "Phục Ma Đại Từ Phật Giới".
   (jdata.ts gan window.JX_VI sau khi load jxvi.json; chat.ts viMessage dich ten do.) */
import { test, expect, Page } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
});

const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

async function createCharacter(page: Page) {
  await page.goto('/');
  await expect(page.locator('#pfName')).toBeVisible();
  await page.fill('#pfName', 'DichTen');
  await page.locator('.facpick button').first().click();
  await expect(page.locator('#bNotice')).toBeVisible();
  await page.locator('#bNotice').click();
  const skip = page.locator('#tSkip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  await expect(page.locator('#qBar .qb')).toHaveCount(19);
}

const sse = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;

test('JX_VI: jxvi.json nap window.JX_VI + tin chat do ten Han hien tieng Viet', async ({ page }) => {
  const hanName = '伏魔之大慈佛戒';
  const vietName = 'Phục Ma Đại Từ Phật Giới';
  await page.route('**/api/chat/status', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 1 }) }));
  await page.route('**/api/chat/stream*', route => {
    route.fulfill({
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-store' },
      body: sse('ready', {
        online: 3,
        messages: [{
          id: 9001, created_at: '2026-10-14T12:00:00.000Z',
          name: 'NguonChoi', faction: 'wudang', level: 300,
          message: `[${hanName}] chia sẻ đồ`,
          item: { name: hanName, tier: 10, rarity: 3, enhancement: 2 },
        }],
      }),
    });
  });
  await page.route('**/api/chat/presence*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
  await page.route('**/api/chat/messages*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) }));

  await createCharacter(page);

  // window.JX_VI da gan (jxvi.json thuoc assets) + co du 744 ten
  const vi = await page.evaluate(() => {
    const v = (window as any).JX_VI;
    return v ? { names: Object.keys(v.names || {}).length, sample: v.names['伏魔之大慈佛戒'] || '' } : null;
  });
  expect(vi).not.toBeNull();
  expect(vi!.names).toBeGreaterThanOrEqual(700);
  expect(vi!.sample).toBe(vietName);

  // mo panel chat -> tin do chia se hien ten DICH
  const toggle = page.locator('#worldChat .wc-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  const link = page.locator('#worldChat .wc-shared-item-link').first();
  await expect(link).toBeVisible();
  await expect(link).toContainText(vietName);
  await assertNoErrors();
});

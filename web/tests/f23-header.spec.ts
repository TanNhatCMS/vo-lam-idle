/* Test F23 — thanh header giống nguồn v107 (2.6.14):
 - .gold.gold-stack: 2 money-line (Ngân lượng + KNB luôn hiển thị) như index.html nguồn
 - #heroName chỉ tên nhân vật (không chèn <small> tên phái)
 - .lvbox có canvas #heroAvatar (vẽ sprite nhân vật, giống Xp nguồn) + class avatar-live khi vẽ được
 - thứ tự nút phải: giftBtn 🎁 + compactBtn ⛶ */
import { test, expect, Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.route('**/api/chat/status', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 0 }) }));
  page.route('**/api/chat/stream*', () => {});
  page.route('**/api/chat/messages*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) }));
  page.route('**/api/chat/presence*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
});

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
});
const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

async function createCharacter(page: Page, name = 'TestHeader') {
  await page.goto('/');
  await expect(page.locator('#pfName')).toBeVisible();
  await page.fill('#pfName', name);
  await page.locator('.facpick button').first().click();
  await expect(page.locator('#bNotice')).toBeVisible();
  await page.locator('#bNotice').click();
  const skip = page.locator('#tSkip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  await expect(page.locator('#qBar .qb')).toHaveCount(19);
}

test('header giống nguồn: gold-stack 2 money-line, heroName chỉ tên, canvas avatar', async ({ page }) => {
  await createCharacter(page);
  // gold-stack: 2 money-line — Ngân lượng + KNB (luôn hiển thị như nguồn)
  const lines = page.locator('#top .gold-stack .money-line');
  await expect(lines).toHaveCount(2);
  await expect(page.locator('#knbTop')).toHaveText('0');
  await expect(page.locator('#gold')).not.toBeEmpty();
  // heroName chỉ tên nhân vật (không có tên phái bên trong)
  const hn = await page.evaluate(() => {
    const b = document.querySelector('#heroName');
    return { text: (b?.textContent || '').trim(), hasSmall: !!b?.querySelector('small') };
  });
  expect(hn.text).toBe('TestHeader');
  expect(hn.hasSmall).toBe(false);
  // canvas avatar trong .lvbox — khi sprite jx tải xong, lvbox mang class avatar-live
  await expect(page.locator('#top .lvbox canvas')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.querySelector('#top .lvbox')?.classList.contains('avatar-live') || false), { timeout: 15000 }).toBe(true);
  // nút phải: gift + compact
  await expect(page.locator('#giftBtn')).toBeVisible();
  await expect(page.locator('#compactBtn')).toBeVisible();
  assertNoErrors();
});

test('quickbar 19 nút theo nguồn: đủ Thần Mã, icon đúng', async ({ page }) => {
  await createCharacter(page);
  const items = await page.evaluate(() => [...document.querySelectorAll('#qBar .qb')].map(b => ({
    n: b.querySelector('small')?.textContent || '',
    ic: b.querySelector('img')?.getAttribute('src') || '',
  })));
  const byName = Object.fromEntries(items.map(x => [x.n, x.ic]));
  expect(items).toHaveLength(19);
  expect(byName['Đồng hành']).toBe('ui/quick/companion.png');
  expect(byName['Phó bản']).toBe('ui/quick/dungeon.png');
  expect(byName['Đi thuyền']).toBe('ui/quick/boat.png');
  expect(byName['Boss tuần']).toBe('ui/quick/weekly-boss.png');
  expect(byName['Thần Mã']).toBe('ui/quick/than-ma.png');
  expect(byName['Kỳ Trân Các']).toBe('img/ep/knb.png');
  // thứ tự nguồn: Gia tộc đứng ngay sau Boss tuần
  const names = items.map(x => x.n);
  expect(names.indexOf('Gia tộc')).toBe(names.indexOf('Boss tuần') + 1);
  assertNoErrors();
});

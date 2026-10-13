/* He thống Than Ma (ngua Hoang Kim): backfill thanma cho save tu ban cu/editor
   (item d=10 dung ten Than Ma nhung thieu horse_id) — khong no thi nhan vat
   "len ngua" ma khong thay ngua (look.ts khong giai ma duoc sprite). */
import { test, expect, Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.route('**/api/chat/status', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 0 }) }));
  page.route('**/api/chat/stream*', () => { /* treo */ });
  page.route('**/api/chat/messages*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) }));
  page.route('**/api/chat/presence*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
});

async function createCharacter(page: Page) {
  await page.goto('/');
  await expect(page.locator('#pfName')).toBeVisible();
  await page.fill('#pfName', 'NguoiLuaNgua');
  await page.locator('.facpick button').first().click();
  await expect(page.locator('#bNotice')).toBeVisible();
  await page.locator('#bNotice').click();
  const skip = page.locator('#tSkip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  await expect(page.locator('#qBar .qb')).toHaveCount(19);
}

test('than ma: backfill thanma tu ten (save cu khong co horse_id)', async ({ page }) => {
  await createCharacter(page);

  // Them Phong Vân Thần Mã (d=10, k=21) VAO save — nhung khong co thanma,
  // nhu file luu tu editor/ban cu cua nguoi choi. ride=true de render ve ngua.
  const packed = await page.evaluate(() => localStorage.getItem('jxidle'));
  const state = JSON.parse(JSON.parse(packed).d);
  state.eq.horse = {
    d: 10, k: 21, n: 'Phong Vân Thần Mã', lvl: 10, r: 4, hlv: 20,
    req: [], base: [], mag: [], ext: [],
  };
  state.ride = true;
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

  const jxSheets: string[] = [];
  page.on('request', r => {
    const u = r.url();
    if (u.includes('/img/jx/m/ma_')) jxSheets.push(u);
  });

  await page.reload();
  await expect(page.locator('#qBar .qb')).toHaveCount(19);

  // thanma duoc backfill -> tooltip/Sổ Thần Mã nhan dien + renderer ve duoc ngua
  const info = await page.evaluate(() => {
    const g = (window as any).__G;
    const horse = g && g.S && g.S.eq && g.S.eq.horse;
    return { thanma: horse && horse.thanma, ride: g && g.S && g.S.ride };
  });
  expect(info.thanma).toBe('pvtm');
  expect(info.ride).toBe(true);
  await expect.poll(() => jxSheets.length > 0).toBe(true);
});

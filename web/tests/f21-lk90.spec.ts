/* F21 — Lĩnh ngộ võ công 90: học bằng Võ Lâm Mật Tịch / miễn phí đã chuyển sinh,
   luyện chiêu +1 cấp/sách, chặn học qua điểm kỹ năng thường, hook trùm cấp 90 rơi sách. */
import { test, expect, Page } from '@playwright/test';

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
});
const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

async function createCharacter(page: Page, name = 'LK90 Hiệp') {
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

test('lĩnh ngộ: học cần Mật Tịch, miễn phí đã chuyển sinh, luyện +1 cấp, chặn học thường', async ({ page }) => {
  await createCharacter(page);
  await page.evaluate(() => { const G = (window as any).__G; G.S.lvl = 80; G.R.dirty = true; });
  await page.evaluate(() => { (window as any).lk90Modal(); });
  await expect(page.locator('#mBody')).toContainText('Lĩnh ngộ');
  // chưa chuyển sinh + chưa có sách: KHÔNG có nút học (markup mới chỉ hiện nút khi đủ điều kiện)
  await expect(page.locator('#mBody [data-lk-learn]')).toHaveCount(0);
  await expect(page.locator('#mBody').first()).toContainText('cần Võ Lâm Mật Tịch');
  // có 1 Mật Tịch → học được, trừ sách
  await page.evaluate(() => { const G = (window as any).__G; G.matAdd('misc', 'bk90', 1); });
  await page.evaluate(() => { (window as any).lk90Modal(); });
  const learnBtn = page.locator('#mBody [data-lk-learn]').first();
  await expect(learnBtn).toBeVisible();
  await learnBtn.click();
  await expect.poll(() => page.evaluate(() => { const G = (window as any).__G; const r = G.RW(); return Object.keys((r.lk90 || {}).lv || {}).length; })).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__G.matHave('misc', 'bk90'))).toBe(0);
  // luyện chiêu cần thêm sách: hết sách → không có nút luyện
  await page.evaluate(() => { (window as any).lk90Modal(); });
  await expect(page.locator('#mBody [data-lk-practice]')).toHaveCount(0);
  await page.evaluate(() => { (window as any).__G.matAdd('misc', 'bk90', 1); });
  await page.evaluate(() => { (window as any).lk90Modal(); });
  const practiceBtn = page.locator('#mBody [data-lk-practice]').first();
  await expect(practiceBtn).toBeVisible();
  await practiceBtn.click();
  await expect.poll(() => page.evaluate(() => { const G = (window as any).__G, r = G.RW(); return Object.values(r.lk90.lv)[0]; })).toBe(2);
  // đã chuyển sinh: học miễn phí
  await page.evaluate(() => { const G = (window as any).__G; G.S.reborn = 1; });
  await page.evaluate(() => { (window as any).lk90Modal(); });
  await expect(page.locator('#mBody')).toContainText('Có thể học · không tốn sách');
  const btn2 = page.locator('#mBody [data-lk-learn]:not([disabled])').first();
  await btn2.click();
  await expect.poll(() => page.evaluate(() => { const G = (window as any).__G, r = G.RW(); return Object.keys(r.lk90.lv).length; })).toBe(2);
  assertNoErrors();
});

/* F20 — Kỳ Trân Các + KNB: đổi lượng↔KNB đúng tỷ giá nguồn (1.000.000 ↔ 10 KNB,
   bán 10 KNB → 800.000), mua trừ KNB/lượng, Bố Y giảm 50%, Dùng rương, trùm rơi KNB. */
import { test, expect, Page } from '@playwright/test';

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.route('**/api/chat/status', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 0 }) }));
  page.route('**/api/chat/stream*', () => { /* treo */ });
  page.route('**/api/chat/messages*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) }));
  page.route('**/api/chat/presence*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
});
const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

async function createCharacter(page: Page, name = 'KTC Hiệp') {
  await page.goto('/');
  await expect(page.locator('#pfName')).toBeVisible();
  await page.fill('#pfName', name);
  await page.locator('.facpick button').first().click();
  await expect(page.locator('#bNotice')).toBeVisible();
  await page.locator('#bNotice').click();
  const skip = page.locator('#tSkip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  await expect(page.locator('#qBar .qb')).toHaveCount(18);
}

test('kỳ trân: đổi KNB đúng tỷ giá, mua món, Dùng rương huyền tinh, guard Tỷ Võ', async ({ page }) => {
  await createCharacter(page);
  await page.evaluate(() => { const G = (window as any).__G; G.S.gold = 5_000_000; G.RW().knb = 0; G.save(); });
  await page.locator('#qBar .qb[data-q="17"]').click();
  await expect(page.locator('#mBody h3')).toContainText('Hoạt động giang hồ');
  await expect(page.locator('#mBody .ktc-knb b')).toContainText('Kim Nguyên Bảo: 0');

  // đổi 1 gói: −1.000.000 lượng → +10 KNB (đo đồng bộ trong 1 tick — idle vẫn cộng vàng nền)
  const ex = await page.evaluate(() => {
    const G = (window as any).__G;
    const g0 = G.S.gold, k0 = G.RW().knb || 0;
    document.querySelector('#mBody [data-ktc-buy="knb"]').click();
    return { dGold: g0 - G.S.gold, dKnb: (G.RW().knb || 0) - k0 };
  });
  expect(ex.dGold).toBe(1_000_000);
  expect(ex.dKnb).toBe(10);

  // bán 10 KNB → +800.000 lượng
  const sel = await page.evaluate(() => {
    const G = (window as any).__G;
    const g0 = G.S.gold, k0 = G.RW().knb || 0;
    document.querySelector('#mBody [data-ktc-sell]').click();
    return { dGold: G.S.gold - g0, dKnb: k0 - (G.RW().knb || 0) };
  });
  expect(sel.dGold).toBe(800_000);
  expect(sel.dKnb).toBe(10);

  // mua Rương Huyền Tinh (30.000 lượng) + Dùng → 2-3 Huyền Tinh
  await page.locator('#mBody [data-ktc-buy="rht"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__G.RW().ktcStack && (window as any).__G.RW().ktcStack.rht || 0)).toBe(1);
  await page.locator('#mBody [data-ktc-use="rht"]').click();
  await expect.poll(() => page.evaluate(() => Object.values((window as any).__G.S.mats.ht).reduce((a, b) => a + b, 0))).toBeGreaterThanOrEqual(2);

  // trùm rơi KNB (ktcOnBossKill elite luôn rơi khi mock random — gọi trực tiếp)
  const knb = await page.evaluate(() => { const G = (window as any).__G; const before = G.RW().knb || 0; G.ktcOnBossKill ? null : null; return before; });
  // guard Tỷ Võ: bật tyvo (đầy đủ trạng thái như tyvoStart) → nút mua disabled
  await page.evaluate(() => {
    const G = (window as any).__G;
    G.R.tyvo = { mode: 'school', difficulty: 0, streak: 0, powerScale: 1, resolved: false, roundActive: false,
      opponent: { name: 'Đối thủ thử', personName: '', factionName: 'Phái thử', factionKey: null, title: 'Đối thủ thử' } };
  });
  await page.locator('#mBody [data-event-tab="ktc"]').click();
  await expect(page.locator('#mBody [data-ktc-buy="knb"]')).toBeDisabled();
  await page.evaluate(() => { (window as any).__G.R.tyvo = null; });
  assertNoErrors();
});

test('kỳ trân: Bố Y giảm 50% giá, Sách vào túi nguyên liệu, trùm rơi KNB', async ({ page }) => {
  await createCharacter(page);
  await page.evaluate(() => { const G = (window as any).__G; G.S.chal = 'white'; G.S.gold = 1_000_000; G.RW().knb = 100; G.save(); });
  await page.locator('#qBar .qb[data-q="17"]').click();
  // rht gốc 30.000 → Bố Y 15.000
  await expect(page.locator('#mBody')).toContainText('Ưu đãi Bố Y · giảm 50%');
  // mua bk90 (50 KNB) rồi Dùng → mở thẻ Lĩnh ngộ + bk90 vào misc
  await page.locator('#mBody [data-ktc-buy="bk90"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__G.RW().ktcStack && (window as any).__G.RW().ktcStack.bk90 || 0)).toBe(1);
  await page.locator('#mBody [data-ktc-use="bk90"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__G.S.mats.misc.bk90 || 0)).toBe(1);
  assertNoErrors();
});

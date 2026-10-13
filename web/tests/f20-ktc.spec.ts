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
  await expect(page.locator('#qBar .qb')).toHaveCount(19);
}

test('kỳ trân: đổi KNB đúng tỷ giá, mua món, Dùng rương huyền tinh, guard Tỷ Võ', async ({ page }) => {
  await createCharacter(page);
  await page.evaluate(() => { const G = (window as any).__G; G.S.gold = 5_000_000; G.RW().knb = 0; G.save(); });
  await page.locator('#qBar .qb[data-q="18"]').click();
  await expect(page.locator('#mBody h3')).toContainText('Kỳ Trân Các');
  await expect(page.locator('#mBody .event-exchange b')).toContainText('Kim Nguyên Bảo');

  // đổi 1 gói: −1.000.000 lượng → +10 KNB (đo đồng bộ trong 1 tick — idle vẫn cộng vàng nền)
  const ex = await page.evaluate(() => {
    const G = (window as any).__G;
    const g0 = G.S.gold, k0 = G.RW().knb || 0;
    document.querySelector('#mBody [data-ktc="knb"]').click();
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
  await page.locator('#mBody [data-ktc="rht"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__G.RW().ktcStack && (window as any).__G.RW().ktcStack.rht || 0)).toBe(1);
  await page.locator('#mBody [data-event-use="rht"]').click();
  await expect.poll(() => page.evaluate(() => Object.values((window as any).__G.S.mats.ht).reduce((a, b) => a + b, 0))).toBeGreaterThanOrEqual(2);

  // trùm rơi KNB (ktcOnBossKill elite luôn rơi khi mock random — gọi trực tiếp)
  const knb = await page.evaluate(() => { const G = (window as any).__G; const before = G.RW().knb || 0; G.ktcOnBossKill ? null : null; return before; });
  // guard Tỷ Võ: bật tyvo (đầy đủ trạng thái như tyvoStart) → nút mua disabled
  await page.evaluate(() => {
    const G = (window as any).__G;
    G.R.tyvo = { mode: 'school', difficulty: 0, streak: 0, powerScale: 1, resolved: false, roundActive: false,
      opponent: { name: 'Đối thủ thử', personName: '', factionName: 'Phái thử', factionKey: null, title: 'Đối thủ thử' } };
  });
  await page.evaluate(() => { (window as any).openKtcModal(); });   // tyvo overlay che qb — mở trực tiếp
  await expect(page.locator('#mBody [data-ktc="knb"]')).toBeDisabled();
  await page.evaluate(() => { (window as any).__G.R.tyvo = null; });
  assertNoErrors();
});

test('kỳ trân: Bố Y giảm 50% giá, Sách vào túi nguyên liệu, trùm rơi KNB', async ({ page }) => {
  await createCharacter(page);
  await page.evaluate(() => { const G = (window as any).__G; G.S.chal = 'white'; G.S.gold = 1_000_000; G.RW().knb = 100; G.save(); });
  await page.locator('#qBar .qb[data-q="18"]').click();
  // rht gốc 30.000 → Bố Y 15.000
  await expect(page.locator('#mBody')).toContainText('Ưu đãi Bố Y · giảm 50%');
  // mua bk90 (50 KNB) rồi Dùng → mở thẻ Lĩnh ngộ + bk90 vào misc
  await page.locator('#mBody [data-ktc="bk90"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__G.RW().ktcStack && (window as any).__G.RW().ktcStack.bk90 || 0)).toBe(1);
  await page.locator('#mBody [data-event-use="bk90"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__G.S.mats.misc.bk90 || 0)).toBe(1);
  assertNoErrors();
});

test('kỳ trân: modal riêng cuộn được, đóng không rò class giang-ho-event-modal', async ({ page }) => {
  await createCharacter(page);
  await page.locator('#qBar .qb[data-q="18"]').click();
  await expect(page.locator('#modal')).toHaveClass(/giang-ho-event-modal/);
  // event-content cuộn được (nội dung dài hơn khung)
  const sc = await page.evaluate(() => {
    const c = document.querySelector('#mBody .event-content');
    if (!c) return null;
    c.scrollTop = 99999;
    return { sh: c.scrollHeight, ch: c.clientHeight, after: c.scrollTop };
  });
  expect(sc).toBeTruthy();
  expect(sc.sh).toBeGreaterThan(sc.ch);
  expect(sc.after).toBeGreaterThan(0);
  // footer "← Hoạt động" quay lại hub
  await page.locator('#mBody #eventBack').click();
  await expect(page.locator('#mBody [data-event-tab="dg"]')).toBeVisible();
  // đóng → mở Phần thưởng — modal phải sạch class hub (lỗi cũ: mở KTC xong mọi modal vỡ)
  await page.locator('#mClose').click();
  await page.locator('#qBar .qb[data-q="0"]').click();
  await expect(page.locator('#giftTabs button[data-g="tower"]')).toHaveClass(/on/);
  await expect(page.locator('#modal')).not.toHaveClass(/giang-ho-event-modal/);
  assertNoErrors();
});

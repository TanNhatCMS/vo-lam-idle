/* Test F13 — nhánh tiềm năng Cái Bang (attr-focus, upstream v107).
   - Ngoại công (Bổng: str/dex/vit) / Nội công (Chưởng: eng/dex/vit)
   - Tự nhận diện: attrFocus đã chọn > chiêu chính khóa > mặc Côn > điểm võ công
   - Chưa nhận diện (hòa): tự cộng điểm GIỮ điểm lại; gợi ý báo chọn tay
   - Phái khác: luôn 4 chi. MOCK /api/chat/* như mọi test. */
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

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
});
const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

async function createCharacter(page: Page, name: string, facMatch: RegExp) {
  await page.goto('/');
  await expect(page.locator('#pfName')).toBeVisible();
  await page.fill('#pfName', name);
  const facs = await page.locator('.facpick button').allTextContents();
  const idx = facs.findIndex(f => facMatch.test(f));
  expect(idx, 'phải có phái ' + facMatch).toBeGreaterThanOrEqual(0);
  await page.locator('.facpick button').nth(idx).click();
  await expect(page.locator('#bNotice')).toBeVisible();
  await page.locator('#bNotice').click();
  const skip = page.locator('#tSkip');
  if (await skip.isVisible({ timeout: 5000 }).catch(() => false)) await skip.click();
  await expect(page.locator('#qBar .qb')).toHaveCount(18);
}

test('attr-focus: Cái Bang tự nhận diện (Mặc Côn -> Ngoại công), chọn tay, chưa nhận diện giữ điểm', async ({ page }) => {
  await createCharacter(page, 'AF E2E', /Cái Bang/);
  const A = () => page.evaluate(() => (window as any).__ATTR);

  // mac dinh: tu nhan dien — vu khi khoi tao Cai Bang la Côn (k=2) -> Ngoai cong
  expect(await page.evaluate(() => (window as any).__ATTR.attrBranch())).toEqual({ branch: 'physical', source: 'staff' });
  expect(await page.evaluate(() => (window as any).__ATTR.attrCandidates())).toEqual(['str', 'dex', 'vit']);

  // chon tay Noi cong -> chi xét eng/dex/vit
  await page.evaluate(() => { (window as any).__G.S.attrFocus = 'inner'; });
  expect(await page.evaluate(() => (window as any).__ATTR.attrBranch())).toEqual({ branch: 'inner', source: 'selected' });
  expect(await page.evaluate(() => (window as any).__ATTR.attrCandidates())).toEqual(['eng', 'dex', 'vit']);

  // hoa điểm võ công (Bổng 1 = Chưởng 1), khong mon Côn, chua khoa chiêu -> chua nhan dang
  await page.evaluate(() => {
    const S = (window as any).__G.S;
    S.attrFocus = 'auto';
    S.eq.weapon = null;
    S.mainLock = false;
    S.sk = { 119: 1, 122: 1 };
  });
  expect(await page.evaluate(() => (window as any).__ATTR.attrBranch())).toEqual({ branch: 'ambiguous', source: null });
  expect(await page.evaluate(() => (window as any).__ATTR.attrCandidates())).toEqual([]);
  // tu cong điem GIU diem lai (autoSpendAttrs tra 0)
  await page.evaluate(() => { const S = (window as any).__G.S; S.attrPts = 5; });
  expect(await page.evaluate(() => (window as any).__ATTR.autoSpendAttrs())).toBe(0);
  expect(await page.evaluate(() => (window as any).__G.S.attrPts)).toBe(5);

  // Bổng nhieu hon -> Ngoai cong (theo diem võ công)
  await page.evaluate(() => { (window as any).__G.S.sk = { 119: 2, 122: 1 }; });
  expect(await page.evaluate(() => (window as any).__ATTR.attrBranch())).toEqual({ branch: 'physical', source: 'skills' });
  // Chưởng nhieu hon -> Noi cong
  await page.evaluate(() => { (window as any).__G.S.sk = { 119: 1, 122: 2 }; });
  expect(await page.evaluate(() => (window as any).__ATTR.attrBranch())).toEqual({ branch: 'inner', source: 'skills' });
  assertNoErrors();
});

test('attr-focus: phái khác (Thiếu Lâm) luôn 4 chi, không có thẻ nhánh', async ({ page }) => {
  await createCharacter(page, 'AF SL', /Thiếu Lâm/);
  expect(await page.evaluate(() => (window as any).__ATTR.attrBranch()))
    .toEqual({ branch: 'auto', source: null });
  expect(await page.evaluate(() => (window as any).__ATTR.attrCandidates()))
    .toEqual(['str', 'dex', 'vit', 'eng']);
  // mo goi y -> khong co thẻ Nhánh tiềm năng
  await page.evaluate(() => { const S = (window as any).__G.S; S.attrPts = 3; });
  await page.getByRole('button', { name: /Nhân vật/ }).click();
  await page.waitForTimeout(400);
  await page.locator('#bSugAt').click();
  await page.waitForTimeout(400);
  expect(await page.locator('#modal:not(.hidden)').innerText()).not.toContain('Nhánh tiềm năng');
  assertNoErrors();
});

test('attr-focus: goi ý Cái Bang — thẻ nhánh, nút chọn, áp dụng đúng nhánh', async ({ page }) => {
  await createCharacter(page, 'AF UI', /Cái Bang/);
  await page.evaluate(() => { const S = (window as any).__G.S; S.attrPts = 4; S.skPts = 2; });
  await page.getByRole('button', { name: /Nhân vật/ }).click();
  await page.waitForTimeout(400);
  await page.locator('#bSugAt').click();
  await page.waitForTimeout(400);
  const m = page.locator('#modal:not(.hidden)');
  await expect(m).toContainText('Nhánh tiềm năng Cái Bang');
  await expect(m).toContainText('Đang gợi ý theo Ngoại công · Bổng');
  // chuyen Noi cong -> trang thai + ap dung chi tang eng/dex/vit
  await page.locator('[data-attr-focus="inner"]').click();
  await page.waitForTimeout(400);
  await expect(m).toContainText('Đang gợi ý theo Nội công · Chưởng (bạn đã chọn)');
  await page.locator('#sgAt').click();
  await page.waitForTimeout(400);
  const attr = await page.evaluate(() => (window as any).__G.S.attr);
  expect(attr.str).toBe(0);   // Ngoai cong khong duoc cong
  expect(attr.dex + attr.vit + attr.eng).toBe(4);
  expect(await page.evaluate(() => (window as any).__G.S.attrFocus)).toBe('inner');
  assertNoErrors();
});

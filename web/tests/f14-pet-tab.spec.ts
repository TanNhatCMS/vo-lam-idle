/* Test F14 — thẻ Đồng hành trong menu Phần thưởng (giao diện mới, upstream v107).
   - Xem trước 1 loài: ảnh, tên·cấp, nút Dẫn theo
   - Thẻ vai trò (VAI TRÒ) + gợi ý "Hợp khi" + chi tiết kỹ năng (chiêu 2 khóa ở Lv30)
   - Danh sách loài nhóm theo vùng (tên vùng + "Quái cấp X–Y"), mỗi nút có nhãn vai trò + gợi ý kỹ năng
   - Xem loài khác đổi preview; Dẫn theo = chọn loài ra trận (S.rw.pet.tid)
   MOCK /api/chat/* như mọi test. */
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
  await expect(page.locator('#qBar .qb')).toHaveCount(14);
}

async function openPetTab(page: Page) {
  await page.evaluate(() => { const S = (window as any).__G.S; S.lvl = 30; S.xp = 0; S.maxStage = 20; });
  await page.locator('#qBar .qb[data-q="12"]').click();   // nút nhanh "Đồng hành" -> modal riêng
  await expect(page.locator('#mBody .pet-preview')).toBeVisible({ timeout: 8000 });
}

test('thẻ Đồng hành (modal riêng): preview + vai trò + kỹ năng + nhóm vùng', async ({ page }) => {
  await createCharacter(page, 'PET E2E', /Thiếu Lâm/);
  await openPetTab(page);

  /* modal riêng: có class pet-card-modal, KHÔNG có dãy tab Phần thưởng */
  await expect(page.locator('#modal')).toHaveClass(/pet-card-modal/);
  await expect(page.locator('#giftTabs')).toHaveCount(0);
  await expect(page.locator('#mBody h3')).toContainText('Đồng hành');

  /* layout: .petpick display block (không bị rule grid cũ của #t-pet đè) ->
     nhóm vùng xếp DỌC full-width, card không bị chèn ép hẹp lại */
  const layout = await page.evaluate(() => {
    const pick = document.querySelector('#mBody .petpick');
    const g = document.querySelector('#mBody .petgroup');
    const body = document.getElementById('mBody');
    return { display: getComputedStyle(pick).display, gW: Math.round(g.getBoundingClientRect().width), bW: Math.round(body.getBoundingClientRect().width) };
  });
  expect(layout.display, '.petpick phải display:block').toBe('block');
  expect(layout.gW, 'nhóm vùng full-width (không bị chia cột)').toBeGreaterThanOrEqual(layout.bW - 4);

  /* cấu trúc mới */
  await expect(page.locator('#mBody .pet-preview-head small')).toHaveText('ĐANG XEM ĐỒNG HÀNH');
  await expect(page.locator('#mBody .pet-role-block > b')).toHaveText('VAI TRÒ');
  expect(await page.locator('#mBody .pet-role-block .pet-role-tag').count(), 'thẻ vai trò').toBeGreaterThan(0);
  await expect(page.locator('#mBody .pet-role-block p')).not.toBeEmpty();
  expect(await page.locator('#mBody .petskill').count(), '2 chiêu').toBeGreaterThanOrEqual(2);
  expect(await page.locator('#mBody .petskill.lock').count(), 'chiêu 2 khóa ở Lv1').toBeGreaterThanOrEqual(1);
  /* nhóm theo vùng */
  const groups = page.locator('#mBody .petgroup');
  expect(await groups.count(), '≥2 vùng ở maxStage 20').toBeGreaterThanOrEqual(2);
  await expect(groups.first().locator('h4 small')).toContainText('Quái cấp');
  /* nút loài: nhãn vai trò + gợi ý kỹ năng */
  const btn = page.locator('#mBody .petgroup-grid button').first();
  expect(await page.locator('#mBody .pet-card-tags .pet-role-tag').count(), 'nhãn vai trò trên nút').toBeGreaterThan(0);
  expect(await btn.locator('.pet-skill-hint').textContent()).toMatch(/Lv30/);
  /* dòng trạng thái: Đã mở N/M + nhãn */
  const dimTexts = await page.locator('#mBody p.dim.small').allTextContents();
  expect(dimTexts.join(' | ')).toMatch(/Đã mở \d+\/\d+ loài/);
  expect(dimTexts.join(' | ')).toContain('Nhãn: Đánh lan · Kết liễu · Khống chế · Hồi phục · Chống chịu · Hỗ trợ');

  /* xem loài khác -> preview đổi + nút được chọn */
  const before = await page.locator('#mBody .pet-preview-head span b').textContent();
  const previews = page.locator('#mBody [data-p-preview]');
  const tid = await previews.nth(1).getAttribute('data-p-preview');
  await previews.nth(1).click();
  const after = await page.locator('#mBody .pet-preview-head span b').textContent();
  expect(after, 'preview đổi tên loài').not.toBe(before);
  await expect(page.locator(`#mBody [data-p-preview="${tid}"]`)).toHaveClass(/on/);
  /* preview theo loài mới: vai trò + kỹ năng của LOÀI ĐÓ (2 chiêu) */
  expect(await page.locator('#mBody .petskill').count()).toBeGreaterThanOrEqual(2);

  /* Dẫn theo = chọn loài ra trận */
  const adopt = page.locator('#mBody [data-p-adopt]');
  const adoptTid = +(await adopt.getAttribute('data-p-adopt'));
  expect(adoptTid, 'nút Dẫn theo đúng loài đang xem').toBe(+tid);
  await adopt.click();
  expect(await page.evaluate(() => (window as any).__G.S.rw.pet.tid)).toBe(adoptTid);
  await expect(adopt).toHaveText('Đang dẫn');
  await expect(adopt).toBeDisabled();
  /* nút loài đang dẫn có hint "Đang dẫn" */
  await expect(page.locator(`#mBody [data-p-preview="${tid}"] .pet-active-hint`)).toHaveText('Đang dẫn');
  await expect(page.locator(`#mBody [data-p-preview="${tid}"]`)).toHaveClass(/active/);
  assertNoErrors();
});

test('thẻ Đồng hành (modal riêng): chưa mở khóa (dưới cấp 20) báo khóa', async ({ page }) => {
  await createCharacter(page, 'PET LOCK', /Thiếu Lâm/);
  await page.evaluate(() => { const S = (window as any).__G.S; S.lvl = 10; });
  await page.locator('#qBar .qb[data-q="12"]').click();
  await expect(page.locator('#mBody')).toContainText('Đồng hành mở khóa ở cấp 20');
  assertNoErrors();
});

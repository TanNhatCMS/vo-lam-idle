/* Test hồi quy E2E — chạy trên bản build trong ../game (npm run android:sync).
   Bắt các lớp lỗi từng làm gãy tính năng cũ:
   - module đọc S/RW lúc top-level → crash "at module evaluation" → trắng trang
   - thiếu import $/hàm → nút modal chết giữa chừng (ReferenceError)
   - quick bar mở sai tab / thiếu nút (Giang hồ phải đủ 13 nút như bản gốc)
   Mọi pageerror + console.error đều fail test. */
import { test, expect, Page } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
});

const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

/* Tạo nhân vật mới (context test = localStorage trống → luôn màn chọn phái). */
async function createCharacter(page: Page, name = 'TestHiệp') {
  await page.goto('/');
  await expect(page.locator('#pfName')).toBeVisible();
  await page.fill('#pfName', name);
  await page.locator('.facpick button').first().click();
  await expect(page.locator('#bNotice')).toBeVisible();
  await page.locator('#bNotice').click();
  const skip = page.locator('#tSkip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  await expect(page.locator('#qBar .qb')).toHaveCount(13);
}

/* Đóng modal đang mở (test chỉ verify đường MỞ — nơi thiếu import giết nút). */
const closeModal = (page: Page) =>
  page.evaluate(() => { document.getElementById('modal')?.classList.add('hidden'); });

test('boot: trang mount, hiện màn chọn phái, không lỗi', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).not.toBeEmpty();
  await expect(page.locator('.facpick button')).not.toHaveCount(0);
  assertNoErrors();
});

test('tao nhan vat: chon phai -> ten -> vao game, luu save, danh nhau tu dong', async ({ page }) => {
  await createCharacter(page);
  const S = await page.evaluate(() => (window as any).__G.S);
  expect(S.fac).toBeTruthy();
  expect(S.name).toBe('TestHiệp');

  // lưu save → reload vẫn giữ nhân vật (không về màn chọn phái)
  await page.reload();
  await expect(page.locator('#qBar .qb')).toHaveCount(13);
  const S2 = await page.evaluate(() => (window as any).__G.S);
  expect(S2.fac).toBe(S.fac);
  expect(S2.name).toBe('TestHiệp');

  // idle: chiến đấu tự động → có kill sau ~20s
  await page.waitForTimeout(20000);
  const kills = await page.evaluate(() => (window as any).__G.R.kills);
  expect(kills, 'combat tự động phải có kill sau 20s').toBeGreaterThan(0);
  assertNoErrors();
});

/* 13 nút nhanh thẻ Giang hồ — mỗi nút mở đúng đích, không văng lỗi.
   Thứ tự + đích theo quickBarItems() trong journal.ts. */
const QUICK: { i: number; ten: string; tab?: string; text?: string }[] = [
  { i: 0, ten: 'Tháp I', tab: 'tower' },
  { i: 1, ten: 'Tháp II', tab: 'tower' },
  { i: 2, ten: 'Tống Kim', tab: 'tk' },
  { i: 3, ten: 'Dã Tẩu', tab: 'yt' },
  { i: 4, ten: 'Bang hội', tab: 'guild' },
  { i: 5, ten: 'Sổ tay', text: 'kn/giờ' },        // jrModal
  { i: 6, ten: 'Lò rèn', text: 'Lò Huyền Tinh' }, // htModal (KHÔNG phải forgeModal)
  { i: 7, ten: 'Kho', text: 'Ngân lượng' },       // stashModal
  { i: 8, ten: 'Bách khoa', text: 'Bách khoa' },
  { i: 9, ten: 'Gia tộc', text: 'Gia tộc' },
  { i: 10, ten: 'Tài Xỉu', tab: 'tx' },
  { i: 11, ten: 'Luyện Công', text: 'Luyện Công' },
  { i: 12, ten: 'Đồng hành', tab: 'pet' },
];

test('gia ng ho: 13 nut nhanh mo dung tinh nang', async ({ page }) => {
  await createCharacter(page);
  for (const q of QUICK) {
    await page.locator(`#qBar .qb[data-q="${q.i}"]`).click();
    const modal = page.locator('#modal:not(.hidden)');
    await expect(modal, `nút "${q.ten}" phải mở modal`).toBeVisible();
    if (q.tab) {
      // Mở đúng tab trong modal Phần thưởng (tab .on)
      await expect(page.locator(`#giftTabs button[data-g="${q.tab}"]`),
        `nút "${q.ten}" phải bật tab ${q.tab}`).toHaveClass(/on/);
    } else {
      await expect(page.locator('#mBody'), `nút "${q.ten}" phải có nội dung "${q.text}"`)
        .toContainText(q.text!);
    }
    await closeModal(page);
  }
  assertNoErrors();
});

test('nhung tinh nang cu: tab nav + Bách khoa chuyển tab', async ({ page }) => {
  await createCharacter(page);
  // Thanh tab dưới: duyệt Nhân vật / Hành trang (showTab + render tab)
  await page.locator('#tabs button[data-t="char"]').click();
  await expect(page.locator('#t-char:not(.hidden)')).toBeVisible();
  await page.locator('#tabs button[data-t="inv"]').click();
  await expect(page.locator('#t-inv:not(.hidden)')).toBeVisible();
  // Về tab Giang hồ (chứa hàng nút nhanh)
  await page.locator('#tabs button[data-t="log"]').click();
  await expect(page.locator('#qBar')).toBeVisible();
  // Mở Bách khoa rồi chuyển tab — bắt lỗi bind nút tab (thiếu import giết bind)
  await page.locator('#qBar .qb[data-q="8"]').click();
  await expect(page.locator('#modal:not(.hidden)')).toBeVisible();
  const codexTabs = page.locator('#mBody .dtabs button');
  const nTabs = await codexTabs.count();
  expect(nTabs).toBeGreaterThan(1);
  await codexTabs.nth(1).click();
  await expect(codexTabs.nth(1)).toHaveClass(/on/);
  await closeModal(page);
  assertNoErrors();
});

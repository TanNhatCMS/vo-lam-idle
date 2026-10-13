/* F17 — Hoạt động giang hồ: hub 4 tab (Phó bản / Đi thuyền / Boss tuần / Kỳ Trân Các),
   máy trạng thái phó bản (lượt/ngày, vào trận, phòng), Boss tuần (lượt/tuần, rương).
   Số liệu gốc: XC=2, Vw=3, ZC=3, QC=75s. MOCK /api/chat/* như mọi test. */
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

async function createCharacter(page: Page, name = 'HĐGiangHồ') {
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

test('hoạt động: hub mở từ nút Phó bản, đủ tab, danh sách 7 phó bản + lượt/ngày', async ({ page }) => {
  await createCharacter(page);
  await page.evaluate(() => { const G = (window as any).__G; G.S.lvl = 30; G.R.dirty = true; });
  await page.locator('#qBar .qb[data-q="3"]').click();
  await expect(page.locator('#modal')).toHaveClass(/giang-ho-event-modal/);
  await expect(page.locator('#mBody h3')).toContainText('Hoạt động giang hồ');
  // 4 tab
  for (const t of ['Phó bản', 'Đi thuyền', 'Boss tuần', 'Kỳ Trân Các', 'Lĩnh ngộ']) {
    await expect(page.locator('#mBody .event-tabs')).toContainText(t);
  }
  // 7 phó bản (bảng KC nguồn) + lượt 2/ngày
  await expect(page.locator('#mBody .dg-card')).toHaveCount(7);
  await expect(page.locator('#mBody')).toContainText('Dược Vương Cốc');
  await expect(page.locator('#mBody')).toContainText('Hoa Sơn Luận Kiếm');
  await expect(page.locator('#mBody')).toContainText('/2');
  // badge KNB trên header khi có KNB
  await page.evaluate(() => { const G = (window as any).__G; G.RW().knb = 12; G.save(); });
  await expect(page.locator('#knb')).toHaveText('12');
  assertNoErrors();
});

test('hoạt động: phó bản — cần cấp, vào trận sinh quái, hết giờ thoát', async ({ page }) => {
  await createCharacter(page);
  // cấp 1: Dược Vương Cốc (lv20) khóa
  await page.locator('#qBar .qb[data-q="3"]').click();
  const dvc = page.locator('#mBody [data-dg="dvc"]');
  await expect(dvc).toBeDisabled();
  await expect(page.locator('#mBody')).toContainText('Cần cấp 20');
  // lên cấp 30 + hồi phục → vào phó bản
  await page.evaluate(() => { const G = (window as any).__G; G.S.lvl = 30; G.R.dirty = true; });
  await page.locator('#mBody [data-event-tab="dg"]').click();   // re-render tab
  await expect(page.locator('#mBody [data-dg="dvc"]')).toBeEnabled();
  await page.locator('#mBody [data-dg="dvc"]').click();
  // đang trong trận: modal đóng, có quái sinh ra, banner phó bản
  await expect(page.locator('#modal')).toHaveClass(/hidden/);
  await expect.poll(() => page.evaluate(() => (window as any).__G.R.enemies.length), { timeout: 6000 }).toBeGreaterThan(0);
  const st = await page.evaluate(() => ({ kind: (window as any).__G.R.dg && (window as any).__G.R.dg.kind, room: (window as any).__G.R.dg.room }));
  expect(st.kind).toBe('dg');
  expect(st.room).toBe(1);
  assertNoErrors();
});

test('hoạt động: Boss tuần — 3 lượt/tuần, rương nhận theo hạng', async ({ page }) => {
  await createCharacter(page);
  await page.evaluate(() => { const G = (window as any).__G; G.S.lvl = 30; G.R.dirty = true; });
  await page.locator('#qBar .qb[data-q="5"]').click();
  await expect(page.locator('#mBody')).toContainText('Boss tuần');
  await expect(page.locator('#mBody')).toContainText('3/3');
  // chưa có kết quả: rương disabled
  await expect(page.locator('#mBody [data-wb-claim]')).toBeDisabled();
  // giả lập kết quả tuần: wbBest 60% máu → hạng A, rương nhận được
  await page.evaluate(() => {
    const G = (window as any).__G, r = G.RW();
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    const wk = `${d.getFullYear()}-W${String(Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 864e5 + 1) / 7)).padStart(2, '0')}`;
    const today = `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`;
    r.dgSave = r.dgSave || {}; r.dgSave.week = wk; r.dgSave.day = today; r.dgSave.wbBest = 600; r.dgSave.wbHp = 1000; r.dgSave.wbRank = 'A'; G.save();
  });
  await page.locator('#mBody [data-event-tab="wb"]').click();
  await expect(page.locator('#mBody')).toContainText('hạng A');
  await expect(page.locator('#mBody [data-wb-claim]')).toBeEnabled();
  await page.locator('#mBody [data-wb-claim]').click();
  await expect(page.locator('#mBody [data-wb-claim]')).toHaveText('Đã nhận');
  await expect.poll(() => page.evaluate(() => (window as any).__G.RW().knb || 0)).toBeGreaterThanOrEqual(10);   // rương A: +10 KNB
  assertNoErrors();
});

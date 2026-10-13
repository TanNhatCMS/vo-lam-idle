/* Test F15 — Khảm Tím lọc khoáng phù hợp (fKham, upstream v107).
   - cOre chỉ hiện khoáng khảm được cho món đang xem (đúng dòng + đúng loại trang bị + đúng hệ)
   - nhãn khoáng cho biết thuộc tính sẽ ra (theo cấp Huyền Tinh + cấp khoáng), hệ, loại trang bị
   - đổi cấp Huyền Tinh (cHt) → danh sách rebuild, nút Khảm bật/tắt theo khoáng phù hợp
   - toàn khoáng không phù hợp → "Không có khoáng phù hợp dòng N", Khảm disabled
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

async function createCharacter(page: Page, name = 'TestKham') {
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

/* Món kiếm trắng (d:0 weapon, k:0 sword, r:0, chưa dòng ma thuật) trong hành trang. */
/* Mở Rèn đồ cho món uid: Hanh trang → chuột phải → "Rèn đồ". */
async function openItemForge(page: Page, uid: number) {
  await page.locator('#tabs button[data-t="inv"]').click();
  await expect(page.locator('#t-inv:not(.hidden)')).toBeVisible();
  await page.locator(`#t-inv button.it[data-uid="${uid}"]`).click({ button: 'right' });
  await page.locator('[data-inv-context-action="forge"]').click();
  await expect(page.locator('#mBody')).toContainText('Khảm Tím');
}

test('fKham: chỉ hiện khoáng phù hợp (đúng dòng + loại), nhãn đủ thông tin', async ({ page }) => {
  await createCharacter(page);
  const uid = await page.evaluate(() => {
    const S = (window as any).__G.S;
    S.gold = 1000000;
    S.mats.ht = { 1: 5, 3: 2 };
    S.mats.ore = {
      '0:58:1': 2,   // phù hợp: dòng 1 · affix "Bỏ qua phòng thủ" (mọi hệ, mọi vũ khí — có Kiếm)
      '0:88:1': 1,   // sai loại: affix chỉ cho Áo/Giày/Đai/Mũ
      '1:58:1': 1,   // sai dòng: khoáng ứng dòng 2
    };
    const it = { uid: 990001, n: 'Kiếm tập sự', k: 0, d: 0, lvl: 1, r: 0, s: 0, enh: 0, base: [[28, 10, 20]], mag: [], req: [], vio: false, set: null };
    S.inv.push(it);
    return it.uid;
  });
  await openItemForge(page, uid);

  /* cOre chỉ còn khoáng phù hợp */
  const opts = page.locator('#mBody #cOre option');
  await expect(opts).toHaveCount(1);
  await expect(opts.first()).toHaveAttribute('value', '0:58:1');
  await expect(opts.first()).toContainText('Bỏ qua phòng thủ đối phương');
  await expect(opts.first()).toContainText('mọi hệ');
  await expect(opts.first()).toContainText('Vũ khí');
  await expect(opts.first()).toContainText('×2');
  /* hint + nút Khảm bật */
  await expect(page.locator('#mBody')).toContainText('Danh sách chỉ hiện khoáng phù hợp; khoáng khác vẫn được giữ trong túi');
  await expect(page.locator('#mBody #fKham')).toBeEnabled();

  /* đổi cHt cấp 3 → rebuild danh sách (affix 58 đồng nhất các cấp nên vẫn fit) */
  await page.locator('#mBody #cHt').selectOption('3');
  await expect(page.locator('#mBody #cOre option')).toHaveCount(1);
  await expect(page.locator('#mBody #cOre option')).toHaveAttribute('value', '0:58:1');
  await expect(page.locator('#mBody #fKham')).toBeEnabled();
  assertNoErrors();
});

test('fKham: toàn khoáng không phù hợp → báo "Không có khoáng phù hợp", Khảm disabled', async ({ page }) => {
  await createCharacter(page);
  const uid = await page.evaluate(() => {
    const S = (window as any).__G.S;
    S.gold = 1000000;
    S.mats.ht = { 1: 5 };
    S.mats.ore = { '0:88:1': 1 };   // chỉ cho Áo/Giày/Đai/Mũ — không khảm được vào Kiếm
    const it = { uid: 990002, n: 'Kiếm tập sự', k: 0, d: 0, lvl: 1, r: 0, s: 0, enh: 0, base: [[28, 10, 20]], mag: [], req: [], vio: false, set: null };
    S.inv.push(it);
    return it.uid;
  });
  await openItemForge(page, uid);

  await expect(page.locator('#mBody #cOre option')).toHaveCount(1);
  await expect(page.locator('#mBody #cOre option')).toHaveText('Không có khoáng phù hợp dòng 1');
  await expect(page.locator('#mBody #fKham')).toBeDisabled();
  assertNoErrors();
});

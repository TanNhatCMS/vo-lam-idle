/* Test E2E F6 (Mua Huyền Tinh) + F8 (Rèn ngẫu nhiên) — chạy trên bản build trong ../game.
   Pattern theo regression.spec.ts: boot → tạo nhân vật scripted → thao tác → assert.
   Mọi pageerror + console.error đều fail test. Test độc lập, tự tạo save mới. */
import { test, expect, Page } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
});

const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

/* Tạo nhân vật mới (context test = localStorage trống → luôn màn chọn phái). */
async function createCharacter(page: Page, name = 'TestForge') {
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

/* Mở Lò Huyền Tinh (nút nhanh thứ 6, thẻ Giang hồ) và chờ modal hiện. */
async function openForge(page: Page) {
  await page.locator('#qBar .qb[data-q="6"]').click();
  const modal = page.locator('#modal:not(.hidden)');
  await expect(modal, 'nút Lò rèn phải mở Lò Huyền Tinh').toBeVisible();
  await expect(page.locator('#mBody')).toContainText('Lò Huyền Tinh');
  return modal;
}

/* Mua Huyền Tinh: seed 1 viên cấp 1 → nút "Mua 2 viên" hiện; click mua đủ 3 cấp,
   vàng trừ đúng htBuyCost(1) × 2 (đồng bộ trong 1 tick evaluate → delta chính xác). */
test('f6 mua huyen tinh: co nut mua, mua 2 vien cap 1 tra dung vang, du 3 vien', async ({ page }) => {
  await createCharacter(page);
  // seed trang thai: vang nhieu, 1 Huyen Tinh cấp 1 (thiếu 2 viên để thăng cấp)
  await page.evaluate(() => {
    const S = (window as any).__G.S;
    S.gold = 1000000;
    S.mats = S.mats || {};
    S.mats.ht = S.mats.ht || {};
    S.mats.ht[1] = 1;
  });
  await openForge(page);

  // co nút mua Huyền Tinh cấp 1 (mua đủ 3 - 1 = 2 viên)
  const buyBtn = page.locator('#mBody [data-buy="1"]');
  await expect(buyBtn, 'phải có nút mua Huyền Tinh cấp 1').toBeVisible();
  await expect(buyBtn).toContainText('Mua 2 viên');
  await expect(buyBtn).toBeEnabled();

  // click mua → vàng trừ đúng htBuyCost(1) × 2 = round(12000 × 2 × 1.3) × 2 = 62400
  const res = await page.evaluate(() => {
    const G = (window as any).__G;
    const before = G.S.gold;
    (document.querySelector('#mBody [data-buy="1"]') as HTMLElement).click();
    return { dGold: before - G.S.gold, ht1: G.S.mats.ht[1], gold: G.S.gold };
  });
  expect(res.dGold, 'mua 2 viên cấp 1 phải trừ đúng 62400 lượng').toBe(62400);
  expect(res.ht1, 'sau mua phải có đúng 3 viên cấp 1').toBe(3);
  expect(res.gold).toBe(1000000 - 62400);
  // modal tự mở lại sau afterRc
  await expect(page.locator('#modal:not(.hidden)')).toBeVisible();
  assertNoErrors();
});

/* Mua Huyền Tinh: vàng không đủ → nút mua hiện nhưng disabled, bấm không được. */
test('f6 mua huyen tinh: thieu vang khong mua duoc', async ({ page }) => {
  await createCharacter(page);
  await page.evaluate(() => {
    const S = (window as any).__G.S;
    S.gold = 100;                       // không đủ mua 2 viên cấp 1 (62400)
    S.mats = S.mats || {};
    S.mats.ht = S.mats.ht || {};
    S.mats.ht[1] = 1;
  });
  await openForge(page);
  // nút mua vẫn hiện (thiếu 2 viên) nhưng disabled vì không đủ vàng
  const buyBtn = page.locator('#mBody [data-buy="1"]');
  await expect(buyBtn).toHaveCount(1);
  await expect(buyBtn).toBeDisabled();
  assertNoErrors();
});

/* Rèn ngẫu nhiên: 3 mức cữ hiện đủ; bấm mức Thường → trừ đúng rfCost,
   thành công thì +1 đồ vào hành trang, thất bại thì mất hết vàng (không có đồ mới). */
test('f8 ren ngau nhien: 3 muc cuoc, tra vang dung, hoac co do moi hoac mat vang', async ({ page }) => {
  await createCharacter(page);
  await page.evaluate(() => {
    const S = (window as any).__G.S;
    S.gold = 1000000;
  });
  await openForge(page);

  // the Rèn ngẫu nhiên với 3 mức cữ (Thường / Khá / Hiếm)
  const rfBtns = page.locator('#mBody [data-rf]');
  await expect(rfBtns).toHaveCount(3);
  await expect(page.locator('#mBody')).toContainText('Rèn ngẫu nhiên');
  for (const k of ['thuong', 'kha', 'hiem']) {
    await expect(page.locator(`#mBody [data-rf="${k}"]`), `phải có mức ${k}`).toBeVisible();
  }

  // vàng luôn bị trừ trước (thất bại cũng mất); thành công thì có thêm 1 món.
  // rfCost tính trong cùng evaluate đồng bộ với click → delta chính xác tuyệt đối.
  const res = await page.evaluate(() => {
    const G = (window as any).__G;
    const rfCost = Math.round((6000 + G.S.lvl * 700) * 1 * (1 + G.S.lvl / 60));   // mức Thường heSo=1
    const before = { gold: G.S.gold, inv: G.S.inv.length };
    (document.querySelector('#mBody [data-rf="thuong"]') as HTMLElement).click();
    return { dGold: before.gold - G.S.gold, dInv: G.S.inv.length - before.inv, rfCost };
  });
  expect(res.dGold, 'rèn mức Thường phải trừ đúng rfCost lượng').toBe(res.rfCost);
  expect([0, 1], 'thành công +1 đồ, thất bại không thêm đồ').toContain(res.dInv);
  await expect(page.locator('#modal:not(.hidden)'), 'modal phải tự mở lại').toBeVisible();
  assertNoErrors();
});

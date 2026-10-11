/* Test E2E F7/F9/F10 — luu trữ điểm tiềm năng, sưu tập bộ đồ, bảng lọc đồ nâng cao.
   Cùng mo hinh regression.spec.ts: bat pageerror + console.error, tao nhan vat moi
   (context test = localStorage trong), doc trang thai qua (window as any).__G.
   - F10: bang loc đồ rơi hiện trong Cài đặt Auto (#autoLootPanel), chuyển chế độ /
     chọn điều kiện ghi vào S.lootF.
   - F9: kích hoạt "Một bộ Hoàng Kim" ở Bảng thử nghiệm → reload → migrate backfill
     S.setSeen từ đồ bộ đang mặc.
   - F7: save dạng JSON thường (định dạng cũ, unpack chấp nhận) có attrPotentialArchive
     → reload → restoreArchivedPotential hoàn trả điểm khóa vào nhân vật tới ngưỡng. */
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

const readS = (page: Page) => page.evaluate(() => (window as any).__G.S);

test('F10 bang loc do roi nang cao: hien trong Cai dat Auto, chuyen che do va chon dieu kien luu vao S.lootF', async ({ page }) => {
  await createCharacter(page);
  // Mở Cài đặt Auto (thẻ Đa dạng -> nút Cài đặt Auto -> trang #t-auto)
  await page.locator('#tabs button[data-t="more"]').click();
  await page.locator('#bAutoSet').click();
  const panel = page.locator('#autoLootPanel .loot-panel');
  await expect(panel, 'bảng lọc đồ phải hiện trong Cài đặt Auto').toBeVisible();
  // hai chế độ + các điều khiển chính
  await expect(page.locator('#autoLootPanel [data-loot-mode]')).toHaveCount(2);
  await expect(page.locator('#fAuto')).toBeVisible();
  await expect(page.locator('#fEquipment')).toBeVisible();
  await expect(page.locator('#fMaterials')).toBeVisible();
  await expect(page.locator('#fWhite')).toBeVisible();
  await expect(page.locator('#fSkipLowSets')).toBeVisible();
  await expect(page.locator('#fReqLvl')).toBeVisible();
  await expect(page.locator('#bLootClear')).toBeVisible();
  await expect(page.locator('#autoLootPanel .ground-loot-list')).toBeVisible();
  await expect(page.locator('#autoLootPanel [data-ground-view]')).toHaveCount(3);
  // chuyển chế độ: Tùy chỉnh -> Thông minh -> Tùy chỉnh, S.lootF.mode theo đó
  await page.locator('#autoLootPanel [data-loot-mode="smart"]').click();
  expect((await readS(page)).lootF.mode).toBe('smart');
  await page.locator('#autoLootPanel [data-loot-mode="custom"]').click();
  expect((await readS(page)).lootF.mode).toBe('custom');
  // chọn điều kiện: đồ trắng / bỏ qua bộ cấp thấp / yêu cầu cấp từ 5
  await page.locator('#fWhite').check();
  await page.locator('#fSkipLowSets').check();
  await page.locator('#fSkipLowSets').uncheck();
  await page.locator('#fReqLvl').fill('5');
  await page.locator('#fReqLvl').blur();
  const s = await readS(page);
  expect(s.lootF.white, 'bật "Đồ trắng" phải ghi white=true').toBe(true);
  expect(s.lootF.skipLowSets, 'bỏ "Bỏ qua bộ cấp thấp" phải ghi skipLowSets=false').toBe(false);
  expect(s.lootF.minReqLvl, 'điền yêu cầu cấp 5 phải ghi minReqLvl=5').toBe(5);
  assertNoErrors();
});

test('F9 sưu tập bộ đồ: mặc bộ Hoàng Kim (Bảng thử nghiệm) -> S.setSeen được đánh dấu sau reload', async ({ page }) => {
  await createCharacter(page);
  // Bảng thử nghiệm -> "Một bộ Hoàng Kim đủ ô" (adminApply tự lưu)
  await page.locator('#tabs button[data-t="more"]').click();
  await page.locator('#bAdmin').click();
  await expect(page.locator('#modal:not(.hidden)')).toBeVisible();
  await page.locator('#mBody [data-ad="gear"]').click();
  // reload: pagehide -> save() -> load() -> migrate backfill S.setSeen từ đồ bộ đang mặc
  await page.reload();
  await expect(page.locator('#qBar .qb')).toHaveCount(13);
  const s = await readS(page);
  const goldEquipped = Object.values((s.eq || {}) as any[]).filter((it: any) => it && it.set).length;
  expect(goldEquipped, 'bộ Hoàng Kim phải đang mặc sau reload').toBeGreaterThan(0);
  expect(Object.keys(s.setSeen || {}).length, 'S.setSeen phải có món bộ sau khi mặc bộ Hoàng Kim').toBeGreaterThan(0);
  assertNoErrors();
});

test('F7 luu trữ điểm tiềm năng: archive trong save cũ được khôi phục khi tải (đến ngưỡng)', async ({ page }) => {
  await createCharacter(page);
  // Ghi đè file lưu bằng JSON thường (định dạng cũ — unpack chấp nhận ok:true),
  // có archive 100 điểm STR + 50 điểm chưa dùng, khóa ở lần chuyển sinh 0.
  // S.fac = null để pagehide/autosave không ghi đè injection trước khi reload.
  const injected = await page.evaluate(() => {
    const g = (window as any).__G;
    const state = JSON.parse(JSON.stringify(g.S));
    state.attr = { str: 0, dex: 0, vit: 0, eng: 0 };
    state.attrPts = 0;
    state.attrBonusEarned = 0;
    state.attrPotentialArchive = {
      version: 1,
      records: [{
        createdAt: Date.now(), sourceLevel: 1, reborn: 0,
        original: { attr: { str: 0, dex: 0, vit: 0, eng: 0 }, unspent: 0, bonusEarned: 0 },
        active: { attr: { str: 0, dex: 0, vit: 0, eng: 0 }, unspent: 0, bonusEarned: 0 },
        locked: { attr: { str: 100, dex: 0, vit: 0, eng: 0 }, unspent: 50, bonusEarned: 0 },
        lockedTotal: 150, noticeShown: false,
      }],
    };
    g.S.fac = null;   // chan save() (pagehide, autosave 10s) -> khong ghi de localStorage
    try { localStorage.setItem('jxidle', JSON.stringify(state)); } catch (e) { return 'fail:' + e; }
    return 'ok';
  });
  expect(injected).toBe('ok');
  await page.reload();
  await expect(page.locator('#qBar .qb')).toHaveCount(13);
  const s = await readS(page);
  // nhân vật cấp 1: ngân sách 0 -> ngưỡng phục hồi 3.000 -> archive 150 điểm được hoàn trả hết
  expect(s.attr.str, '100 điểm STR khóa trong archive phải được khôi phục').toBe(100);
  expect(s.attrPts, '50 điểm chưa dùng trong archive phải được khôi phục').toBe(50);
  expect(s.attrBonusEarned).toBe(0);
  expect(!s.attrPotentialArchive || !s.attrPotentialArchive.records || s.attrPotentialArchive.records.length === 0,
    'archive đã dùng hết phải bị xóa khỏi save').toBe(true);
  assertNoErrors();
});

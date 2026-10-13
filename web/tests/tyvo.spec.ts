/* Test E2E G2 — Tỷ Võ Trường (tyvo.ts + hooks combat.ts / rewards.ts / ui.ts).
   Pattern theo f1/f6: boot → tạo nhân vật scripted → thao tác → assert.
   Mọi pageerror + console.error đều fail test. Test độc lập, tự tạo save mới. */
import { test, expect, Page } from '@playwright/test';

/* Chat the gioi: mock toan bo /api/chat/* (stream treo = khong noi
   server chat nguon that — ca suite ~40 trang cung IP bi 429). */
test.beforeEach(async ({ page }) => {
  page.route('**/api/chat/status', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 0 }) }));
  page.route('**/api/chat/stream*', () => { /* treo: EventSource dung CONNECTING */ });
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

/* Tạo nhân vật mới (context test = localStorage trống → luôn màn chọn phái). */
async function createCharacter(page: Page, name = 'TestTyVo') {
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

/* Mở thẻ Tỷ Võ (nút nhanh cuối cùng, data-q=13) và chờ bảng điều khiển hiện. */
async function openTyvoTab(page: Page) {
  await page.locator('#qBar .qb[data-q="16"]').click();
  const modal = page.locator('#modal:not(.hidden)');
  await expect(modal, 'nút Tỷ Võ phải mở quà → bảng Tỷ Võ').toBeVisible();
  await expect(page.locator('.tyvo-panel')).toBeVisible();
  return modal;
}

/* Lên cấp 30 (Tỷ Võ mở ở cấp 30) rồi chờ recalculate xong. */
async function reachLevel30(page: Page) {
  await page.evaluate(() => {
    const g = (window as any).__G;
    g.S.lvl = 30;
    g.R.dirty = true;
  });
  await page.waitForFunction(
    () => (window as any).__G.R.P && (window as any).__G.R.P.life > 0,
    null, { timeout: 5000, polling: 50 },
  );
}

/* Vào tỷ võ (Đồng Môn): click "Vào tỷ võ", chờ trận bắt đầu. */
async function enterTyvo(page: Page) {
  await page.locator('#tvStart').click();
  await page.waitForFunction(
    () => !!(window as any).__G.R.tyvo && (window as any).__G.R.enemies.length === 1,
    null, { timeout: 10000, polling: 50 },
  );
}

test('TV1 Bảng Tỷ Võ: nút nhanh mở tab, khóa cấp 30, cửa hàng 3 dòng', async ({ page }) => {
  await createCharacter(page);
  await openTyvoTab(page);
  // cấp 1: nút Vào tỷ võ bị khóa, ghi yêu cầu cấp 30
  const start = page.locator('#tvStart');
  await expect(start).toBeDisabled();
  await expect(start).toContainText('Cần cấp 30');
  // cửa hàng: 3 dòng đổi Võ Huân, 0 Võ Huân → hết nút Đổi bị khóa
  await expect(page.locator('.tyvo-shop-row')).toHaveCount(3);
  for (const b of await page.locator('.tyvo-shop-row button').all()) await expect(b).toBeDisabled();
  // chưa có lịch sử trận nào
  await expect(page.locator('.tyvo-history')).toHaveCount(0);
  // reset line: giờ reset + thống kê hôm nay
  await expect(page.locator('.tyvo-reset-line')).toContainText('00:00 giờ Việt Nam');
  assertNoErrors();
});

test('TV2 Vào trận Đồng Môn: bot sinh ra, HUD, body.tyvo-active, đồng hồ 5 phút', async ({ page }) => {
  await createCharacter(page);
  await reachLevel30(page);
  await openTyvoTab(page);
  const start = page.locator('#tvStart');
  await expect(start).toBeEnabled();
  await expect(start).toContainText('Vào tỷ võ');
  await enterTyvo(page);
  // HUD trên sân đấu: kicker + tên đối thủ + đồng hồ mm:ss
  await expect(page.locator('#tyVoHud')).toBeVisible();
  await expect(page.locator('.tyvo-hud-kicker')).toContainText('TỶ VÕ TRƯỜNG');
  await expect(page.locator('.tyvo-round-clock b')).toContainText(/\d{2}:\d{2}/);
  const st = await page.evaluate(() => {
    const g = (window as any).__G;
    const e = g.R.enemies[0];
    return {
      tyvo: !!g.R.tyvo,
      mode: g.R.tyvo && g.R.tyvo.mode,
      cls: document.body.classList.contains('tyvo-active'),
      fighter: !!e.tvFighter,
      name: e && e.n,
      modalClosed: (() => { const m = document.querySelector('#modal'); return m === null || m.classList.contains('hidden'); })(),
    };
  });
  expect(st.tyvo).toBe(true);
  expect(st.mode).toBe('school');
  expect(st.cls).toBe(true);
  expect(st.fighter).toBe(true);
  expect(st.name, 'đối thủ phải là Đệ tử cùng phái').toContain('Đệ tử');
  expect(st.modalClosed, 'modal quà phải đóng khi vào trận').toBe(true);
  // nút sang ải bị khóa trong trận
  await expect(page.locator('#bPrev')).toBeDisabled();
  assertNoErrors();
});

test('TV3 Thắng trận Đồng Môn: +1 Võ Huân, chuỗi 1, mốc Đệ tử nhập môn, đối thủ kế tiếp', async ({ page }) => {
  await createCharacter(page);
  await reachLevel30(page);
  await openTyvoTab(page);
  await enterTyvo(page);
  // hạ đối thủ: máu 1, tắt hồi + hỗ trợ để thắng luôn 1 đòn
  await page.evaluate(() => {
    const e = (window as any).__G.R.enemies[0];
    e.hp = 1; e.regen = 0; e.tvSupport = null; e.tvSkills = [];
  });
  await page.waitForFunction(
    () => (window as any).__G.R.tyvo && (window as any).__G.R.tyvo.streak === 1,
    null, { timeout: 15000, polling: 50 },
  );
  // banner chiến thắng còn hiện (đối thủ kế tiếp sinh sau 1.1s mới xóa banner)
  const banner = await page.evaluate(() => {
    const b = (window as any).__G.R.banner;
    return b ? b.text + '|' + b.sub : '';
  });
  expect(banner).toContain('chiến thắng');
  expect(banner).toContain('+1 Võ Huân');
  const res = await page.evaluate(() => {
    const g = (window as any).__G;
    const r = g.TV.RW();
    return { vh: r.vh, school: r.tv.school, hist: r.tv.history[0], ht3: (g.S.mats.ht || {})[3] || 0 };
  });
  expect(res.vh, 'thắng Đồng Môn được +1 Võ Huân').toBe(1);
  expect(res.school, 'mốc Đồng Môn lên 1').toBe(1);
  expect(res.hist.result).toBe('Thắng');
  expect(res.hist.reward).toBe(1);
  expect(res.ht3, 'mốc Đệ tử nhập môn thưởng 1 Huyền Tinh cấp 3').toBe(1);
  // đối thủ kế tiếp đã sinh (spawnT 1.1s)
  await page.waitForFunction(
    () => (window as any).__G.R.enemies.length === 1,
    null, { timeout: 10000, polling: 50 },
  );
  await expect(page.locator('.tyvo-hud')).toBeVisible();
  assertNoErrors();
});

test('TV4 Cửa hàng: đổi 8 Võ Huân lấy 1 Huyền Tinh', async ({ page }) => {
  await createCharacter(page);
  await reachLevel30(page);
  await openTyvoTab(page);
  // seed 100 Võ Huân, rồi đổi tab rồi về lại Tỷ Võ để bảng vẽ lại với đủ tiền
  await page.evaluate(() => { const g = (window as any).__G; g.TV.RW().vh = 100; g.TV.save(); });
  await page.locator('#mBody #giftTabs [data-g="tx"]').click();
  await page.locator('#mBody #giftTabs [data-g="tyvo"]').click();
  await expect(page.locator('.tyvo-panel')).toBeVisible();
  const buy0 = page.locator('.tyvo-shop-row [data-tv-buy="0"]');
  await expect(buy0).toBeEnabled();
  const before = await page.evaluate(() => (window as any).__G.TV.tvVh());
  expect(before).toBe(100);
  await buy0.click();
  const after = await page.evaluate(() => {
    const g = (window as any).__G;
    return { vh: g.TV.tvVh(), ht3: (g.S.mats.ht || {})[3] || 0 };
  });
  expect(after.vh, 'mua phải trừ đúng 8 Võ Huân').toBe(92);
  expect(after.ht3, 'phải nhận 1 Huyền Tinh cấp 3').toBe(1);
  assertNoErrors();
});

test('TV5 Giang Hồ Tỷ Võ: đổi chế độ, khó Tông sư, thắng +3 Võ Huân', async ({ page }) => {
  await createCharacter(page);
  await reachLevel30(page);
  await openTyvoTab(page);
  // chuyển Giang Hồ → hiện 3 cấp khó, chọn Tông sư (thưởng +3)
  await page.locator('[data-tv-mode="jianghu"]').click();
  await expect(page.locator('.tyvo-difficulty')).toBeVisible();
  await page.locator('[data-tv-diff="2"]').click();
  await enterTyvo(page);
  const st = await page.evaluate(() => {
    const g = (window as any).__G;
    return { mode: g.R.tyvo.mode, diff: g.R.tyvo.difficulty, kicker: (document.querySelector('.tyvo-hud-kicker') as HTMLElement | null)?.textContent };
  });
  expect(st.mode).toBe('jianghu');
  expect(st.diff).toBe(2);
  expect(st.kicker).toContain('GIANG HỒ TỶ VÕ');
  // thắng → +3 Võ Huân (khó Tông sư)
  await page.evaluate(() => {
    const e = (window as any).__G.R.enemies[0];
    e.hp = 1; e.regen = 0; e.tvSupport = null; e.tvSkills = [];
  });
  await page.waitForFunction(
    () => (window as any).__G.R.tyvo && (window as any).__G.R.tyvo.streak === 1,
    null, { timeout: 15000, polling: 50 },
  );
  const vh = await page.evaluate(() => (window as any).__G.TV.RW().vh);
  expect(vh, 'Giang Hồ khó Tông sư thắng được +3 Võ Huân').toBe(3);
  assertNoErrors();
});

test('TV6 Bại trận: gục → dừng chuỗi, giữ Võ Huân, hồi máu đầy', async ({ page }) => {
  await createCharacter(page);
  await reachLevel30(page);
  await openTyvoTab(page);
  await page.evaluate(() => { const g = (window as any).__G; g.TV.RW().vh = 50; g.TV.save(); });
  await enterTyvo(page);
  // đối thủ đánh mạnh, nhân vật chỉ còn 1 máu → gục ngay
  await page.evaluate(() => {
    const g = (window as any).__G;
    const e = g.R.enemies[0];
    e.dmg = 1e9; e.atkCd = 0.05; e.tvSkills = [];
    g.R.life = 1;
  });
  await page.waitForFunction(
    () => !(window as any).__G.R.tyvo,
    null, { timeout: 15000, polling: 50 },
  );
  const st = await page.evaluate(() => {
    const g = (window as any).__G;
    return {
      cls: document.body.classList.contains('tyvo-active'),
      hud: !!document.querySelector('#tyVoHud'),
      hist: g.TV.RW().tv.history[0],
      vh: g.TV.RW().vh,
      lifeFull: Math.abs(g.R.life - g.R.P.life) < 0.001,
    };
  });
  expect(st.cls, 'body phải bỏ lớp tyvo-active').toBe(false);
  expect(st.hud, 'HUD phải gỡ').toBe(false);
  expect(st.hist.result).toBe('Thua');
  expect(st.vh, 'Võ Huân vẫn giữ nguyên').toBe(50);
  expect(st.lifeFull, 'nhân vật hồi máu đầy sau bại trận').toBe(true);
  assertNoErrors();
});

test('TV7 Hết giờ: đồng hồ 5 phút kết thúc trận', async ({ page }) => {
  await createCharacter(page);
  await reachLevel30(page);
  await openTyvoTab(page);
  await enterTyvo(page);
  // lùi deadline trận về quá khứ → tick kế tiếp kết thúc "Hết giờ"
  await page.evaluate(() => { (window as any).__G.R.tyvo.roundDeadline = Date.now() - 1000; });
  await page.waitForFunction(
    () => !(window as any).__G.R.tyvo,
    null, { timeout: 10000, polling: 50 },
  );
  const hist = await page.evaluate(() => (window as any).__G.TV.RW().tv.history[0]);
  expect(hist.result).toBe('Hết giờ');
  assertNoErrors();
});

test('TV8 Dừng chuỗi: nút Dừng trên HUD kết thúc trận, mở lại bảng có lịch sử', async ({ page }) => {
  await createCharacter(page);
  await reachLevel30(page);
  await openTyvoTab(page);
  await enterTyvo(page);
  await page.locator('.tyvo-hud-stop').click();
  await page.waitForFunction(
    () => !(window as any).__G.R.tyvo,
    null, { timeout: 10000, polling: 50 },
  );
  const st = await page.evaluate(() => {
    const g = (window as any).__G;
    return { hist: g.TV.RW().tv.history[0], bPrevDisabled: !!(document.querySelector('#bPrev') as HTMLButtonElement | null)?.disabled };
  });
  expect(st.hist.result).toBe('Dừng');
  expect(st.bPrevDisabled, 'sang ải mở lại sau khi dừng').toBe(false);
  // bảng Tỷ Võ tự mở lại (tyvoStop mở quà tab tyvo) → có dòng lịch sử
  await expect(page.locator('.tyvo-panel')).toBeVisible();
  await expect(page.locator('.tyvo-history')).toBeVisible();
  assertNoErrors();
});

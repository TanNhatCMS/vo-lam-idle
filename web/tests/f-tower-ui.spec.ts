/* Test F — Tháp I/II theo nguồn v107 (2.6.12):
 - thẻ Tháp: mô tả, luật tuần (2/3 luật), lượt tuần 0/1000, nút Vào/Reset/Điểm nâng cao
 - vào Tháp I: R.tower={id:1, floor:best+1}, lượt tuần +1, quái towerId=1 cấp 10+4×tầng,
   spd ×1.3, stall progress được tạo khi spawn
 - Tháp II: khóa dưới TS5; vào từ TS5: quái cấp 200, towerId=2, spd ×1.625
 - reset Tháp II: tốn 300 Phúc Duyên, xóa kỷ lục + tiến độ + lượt tuần
 Mọi pageerror + console.error đều fail test. */
import { test, expect, Page } from '@playwright/test';

/* Chat the gioi: mock toan bo /api/chat/* (giữ nguyên như regression.spec.ts). */
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

async function createCharacter(page: Page, name = 'TestThap') {
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

/* Lên cấp (và/hoặc chuyển sinh) rồi reload — đủ điều kiện vào tháp */
async function setLevel(page: Page, lvl = 30, reborn = 0) {
  await page.evaluate(([l, rb]) => {
    const g = (window as any).__G;
    g.S.lvl = l; g.S.xp = 0;
    if (rb) g.RW().stat.reborn = rb;
    g.save();
  }, [lvl, reborn]);
  await page.reload();
  await expect(page.locator('#qBar .qb')).toHaveCount(19);
}

/* Mở thẻ Tháp bằng nút nhanh Tháp I trên thanh Giang hồ */
async function openTowerTab(page: Page) {
  await page.locator('#qBar .qb[data-q="0"]').click();
  const modal = page.locator('#modal:not(.hidden)');
  await expect(modal).toBeVisible();
  await expect(page.locator('#giftTabs button[data-g="tower"]')).toHaveClass(/on/);
}

test('thẻ Tháp: UI theo nguồn — luật tuần, lượt tuần, nút vào/reset', async ({ page }) => {
  await createCharacter(page);
  await setLevel(page, 30);
  await openTowerTab(page);
  const body = page.locator('#mBody');
  // Tháp I (h3[0] = tiêu đề modal "Phần thưởng")
  await expect(body.locator('h3').nth(1)).toContainText('Tháp I');
  await expect(body).toContainText('Quái cấp 10 + 4 × tầng, di chuyển nhanh hơn 30%');
  await expect(body).toContainText('có riêng 1.000 lượt vào mỗi tuần');
  await expect(body).toContainText('Mỗi 45 giây, tổng máu quái cần giảm hơn 1%');
  await expect(body).toContainText('Luật tuần này:');
  await expect(body).toContainText('lượt tuần này: 0/1.000');
  await expect(page.locator('#gTower')).toContainText('Vào Tháp I (tầng 1)');
  // Tháp II: khóa dưới TS5 (h3: [0]Phần thưởng [1]Tháp I [2]Tháp II [3]Điểm nâng cao)
  const h3s = body.locator('h3');
  expect(await h3s.count()).toBe(4);
  await expect(h3s.nth(2)).toContainText('Tháp II');
  await expect(h3s.nth(3)).toContainText('Điểm nâng cao');
  await expect(body).toContainText('Cần hoàn tất TS5');
  // reset tốn 300 Phúc Duyên — nhân vật mới không đủ → disabled
  await expect(page.locator('#gTower2Reset')).toBeDisabled();
  // Điểm nâng cao: chưa có điểm (TS6–TS10) → không có nút Phân bổ
  await expect(page.locator('#mBody #gTp2')).toHaveCount(0);
  assertNoErrors();
});

test('vào Tháp I: tower={id:1,floor:best+1}, lượt tuần +1, quái towerId=1 spd ×1.3', async ({ page }) => {
  await createCharacter(page);
  await setLevel(page, 30);
  await openTowerTab(page);
  await page.locator('#gTower').click();
  // modal đóng, trong tháp — floor = best+1 = 1
  await expect.poll(() => page.evaluate(() => {
    const g = (window as any).__G;
    return g.R.tower ? { id: g.R.tower.id, floor: g.R.tower.floor } : null;
  })).toEqual({ id: 1, floor: 1 });
  // lượt tuần +1
  const st = await page.evaluate(() => {
    const g = (window as any).__G;
    return { tw: g.S.rw.tw, tw2: g.S.rw.tw2, best: g.RW().stat.towerBest };
  });
  expect(st.tw.n).toBe(1);
  expect(st.tw2.n).toBe(0);   // render thẻ đã tạo tw2 (chưa vào Tháp II → 0 lượt)
  expect(st.best).toBe(0);
  // đợt quái spawn sau ~0.5s: towerId=1, cấp 14 (10+4×1), spd ×1.3, stall progress
  await expect.poll(() => page.evaluate(() => (window as any).__G.R.enemies.length), { timeout: 8000 }).toBeGreaterThan(0);
  const q = await page.evaluate(() => {
    const g = (window as any).__G;
    const e = g.R.enemies[0];
    const m = g.MON[e.tid];
    const base = (30 + (m.run || 6) * 4) * (e.cls === 'boss' ? 0.7 : 1);
    return {
      towerId: e.towerId, towerFloor: e.towerFloor, L: e.L,
      spdOk: Math.abs(e.spd - base * 1.3) < 0.01,
      progress: g.R.tower.progress ? {
        floor: g.R.tower.progress.floor,
        hasHp: typeof g.R.tower.progress.hp === 'number',
        hasMax: typeof g.R.tower.progress.max === 'number',
      } : null,
    };
  });
  expect(q.towerId).toBe(1);
  expect(q.towerFloor).toBe(1);
  expect(q.L).toBe(14);
  expect(q.spdOk).toBe(true);
  expect(q.progress).toEqual({ floor: 1, hasHp: true, hasMax: true });
  assertNoErrors();
});

test('Tháp II: khóa dưới TS5, vào từ TS5 — quái cấp 200, towerId=2, spd ×1.625', async ({ page }) => {
  await createCharacter(page);
  await setLevel(page, 200, 5);   // TS5 mở Tháp II
  await openTowerTab(page);
  // nút Vào Tháp II (tầng 1)
  await expect(page.locator('#gTower2')).toContainText('Vào Tháp II (tầng 1)');
  await page.locator('#gTower2').click();
  await expect.poll(() => page.evaluate(() => {
    const g = (window as any).__G;
    return g.R.tower ? { id: g.R.tower.id, floor: g.R.tower.floor } : null;
  })).toEqual({ id: 2, floor: 1 });
  const st = await page.evaluate(() => {
    const g = (window as any).__G;
    return { tw2: g.S.rw.tw2, cont: g.RW().tower2Floor };
  });
  expect(st.tw2.n).toBe(1);
  expect(st.cont).toBe(1);   // con trỏ tiếp tục = 1
  await expect.poll(() => page.evaluate(() => (window as any).__G.R.enemies.length), { timeout: 8000 }).toBeGreaterThan(0);
  const q = await page.evaluate(() => {
    const g = (window as any).__G;
    const e = g.R.enemies[0];
    const m = g.MON[e.tid];
    const base = (30 + (m.run || 6) * 4) * (e.cls === 'boss' ? 0.7 : 1);
    return { towerId: e.towerId, L: e.L, spdOk: Math.abs(e.spd - base * 1.625) < 0.01 };
  });
  expect(q.towerId).toBe(2);
  expect(q.L).toBe(200);   // tầng 1 = cấp 200 (baseLevel)
  expect(q.spdOk).toBe(true);
  assertNoErrors();
});

test('reset Tháp II: 300 Phúc Duyên, xóa kỷ lục + tiến độ + lượt tuần', async ({ page }) => {
  await createCharacter(page);
  await setLevel(page, 200, 5);
  // cho 500 Phúc Duyên + kỷ lục giả + lượt tuần giả
  await page.evaluate(() => {
    const g = (window as any).__G;
    const r = g.RW();
    r.fd = 500; r.stat.tower2Best = 120; r.tower2Floor = 121;
    r.tw2 = { week: 'cuối', n: 999 };
    g.save();
  });
  await page.reload();
  await openTowerTab(page);
  await expect(page.locator('#gTower2Reset')).toBeEnabled();
  await page.locator('#gTower2Reset').click();
  const confirm = page.locator('#modal:not(.hidden)');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Reset Tháp II?');
  await expect(confirm).toContainText('Lượt tuần: 0/1.000 · Kỷ lục: tầng 0 · Tiến độ: tầng 1');
  await page.locator('#gTower2ResetConfirm').click();
  // modal đóng, state đã reset
  const st = await page.evaluate(() => {
    const g = (window as any).__G;
    const r = g.RW();
    return { fd: r.fd, best: r.stat.tower2Best, floor: r.tower2Floor, tw2: r.tw2 };
  });
  expect(st.fd).toBe(200);
  expect(st.best).toBe(0);
  expect(st.floor).toBe(1);
  expect(st.tw2.n).toBe(0);
  assertNoErrors();
});

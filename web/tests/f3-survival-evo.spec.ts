/* Test E2E F3 — Tien hoa Sinh ton (port tu survival.js goc: SV_EVOLUTIONS, svEvo*,
   svChooseEvolution, svTimeGems, svSave ghem S.sv.evo).
   Bat cac lop loi port:
   - thieu import (uiSfx/addText/irnd...) -> chon bien the / nhặt ngọc thoi gian crash giua chừng
   - svChoose khong hook svChooseEvolution -> chieu 5 sao khong mo modal bien the
   - SV.evo khong ghem S.sv.evo -> reload mat bien thể
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
async function createCharacter(page: Page, name = 'TestEvo') {
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

/* Vao Luyện Công (nut nhanh 11 -> modal gioi thieu -> "Vào Luyện Công"). */
async function enterSurvival(page: Page) {
  await page.locator('#qBar .qb[data-q="11"]').click();
  const intro = page.locator('#modal:not(.hidden)');
  await expect(intro).toContainText('Luyện Công');
  await page.locator('#svGoIn').click();
  await expect(page.locator('#svBar')).toBeVisible();      // thanh chieu hien trong panel sinh ton
}

/* Modal bien the dang mo? */
async function evoModalOpen(page: Page) {
  const m = page.locator('#modal:not(.hidden)');
  if (!(await m.isVisible().catch(() => false))) return false;
  const txt = (await page.locator('#mBody').textContent().catch(() => '')) || '';
  return txt.includes('Khai mở biến thể');
}

/* Len cap tu luyện ép (SV.xp = SV.need) cho đến khi mot chieu dat 5 sao
   -> modal "Khai mở biến thể" hien ra. Moi lần chọn: uu tien chieu chính,
   khac thi chon option đầu (pool nho o cấp 1 nên chieu chính hay duoc gap). */
async function levelUntilEvolution(page: Page, skillId: string, skillName: string) {
  for (let i = 0; i < 40; i++) {
    if (await evoModalOpen(page)) return true;              // len cap tu nhien da mo bien the
    await page.evaluate(() => { const SV = (window as any).__G.SV; SV.xp = SV.need; });
    await expect(page.locator('#modal:not(.hidden)')).toContainText('Lên cấp tu luyện');
    const mine = page.locator('.svopt', { has: page.locator('b', { hasText: skillName }) });
    if (await mine.count()) await mine.first().click();
    else await page.locator('.svopt').first().click();
    if (await evoModalOpen(page)) return true;              // chieu chinh dat 5 sao -> mo bien the
  }
  return false;
}

test('tien hoa sinh ton: chieu 5 sao mo UI chon bien the, thanh chieu co marker ✦', async ({ page }) => {
  await createCharacter(page);
  await enterSurvival(page);
  // SV duoc mo tren window.__G (svExpose o svStart) de test dieu khien luot choi
  const st = await page.evaluate(() => {
    const SV = (window as any).__G.SV;
    return { on: SV.on, picks: SV.picks, timeGems: Array.isArray(SV.timeGems), evo: SV.evo };
  });
  expect(st.on, 'phải đang trong Luyện Công').toBe(true);
  expect(st.timeGems, 'state ngọc thời gian phải có').toBe(true);
  const skillId = Object.keys(st.picks)[0];               // chieu chinh cua phai (mo dau)
  expect(skillId).toBeTruthy();
  const skillName = await page.evaluate((id) => (window as any).__G.SV.info[id].n, skillId);
  expect(skillName).toBeTruthy();

  // dat chieu chinh 4 sao roi ep len cap -> chon no -> 5 sao -> modal bien the
  await page.evaluate((id) => { (window as any).__G.SV.picks[id] = 4; }, skillId);
  const opened = await levelUntilEvolution(page, skillId, skillName);
  expect(opened, 'chieu dat 5 sao phải mo modal "Khai mở biến thể"').toBe(true);

  // UI bien the: 2 lua chon (moi loai chiêu co 2 bien the trong SV_EVOLUTIONS)
  const cards = page.locator('#modal:not(.hidden) .svopt');
  expect(await cards.count(), 'phải co 2 bien the để chon').toBe(2);
  await expect(page.locator('#mBody')).toContainText('BIẾN THỂ');
  await expect(page.locator('#mBody')).toContainText('không tốn thêm cấp');
  assertNoErrors();
});

test('tien hoa sinh ton: chon bien the luu vao save S.sv.evo, marker ✦ tren thanh chieu', async ({ page }) => {
  await createCharacter(page);
  await enterSurvival(page);
  const skillId = await page.evaluate(() => Object.keys((window as any).__G.SV.picks)[0]);
  const skillName = await page.evaluate((id) => (window as any).__G.SV.info[id].n, skillId);
  await page.evaluate((id) => { (window as any).__G.SV.picks[id] = 4; }, skillId);
  const opened = await levelUntilEvolution(page, skillId, skillName);
  expect(opened).toBe(true);

  // chon bien the dau tien
  await page.locator('#modal:not(.hidden) .svopt').first().click();
  await expect(page.locator('#modal')).toHaveClass(/hidden/);   // modal dong sau khi chon

  // bien the luu vao SV.evo + ghem S.sv.evo; thanh chieu hien marker ✦
  const after = await page.evaluate(() => {
    const G = (window as any).__G;
    return { evo: G.SV.evo, saved: G.S.sv && G.S.sv.evo, marks: document.querySelectorAll('#svBar .svcell-evo').length };
  });
  expect(Object.keys(after.evo), 'SV.evo phải có 1 bien thể').toHaveLength(1);
  expect(after.evo[skillId]).toBeTruthy();
  expect(after.saved, 'bien thể phải duoc ghem S.sv.evo').toEqual(after.evo);
  expect(after.marks, 'thanh chieu phải hien marker ✦ ben chiêu da bien thể').toBeGreaterThan(0);

  // modal tam dung: bang hieu suất chiêu co thẻ ✦ (sv-evo-tag) canh ten chiêu
  await page.keyboard.press('p');
  await expect(page.locator('#modal:not(.hidden)')).toContainText('Tạm dừng');
  expect(await page.locator('#modal:not(.hidden) .sv-evo-tag').count(), 'bang hệu suất phải có thẻ ✦').toBeGreaterThan(0);
  await page.locator('#modal:not(.hidden) #svQuit').click();   // Rút lui (nhận thưởng)
  await expect(page.locator('#modal:not(.hidden)')).toContainText('Trọng thương');
  await page.locator('#svOk').click();                         // Về giang hồ -> svExit -> save()
  assertNoErrors();
});

test('tien hoa sinh ton: bien the persist qua reload (S.sv.evo trong save)', async ({ page }) => {
  await createCharacter(page);
  await enterSurvival(page);
  const skillId = await page.evaluate(() => Object.keys((window as any).__G.SV.picks)[0]);
  const skillName = await page.evaluate((id) => (window as any).__G.SV.info[id].n, skillId);
  await page.evaluate((id) => { (window as any).__G.SV.picks[id] = 4; }, skillId);
  const opened = await levelUntilEvolution(page, skillId, skillName);
  expect(opened).toBe(true);
  await page.locator('#modal:not(.hidden) .svopt').first().click();
  const evoBefore = await page.evaluate(() => JSON.stringify((window as any).__G.S.sv.evo));

  // rut lui nhan thuong -> luu save, roi reload
  await page.keyboard.press('p');
  await page.locator('#modal:not(.hidden) #svQuit').click();
  await page.locator('#svOk').click();
  await page.reload();
  await expect(page.locator('#qBar .qb')).toHaveCount(13);     // nhan van duoc nap tu save
  const evoAfter = await page.evaluate(() => {
    const S = (window as any).__G.S;
    return S.sv ? JSON.stringify(S.sv.evo) : null;
  });
  expect(evoAfter, 'bien thể phải con trong save sau reload').toBe(evoBefore);
  expect((evoAfter ? JSON.parse(evoAfter) : {})[skillId]).toBeTruthy();
  assertNoErrors();
});

test('tien hoa sinh ton: ngọc thời gian nhặt được cộng giây (svTimeGems)', async ({ page }) => {
  await createCharacter(page);
  await enterSurvival(page);
  // Dat mot ngọc thoi gian "vua sinh" (giống svSpawnTimeGem) ngay anh hùng
  // -> khung svTick tiep theo chay svTimeGems va thu gom.
  const placed = await page.evaluate(() => {
    const SV = (window as any).__G.SV, H = (window as any).__G.H;
    SV.timeGems.push({ x: H.x, y: H.y, life: 45 });
    return SV.timeGems.length;
  });
  expect(placed).toBe(1);
  await page.waitForTimeout(300);                               // vài khung svTick
  const after = await page.evaluate(() => {
    const SV = (window as any).__G.SV;
    return { bonus: SV.timeBonus, left: SV.timeGems.length };
  });
  expect(after.bonus, 'nhặt ngọc thoi gian phải cộng 5-10 giây (SV.timeBonus)').toBeGreaterThanOrEqual(5);
  expect(after.bonus).toBeLessThanOrEqual(10);
  expect(after.left, 'ngọc da nhặt phải biến khỏi SV.timeGems').toBe(0);
  assertNoErrors();
});

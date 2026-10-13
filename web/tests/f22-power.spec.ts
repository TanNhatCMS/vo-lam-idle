/* Test F22 — DPS chiêu / lực chiến theo nguồn v107 (2.6.13):
 - aspd tách 2 đường: aspdPhys (1 + attackspeed, Thiên Vương +15%) / aspdSpell (0.9 + castspeed)
 - rate chiêu: vật lý → aspdPhys, phép → aspdSpell
 - purePhysical xét attr THÔ của chiêu (nguồn check t.attr) — vũ khí add nguyên tố KHÔNG làm mất
 - melee chiêu: không cấu hình đạn VÀ (radius<=120 HOẶC form>=8); 111 đạn radial 4 / radius 384
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

async function createCharacter(page: Page, name = 'TestPw') {
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

/* Vũ khí cận chiến (nhóm 0) gắn thêm addfiredamage_v (attr 122) +10 */
const WEAPON_FIRE = {
  d: 0, k: 0, n: 'Kiếm lửa', lvl: 1, s: 0, price: 100,
  base: [[28, 4, 4], [29, 7, 7], [31, 20, 20]],
  mag: [{ a: 122, p: [10, 0, 0] }],
  req: [[36, 0], [32, 0], [33, 0]],
};

test('aspd tách 2 đường — Thiên Vương +15%, phép 0.9 + castspeed', async ({ page }) => {
  await createCharacter(page);
  const r = await page.evaluate(() => {
    const g = (window as any).__G;
    g.S.fac = 'tianwang'; g.recalc();
    const tw = { phys: g.R.P.aspdPhys, spell: g.R.P.aspdSpell, aspd: g.R.P.aspd };
    g.S.fac = 'shaolin'; g.recalc();
    const sl = { phys: g.R.P.aspdPhys, spell: g.R.P.aspdSpell };
    return { tw, sl };
  });
  expect(r.tw.phys).toBeCloseTo(1.15, 5);   // 1 + 0 attackspeed + 0.15 Thiên Vương
  expect(r.tw.spell).toBeCloseTo(0.9, 5);   // 0.9 + 0 castspeed
  expect(r.tw.aspd).toBeCloseTo(1.15, 5);   // aspd = aspdPhys
  expect(r.sl.phys).toBeCloseTo(1, 5);
  expect(r.sl.spell).toBeCloseTo(0.9, 5);
  assertNoErrors();
});

test('rate chiêu: vật lý → aspdPhys, phép → aspdSpell', async ({ page }) => {
  await createCharacter(page);
  const r = await page.evaluate(() => {
    const g = (window as any).__G;
    g.S.sk = { 14: 1 }; g.S.mainLock = 14; g.recalc();   // Hàng Long Bất Vũ: phys
    const phys = { rate: g.R.P.main.rate, aspdPhys: g.R.P.aspdPhys, useAR: g.R.P.main.useAR };
    g.S.sk = { 20: 1 }; g.S.mainLock = 20; g.recalc();   // Sư Tử Hống: phép
    const spell = { rate: g.R.P.main.rate, aspdSpell: g.R.P.aspdSpell, useAR: g.R.P.main.useAR };
    return { phys, spell };
  });
  expect(r.phys.useAR).toBeTruthy();
  expect(r.phys.rate).toBeCloseTo(r.phys.aspdPhys, 5);
  expect(r.spell.useAR).toBeFalsy();
  expect(r.spell.rate).toBeCloseTo(r.spell.aspdSpell, 5);
  assertNoErrors();
});

test('purePhysical: vũ khí add nguyên tố không làm mất (nguồn xét attr chiêu)', async ({ page }) => {
  await createCharacter(page);
  const r = await page.evaluate(WEAPON_FIRE_STR => {
    const g = (window as any).__G;
    const W = JSON.parse(WEAPON_FIRE_STR);
    g.S.sk = { 10: 1 }; g.S.mainLock = 10; g.recalc();   // Kim Cang Phục Ma: phys, attr không nguyên tố
    const bare = g.R.P.main.purePhysical;
    g.S.eq.weapon = W; g.recalc();
    return {
      bare,
      withFire: g.R.P.main.purePhysical,
      fireInParts: g.R.P.main.parts.fire,
      physInParts: g.R.P.main.parts.phys > 0,
    };
  }, JSON.stringify(WEAPON_FIRE));
  expect(r.physInParts).toBe(true);
  expect(r.fireInParts).toBeGreaterThan(0);   // vũ khí có cộng lửa vào parts…
  expect(r.bare).toBe(true);
  expect(r.withFire).toBe(true);              // …nhưng attr chiêu không nguyên tố → vẫn thuần vật lý
  assertNoErrors();
});

test('melee chiêu: form>=8 là đơn chiến (melee); 111 đạn radial 4 radius 384', async ({ page }) => {
  await createCharacter(page);
  const r = await page.evaluate(() => {
    const g = (window as any).__G;
    g.S.sk = { 10: 1 }; g.S.mainLock = 10; g.recalc();   // Kim Cang Phục Ma: form 8, radius 90
    const a10 = { melee: g.R.P.main.melee, rad: g.R.P.main.rad, around: g.R.P.main.around, radial: g.R.P.main.radial };
    g.S.sk = { 111: 1 }; g.S.mainLock = 111; g.recalc(); // Bích Hải Triều Sinh: đạn radial
    const a111 = { melee: g.R.P.main.melee, rad: g.R.P.main.rad, around: g.R.P.main.around, radial: g.R.P.main.radial };
    return { a10, a111 };
  });
  expect(r.a10.melee).toBe(true);      // form 8 = đơn chiến → melee (nguồn g = !d && (f<=120 || h>=8))
  expect(r.a10.rad).toBe(54);          // attr skill_attackradius (54) override radius 90 của data
  expect(r.a10.around).toBe(false);
  expect(r.a10.radial).toBe(0);
  expect(r.a111.melee).toBe(false);     // có cấu hình đạn riêng → không melee
  expect(r.a111.rad).toBe(384);
  expect(r.a111.around).toBe(false);    // có cấu hình đạn → around=false, nhưng radial=4 vẫn multi-hit vòng
  expect(r.a111.radial).toBe(4);
  assertNoErrors();
});

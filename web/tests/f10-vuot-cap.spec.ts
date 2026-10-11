/* Test E2E G1 (port upstream 2026-10-11):
   1. Vượt cấp quái: thách Bố Y (chal=white) giới hạn quái ở cấp
      nhân vật +50; bấm công tắc Vượt cấp -> quái theo ải.
   2. Cân bằng v91: Sức mạnh gop x2 vào Chính xác (P.ar) cho
      vũ khí cận chiến (không có vũ khí tầm xa d===1). */
import { test, expect, Page } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
});

const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

async function createCharacter(page: Page, name = 'OverLv') {
  await page.goto('/');
  await expect(page.locator('#pfName')).toBeVisible();
  await page.fill('#pfName', name);
  await page.locator('.facpick button').first().click();
  await expect(page.locator('#bNotice')).toBeVisible();
  await page.locator('#bNotice').click();
  const skip = page.locator('#tSkip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  await expect(page.locator('#qBar .qb')).toHaveCount(14);
}

test('vượt cấp quái: Bố Y giới hạn cap+50, công tắc bật -> theo ải', async ({ page }) => {
  await createCharacter(page);
  // về tab Giang hồ, đặt thách Bố Y + lên ải 60 (quái cấp ~60) ở cấp 5
  await page.locator('#tabs [data-t="log"]').click();
  await page.evaluate(() => {
    const g = (window as any).__G;
    g.S.chal = 'white'; g.S.lvl = 5; g.S.maxStage = 60; g.S.stage = 60; g.S.wave = 1;
    g.S.attrPts = 5;
  });
  // render lai stagectl (chuyen tab)
  await page.locator('#tabs [data-t="char"]').click();
  await page.locator('#tabs [data-t="log"]').click();
  // quái cấp = min(stageLevel(60)≈60, lvl+50=55) = 55
  await expect(page.locator('.stagectl .dim')).toContainText('Quái cấp 55');
  // co công tắc Vượt cấp (chi thách Bố Y)
  const sw = page.locator('#bWhiteOverlevel');
  await expect(sw).toBeVisible();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  // bấm -> bật, quái cấp theo ải
  await sw.click();
  const S = await page.evaluate(() => (window as any).__G.S);
  expect(S.whiteOverlevel).toBe(true);
  await expect(page.locator('.stagectl .dim')).toContainText('Quái cấp 60');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  assertNoErrors();
});

test('cân bằng v91: +1 Sức mạnh -> +2 cơ sở Chính xác (P.ar)', async ({ page }) => {
  await createCharacter(page);
  // +1 Sức mạnh rồi recalc qua hook __G (deterministic, không qua UI)
  const before = await page.evaluate(() => {
    const g = (window as any).__G;
    return { ar: g.R.P.ar, str: g.R.P.str, dex: g.R.P.dex };
  });
  const after = await page.evaluate(() => {
    const g = (window as any).__G;
    g.S.attr.str += 1;
    g.recalc();
    return { ar: g.R.P.ar, str: g.R.P.str, dex: g.R.P.dex };
  });
  expect(after.str).toBe(before.str + 1);
  // ar = (dex*4 + str*2 - 28) * he so (bonus % có thể != 1) -> so theo ty le
  const base0 = before.dex * 4 + before.str * 2 - 28;
  const base1 = after.dex * 4 + after.str * 2 - 28;
  const ratio = base1 / base0;
  expect(after.ar).toBeCloseTo(before.ar * ratio, 5);
  // Sức mạnh gop x2 (cận chiến): +1 str -> +2 co sở
  expect(base1 - base0).toBe(2);
  assertNoErrors();
});

/* Test E2E đợt 14 — F1 Tuyệt chiêu boss + F2 Lá chắn nội lực (combat.ts / stats.ts).
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
async function createCharacter(page: Page, name = 'TestChiêu') {
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

/* Lấy 1 id quái hợp lệ + data quái từ bảng jdata (tránh MON[tid] undefined khi engine kêu sfx). */
async function fetchMon(page: Page) {
  return page.evaluate(async () => {
    const j = await (await fetch('/jdata/jw.json')).json();
    const tid = Object.keys(j.mon)[0];
    return { tid, m: j.mon[tid] };
  });
}

test('F1 Tuyệt chiêu boss: boss cap 40+ gan nhan vat ra đòn "Tuyệt chiêu!"', async ({ page }) => {
  await createCharacter(page);
  await page.waitForTimeout(1000);   // cho vào game, chiến đấu tự động đã chạy
  const { tid, m } = await fetchMon(page);
  // chen 1 boss "giả" cấp 50 (>= BOSS_ULT_FROM = 40) đúng chỗ nhan vật, máu không thể hạ,
  // không đánh thường (atkCd 999) → chỉ có thể gây sát thương qua Tuyệt chiêu
  await page.evaluate(({ tid, m }) => {
    const g = (window as any).__G;
    g.R.life = g.R.P.life;
    g.R.deadT = 0;   // hero đang sống: tick mới chạy enemyAI (boss ult)
    g.R.enemies.push({
      id: Math.random(), tid, n: m.n, img: null, sz: m.sz, L: 50, cls: 'boss', series: 0,
      res: { phys: 0, poison: 0, cold: 0, fire: 0, light: 0 },
      hp: 1e9, max: 1e9, dmg: 1, ar: 1, def: 0,
      x: g.H.x, y: g.H.y, r: 30, spd: 0, atkCd: 999, cd: 999,
      ranged: false, stun: 0, poison: 0, poisonDmg: 0, hitT: 0, face: 1, animKey: 'x',
    });
  }, { tid, m });
  // boss ult phát sau ~2.4s (BOSS_ULT_EVERY * 0.4) rồi mỗi 6s — text nổi trên đầu nhan vật
  await page.waitForFunction(
    () => (window as any).__G.R.txt.some(t => t.t === 'Tuyệt chiêu!'),
    null, { timeout: 10000, polling: 50 },
  );
  assertNoErrors();
});

test('F2 Lá chắn nội lực: manashield_p từ đồ vào chỉ số + hút sát thương khi đánh nhau', async ({ page }) => {
  await createCharacter(page);
  await page.waitForTimeout(1000);
  // id thuộc tính manashield_p trong bảng attr (J.attr) — không hardcode, đọc từ jdata
  const attrId = await page.evaluate(async () => {
    const j = await (await fetch('/jdata/jx.json')).json();
    return j.attr.indexOf('manashield_p');
  });
  expect(attrId, 'bảng dữ liệu phải có thuộc tính manashield_p').toBeGreaterThanOrEqual(0);
  // mặc định: không có lá chắn nội lực
  expect(await page.evaluate(() => (window as any).__G.R.P.manaShield)).toBe(0);
  // cho áo giáp có dòng thần manashield_p 90% (Tọa Vọng Vô Ngã) rồi bẩn lại để recalc
  await page.evaluate((id) => {
    const g = (window as any).__G;
    g.S.eq.armor = { n: 'Test Áo Nội Lực', d: 3, r: 1, base: [], mag: [{ a: id, p: [90, 0, 0] }], enh: 0, plv: 0 };
    g.R.dirty = true;
  }, attrId);
  await page.waitForFunction(() => (window as any).__G.R.P.manaShield === 90, null, { timeout: 5000 });
  // chiến đấu tự động: quái đánh vào nhan vật → absorbDamageWithMana hút vào nội lực, text xanh "-X NL"
  await page.waitForFunction(
    () => (window as any).__G.R.txt.some(t => typeof t.t === 'string' && / NL$/.test(t.t)),
    null, { timeout: 20000, polling: 50 },
  );
  const mana = await page.evaluate(() => ({ mana: (window as any).__G.R.mana, max: (window as any).__G.R.P.mana }));
  expect(mana.mana).toBeLessThanOrEqual(mana.max);   // nội lực bị hao do hút sát thương (không vượt tối đa)
  assertNoErrors();
});

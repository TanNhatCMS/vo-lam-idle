/* Test F5 — bo do Thap II (tower2SetTier / tower2SetReward / tower2DropChance / rollSetDrop hook).
   Verify:
   - tower2SetReward tra bo dung bac theo tang: tang >= 50 co the ra Thien Cuc (cap 200, grp 10000+),
     tang < 50 chi ra bo vang req 180 (Dang Long); roll cao hoac nguon khong ro -> null.
   - Drop chance hook vao thuong Thap II: rollSetDrop tren quai co towerId=2 (trong Thap II)
     noi vao tower2SetReward -> ra bo Thien Cuc; tower2DropChance nhan he so 0.2 trong Thap II,
     x1 ben ngoai.
   Dinh vi bang Math.random stub (0 = roll thap nhat -> luon trung bac cao nhat co the).
   Test doc lap, tu tao save moi (context test = localStorage trong). */
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

/* Tao nhan vat moi (cung pattern regression.spec.ts). */
async function createCharacter(page: Page, name = 'TestThap2') {
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

/* Stub Math.random (luu goc de khoi phuc) — dinh xac cac roll trong tower2SetTier. */
const stubRandom = (page: Page, v: number) =>
  page.evaluate(x => { (window as any).__rand0 = Math.random; Math.random = () => x; }, v);
const restoreRandom = (page: Page) =>
  page.evaluate(() => { if ((window as any).__rand0) Math.random = (window as any).__rand0; });

test('tower2SetReward: bo dung bac theo tang (200 tu tang 50, 180 duoi 50)', async ({ page }) => {
  await createCharacter(page);
  await expect(page.evaluate(() => !!(window as any).__T2)).toBeTruthy();   // hook debug cua sets.ts
  await stubRandom(page, 0);                                               // roll = 0 -> trung bac cao nhat
  try {
    // tang 200 (>= 50), nguon boss -> bac 200: bo Thien Cuc (Dang Long doi ten, grp 10000+)
    const hi = await page.evaluate(() => (window as any).__T2.tower2SetReward(200, 'boss'));
    expect(hi, 'tang 200 roll thap phai ra bo').toBeTruthy();
    expect(hi.set.kind).toBe('gold');
    expect(hi.set.grp).toBeGreaterThanOrEqual(10000);
    expect(hi.n.startsWith('Thiên Cực')).toBe(true);
    // nguon milestone (cung duong towerCleared goi) cung cho bac 200 tu tang 50
    const ms = await page.evaluate(() => (window as any).__T2.tower2SetReward(200, 'milestone'));
    expect(ms).toBeTruthy();
    expect(ms.n.startsWith('Thiên Cực')).toBe(true);
    // tang 10 (< 50) -> chi bac 180: bo vang req 180 (Dang Long), khong phai Thien Cuc
    const lo = await page.evaluate(() => (window as any).__T2.tower2SetReward(10, 'boss'));
    expect(lo, 'tang < 50 van ra bo cap 180').toBeTruthy();
    expect(lo.set.grp).toBeLessThan(10000);
    expect(lo.n.startsWith('Thiên Cực')).toBe(false);
    expect(lo.req.find(([id]) => id === 36)[1]).toBe(180);
    // roll cao (0.999) vuot ca p200 + p180 -> khong trung bac nao -> null
    await stubRandom(page, 0.999);
    expect(await page.evaluate(() => (window as any).__T2.tower2SetReward(200, 'boss'))).toBeNull();
    // nguon khong co trong bang rate -> null
    await stubRandom(page, 0);
    expect(await page.evaluate(() => (window as any).__T2.tower2SetReward(100, 'unknown'))).toBeNull();
    // tower2SetTier: tra 200/180/0 theo tang + nguon
    expect(await page.evaluate(() => (window as any).__T2.tower2SetTier(200, 'boss'))).toBe(200);
    expect(await page.evaluate(() => (window as any).__T2.tower2SetTier(10, 'boss'))).toBe(180);
    await stubRandom(page, 0.999);
    expect(await page.evaluate(() => (window as any).__T2.tower2SetTier(200, 'boss'))).toBe(0);
  } finally { await restoreRandom(page); }
  assertNoErrors();
});

test('drop chance hook: quai Tháp II (towerId=2) roi bo qua rollSetDrop', async ({ page }) => {
  await createCharacter(page);
  await stubRandom(page, 0);                                               // roll = 0 -> trung bac cao nhat
  try {
    // dang trong Thap II (R.tower.id = 2): ha trung thuong co towerId=2 -> rollSetDrop
    // noi vao tower2SetReward -> ra bo Thien Cuc cap 200 (tang 100 >= 50)
    await page.evaluate(() => { (window as any).__G.R.tower = { id: 2, floor: 100 }; });
    const drop = await page.evaluate(() =>
      (window as any).__T2.rollSetDrop({ towerId: 2, towerFloor: 100, cls: 'boss' }));
    expect(drop, 'ha trung Tháp II phai roi bo qua tower2SetReward').toBeTruthy();
    expect(drop.n.startsWith('Thiên Cực')).toBe(true);
    expect(drop.set.grp).toBeGreaterThanOrEqual(10000);
    // tower2DropChance: he so 0.2 khi dang trong Thap II, x1 khi ngoai thap
    expect(await page.evaluate(() => (window as any).__T2.tower2DropChance(1, { towerId: 2 }))).toBeCloseTo(0.2);
    // ngoai Thap II (R.tower = null): quai towerId=2 khong duoc xu ly Thap II -> duong thuong
    await page.evaluate(() => { (window as any).__G.R.tower = null; });
    expect(await page.evaluate(() => (window as any).__T2.tower2DropChance(1, { towerId: 2 }))).toBe(1);
    await stubRandom(page, 0.999);                                         // roll cao -> vuot chance thuong
    expect(await page.evaluate(() =>
      (window as any).__T2.rollSetDrop({ towerId: 2, towerFloor: 100, cls: 'boss' }))).toBeNull();
    // setDropEligible: loc gioi han phai (id 39 phai thuoc FACTIONS moi duoc)
    const eligible = await page.evaluate(() => {
      const T2 = (window as any).__T2;
      const row = { req: [[36, 180], [39, 0]] };          // phai shaolin (id 0) -> hop le
      const badFaction = { req: [[36, 180], [39, 99]] };  // phai khong ton tai -> loai
      return { ok: T2.setDropEligible(row), bad: T2.setDropEligible(badFaction) };
    });
    expect(eligible.ok).toBe(true);
    expect(eligible.bad).toBe(false);
  } finally {
    await page.evaluate(() => { (window as any).__G.R.tower = null; });
    await restoreRandom(page);
  }
  assertNoErrors();
});

/* Mở Lò Huyền Tinh (nút nhanh thứ 6, thẻ Giang hồ) và chờ modal hiện. */
async function openForge(page: Page) {
  await page.locator('#qBar .qb[data-q="10"]').click();
  const modal = page.locator('#modal:not(.hidden)');
  await expect(modal, 'nút Lò rèn phải mở Lò Huyền Tinh').toBeVisible();
  await expect(page.locator('#mBody')).toContainText('Lò Huyền Tinh');
  return modal;
}

test('Thiên Cực: cap 200 (req 200, grp 10000+, affix x1.5625) + che Bạch Kim Thiên Cực', async ({ page }) => {
  await createCharacter(page);
  await expect(page.evaluate(() => !!(window as any).__T2)).toBeTruthy();
  await page.evaluate(() => {
    (window as any).__rand0 = Math.random; Math.random = () => 0;
    (window as any).__RCP.setRand(() => 0);   // rcInt: Bạch Kim luon thanh cong
  });
  try {
    // bo Thien Cuc cap 200: req 200, grp 10000+, ten Thiên Cực
    const tc = await page.evaluate(() => (window as any).__T2.tower2SetReward(200, 'boss'));
    expect(tc, 'tang 200 roll thap phai ra bo').toBeTruthy();
    expect(tc.n.startsWith('Thiên Cực')).toBe(true);
    expect(tc.req.find(([id]) => id === 36)[1]).toBe(200);
    expect(tc.set.grp).toBeGreaterThanOrEqual(10000);
    // cung gia dinh Dằng Long cap 180: cung id affix, gia tri x1.25 (nên TC = x1.5625)
    const dl = await page.evaluate(() => (window as any).__T2.tower2SetReward(10, 'boss'));
    expect(dl.n).toBe(tc.n.replace('Thiên Cực', 'Đằng Long'));
    const aTc = tc.mag.find(m => m.a === dl.mag[0].a);
    expect(aTc, 'cung bo phai co chung id affix').toBeTruthy();
    expect(aTc.p[0]).toBe(Math.round(dl.mag[0].p[0] * 1.25));
    // 2 mon Thiên Cực trong hành trang -> Lò Huyền Tinh "Chế Bạch Kim" cho phép chế
    await page.evaluate(() => {
      const g = (window as any).__G, S = g.S, T2 = (window as any).__T2;
      const a = T2.tower2SetReward(200, 'boss');
      const b = JSON.parse(JSON.stringify(a)); b.uid = S.uid++;
      S.inv.push(a, b);
      S.gold = 1000000;
      S.mats.misc.wc = 5; S.mats.misc.mys = 5;
    });
    await openForge(page);
    // pool Chế Bạch Kim co 2 nut Thiên Cực
    const poolNames = await page.locator('#pkPool [data-p]').allTextContents();
    expect(poolNames.filter(n => n.startsWith('Thiên Cực')).length).toBeGreaterThanOrEqual(2);
    await page.locator('#pkPool [data-p]').first().click();
    await page.locator('#pkPool [data-p]').nth(1).click();
    await expect(page.locator('#pkMake')).toBeEnabled();
    await page.locator('#pkMake').click();
    // thanh cong (random = 0): hành trang có Bạch Kim Thiên Cực (platina, grp 10000+)
    const plat = await page.evaluate(() => {
      const S = (window as any).__G.S;
      return S.inv.filter(i => i && i.set && i.set.kind === 'platina' && i.n.startsWith('Thiên Cực'))
        .map(i => ({ n: i.n, grp: i.set.grp, r: i.r }));
    });
    expect(plat.length).toBeGreaterThanOrEqual(1);
    expect(plat[0].grp).toBeGreaterThanOrEqual(10000);
    expect(plat[0].r).toBe(5);   // bạch kim = r:5
  } finally {
    await page.evaluate(() => {
      if ((window as any).__rand0) Math.random = (window as any).__rand0;
      if ((window as any).__RCP) (window as any).__RCP.setRand(Math.random);
    });
  }
  assertNoErrors();
});

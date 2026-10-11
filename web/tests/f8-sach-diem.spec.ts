/* Hệ thống Sách điểm (port upstream 2026-10-11): Tẩy Tỵ Kinh + Dịch Căn Kinh,
   điểm sách giữ qua chuyển sinh, bảng level theo nguồn (cap 1000, reborn 100+25n). */
import { expect, test, type Page } from '@playwright/test';

async function createCharacter(page: Page) {
  await page.goto('/');
  await expect(page.locator('#pfName')).toBeVisible();
  await page.fill('#pfName', 'ThuSách');
  await page.locator('.facpick button').first().click();
  await expect(page.locator('#bNotice')).toBeVisible();
  await page.locator('#bNotice').click();
  const skip = page.locator('#tSkip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  await expect(page.locator('#qBar .qb')).toHaveCount(14);
}

test('sach diem: the Nhan vat hien card, dung Tẩy Tỵ/Dịch Căn, diem giu qua chuyen sinh', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await test.step('tao nhan vat', async () => {
    await createCharacter(page);
  });

  await test.step('the Nhan vat hien card Sách điểm + dùng sách', async () => {
    await page.evaluate(() => {
      const S = (window as any).__G.S;
      S.lvl = 85; S.xp = 0;
      S.mats.misc.ttk = 2; S.mats.misc.vlmt = 1;
    });
    await page.locator('#tabs [data-t="char"]').click();
    await expect(page.locator('#t-char .books')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#t-char .books')).toContainText('Tẩy Tỵ Kinh');
    await expect(page.locator('#t-char .books')).toContainText('Dịch Căn Kinh');

    // dùng 1 Tẩy Tỵ Kinh ở cấp 85: +3 điểm (floor((85-80)/2)+1 = 3)
    const before = await page.evaluate(() => { const S = (window as any).__G.S; return { pts: S.attrPts, bonus: S.attrBonusEarned, useN: S.useN.ttk || 0, have: S.mats.misc.ttk }; });
    await page.locator('#t-char [data-bk="ttk"]').click();
    const after = await page.evaluate(() => { const S = (window as any).__G.S; return { pts: S.attrPts, bonus: S.attrBonusEarned, useN: S.useN.ttk || 0, have: S.mats.misc.ttk }; });
    expect(after.bonus - before.bonus, 'Tẩy Tỵ Kinh cấp 85 = +3 điểm tiềm năng').toBe(3);
    expect(after.pts - before.pts).toBe(3);
    expect(after.useN - before.useN).toBe(1);
    expect(after.have - before.have).toBe(-1);

    // dùng Dịch Căn Kinh: +1 skPts
    const skBefore = await page.evaluate(() => (window as any).__G.S.skPts);
    await page.locator('#t-char [data-bk="vlmt"]').click();
    const skAfter = await page.evaluate(() => (window as any).__G.S.skPts);
    expect(skAfter - skBefore, 'Dịch Căn Kinh = +1 điểm võ công').toBe(1);
  });

  await test.step('dùng Tẩy Tỵ ở cấp 100 = +5', async () => {
    await page.evaluate(() => { const S = (window as any).__G.S; S.lvl = 100; S.xp = 0; S.mats.misc.ttk = 1; });
    await page.locator('#tabs [data-t="char"]').click();
    await page.locator('#t-char [data-bk="ttk"]').click();
    const pts100 = await page.evaluate(() => (window as any).__G.S.attrBonusEarned);
    expect(pts100, 'cấp 100: 3 + 5 = 8 điểm sách').toBe(8);
  });

  await test.step('chuyen sinh giu diem sach (tam phap modal)', async () => {
    page.on('dialog', d => d.accept());
    await page.locator('#tabs [data-t="log"]').click();
    await page.locator('#qBar .qb').nth(0).click();
    await expect(page.locator('#giftTabs')).toBeVisible({ timeout: 8000 });
    await page.locator('#giftTabs [data-g="reborn"]').click();
    await expect(page.locator('#gReborn')).toBeVisible();
    await page.locator('#gReborn').click();
    // TS1: modal Chọn tâm pháp (locked) — chọn 1 tâm pháp để đóng
    await expect(page.locator('#mBody [data-tp]').first()).toBeVisible({ timeout: 8000 });
    await page.locator('#mBody [data-tp]').first().click();
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => { const S = (window as any).__G.S; return { lvl: S.lvl, reborn: S.rw.stat.reborn, attrPts: S.attrPts, bonus: S.attrBonusEarned, bookBonus: S.attrBookBonus, tpPend: S.rw.tpPend }; });
    expect(st.reborn).toBe(1);
    expect(st.lvl).toBeGreaterThanOrEqual(1);
    // attrPts = 50 + 8 điểm sách (nhân vật có thể lên cấp ngay sau đó: +5/cấp)
    expect(st.attrPts, 'attrPts ≥ 50 + 8 điểm sách, phần chênh là bội của 5 (lên cấp)').toBeGreaterThanOrEqual(58);
    expect((st.attrPts - 58) % 5).toBe(0);
    expect(st.bonus).toBe(8);
    expect(st.bookBonus).toBe(8);
    expect(st.tpPend, 'TS1 đã chọn tâm pháp hết').toBe(0);
  });

  await test.step('bach khoa co card Sách điểm', async () => {
    await page.locator('#tabs [data-t="log"]').click();
    await page.locator('#qBar .qb').nth(8).click();
    await expect(page.locator('#mBody')).toBeVisible({ timeout: 8000 });
    await page.locator('#mBody [data-c="mat"]').click();
    await expect(page.locator('#mBody')).toContainText('Sách điểm');
  });

  await test.step('icon sach tai duoc', async () => {
    for (const src of ['img/ep/dtbk.png', 'img/ep/mt90.webp']) {
      const res = await page.goto(src);
      expect(res && res.ok(), `icon ${src} phải tải được`).toBeTruthy();
    }
    expect(errors.join('\n'), 'không có pageerror/console error').toBe('');
  });
});

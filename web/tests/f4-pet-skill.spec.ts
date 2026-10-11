/* Test E2E F4 — kỹ năng Đồng hành theo loài (port tu rewards.js goc).
   Bắt các lớp lỗi port:
   - thiếu import (SK/skillFx/JFX) → castPetSkill chết giữa chừng (ReferenceError)
   - PET_SKILLS/petSkillRows sai → modal Đồng hành thiếu hàng kỹ năng
   - castPetSkill không dispatch theo loài → pet never cast (skillCd rỗng)
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
async function createCharacter(page: Page, name = 'TestPet') {
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

/* Cho nhân vật một Đồng hành loài tid (save có checksum nên mutate state trực tiếp
   qua __G.S — cách duy nhất không cần build save tay). */
async function adoptPet(page: Page, tid: number, lvl = 30, star = 1) {
  await page.evaluate(({ t, l, s }) => {
    const G = (window as any).__G, S = G.S;
    S.lvl = 30;                                   // Đồng hành mở khóa ở cấp 20
    S.rw = S.rw || {};
    S.rw.stat = S.rw.stat || {};
    const pet = { tid: t, lvl: l, xp: 0, eq: {}, star: s };
    S.rw.pet = pet; S.rw.pets = { [t]: pet }; S.rw.team = [t, null, null];
    S.rw.petSeen = S.rw.petSeen || {}; S.rw.petSeen[t] = 1;
    G.R.petPos = null; G.R.petSkillCd = 0;        // petTick tạo lại trạng thái tươi
  }, { t: tid, l: lvl, s: star });
}

/* Mở lại thẻ Đồng hành (showTab('pet') → renderPet → petSkillRows). */
async function openPetTab(page: Page) {
  await page.locator('#tabs button[data-t="pet"]').click();
  const petTab = page.locator('#t-pet');
  await expect(petTab).toBeVisible();
  return petTab;
}

test('ky nang pet theo loai: the Dong hanh hien hàng kỹ năng loài (chiêu 2 khóa ở cấp 1)', async ({ page }) => {
  await createCharacter(page);
  await adoptPet(page, 11, 1, 1);                 // Heo rừng: Sơn Trư Xung Kích + Chấn Địa (cấp 30)
  const petTab = await openPetTab(page);
  await expect(petTab).toContainText('Kỹ năng theo loài');
  await expect(petTab).toContainText('Sơn Trư Xung Kích');   // chiêu đầu mo san
  await expect(petTab).toContainText('Chấn Địa');            // chiêu thu hai
  await expect(petTab).toContainText('mở ở cấp 30');         // chua đj cấp → khóa
  await expect(petTab).toContainText('Khống chế');           // petRoleTags(11)
  assertNoErrors();
});

test('ky nang pet theo loai: cap 30 mo khóa chiêu 2; loài khac dùng chiêu mặc định', async ({ page }) => {
  await createCharacter(page);
  await adoptPet(page, 11, 30, 1);
  const petTab = await openPetTab(page);
  await expect(petTab).toContainText('Chấn Địa');
  expect(await petTab.locator('.petskill.lock').count(), 'đến cấp 30: không còn chiêu khóa').toBe(0);
  expect(await petTab.locator('.petskill').count(), '2 chiêu theo loài').toBe(2);
  // Loài không có trong PET_SKILLS (Dơi chúa đỏ, tid 28) → chiêu mặc định Cường Kích / Hồi Xuân
  await adoptPet(page, 28, 30, 1);
  const petTab2 = await openPetTab(page);
  await expect(petTab2).toContainText('Cường Kích');
  await expect(petTab2).toContainText('Hồi Xuân');
  await expect(petTab2).not.toContainText('Sơn Trư Xung Kích');
  assertNoErrors();
});

test('castPetSkill: pet loài Heo rừng cast chiêu theo loài trong chiến đấu', async ({ page }) => {
  await createCharacter(page);
  await adoptPet(page, 11, 1, 1);
  // Chiến đấu tự động: pet 1★ cast Sơn Trư Xung Kích (cd 8s) khi có quái trong ban kinh
  await page.waitForTimeout(5000);
  const st = await page.evaluate(() => {
    const R = (window as any).__G.R;
    return {
      hasPetPos: !!R.petPos,
      skillKeys: R.petPos && R.petPos.skillCd ? Object.keys(R.petPos.skillCd) : [],
      petSkillCd: R.petSkillCd || 0,
    };
  });
  expect(st.hasPetPos, 'pet phải ra trận (R.petPos)').toBe(true);
  expect(st.skillKeys, 'phải cast chiêu loài (boarCharge)').toContain('boarCharge');
  assertNoErrors();
});

test('castPetSkill: pet khong có skill riêng giữ chiêu AoE hệ (fallback, khong crash)', async ({ page }) => {
  await createCharacter(page);
  await adoptPet(page, 28, 1, 1);                 // Dơi chúa đỏ: không có trong PET_SKILLS
  await page.waitForTimeout(5000);
  const st = await page.evaluate(() => {
    const R = (window as any).__G.R;
    return {
      hasPetPos: !!R.petPos,
      skillKeys: R.petPos && R.petPos.skillCd ? Object.keys(R.petPos.skillCd) : [],
      petSkillCd: R.petSkillCd || 0,
    };
  });
  expect(st.hasPetPos, 'pet phải ra trận (R.petPos)').toBe(true);
  expect(st.petSkillCd, 'chiêu AoE hệ phải đã cast (petSkillCd > 0)').toBeGreaterThan(0);
  expect(st.skillKeys, 'fallback không dùng skillCd theo key').toHaveLength(0);
  assertNoErrors();
});

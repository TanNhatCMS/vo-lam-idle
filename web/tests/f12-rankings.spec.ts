/* Bảng xep hang (BXH) trong khung chat the gioi — BXH button, doi tab/phai/chê đô,
   "Hạng cúa ban" (can rankId trong save), xem profile theo rank_id.
   MOCK toan bo /api/rankings* — KHONG gui yeu cau nao ra server nguồn. */
import { test, expect, Page } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
});

const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

async function createCharacter(page: Page, name = 'BXHHiệp') {
  await page.goto('/');
  await expect(page.locator('#pfName')).toBeVisible();
  await page.fill('#pfName', name);
  await page.locator('.facpick button').first().click();
  await expect(page.locator('#bNotice')).toBeVisible();
  await page.locator('#bNotice').click();
  const skip = page.locator('#tSkip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  await expect(page.locator('#qBar .qb')).toHaveCount(18);
}

const ROWS = [
  { rank_id: '11111111-1111-4111-8111-111111111111', name: 'CaoThu', faction: 'shaolin', level: 42, reborn: 1, tower_best: 100, bosses: 10, rank: 1, combat_power: 50000 },
  { rank_id: '22222222-2222-4222-8222-222222222222', name: 'LãoGM', faction: 'gaibang', level: 99, reborn: 2, tower_best: 500, bosses: 99, rank: 2, combat_power: 900000 },
  { rank_id: '33333333-3333-4333-8333-333333333333', name: 'TânThủ', faction: 'emei', level: 5, reborn: 0, tower_best: 3, bosses: 0, rank: 3, combat_power: 100 },
];

test('bxh: mo BXH, doi tab, xem profile, hang cua ban', async ({ page }) => {
  // chat API (giu stream — EventSource dung CONNECTING, khong reconnect)
  page.route('**/api/chat/status', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 1 }) }));
  page.route('**/api/chat/stream*', () => { /* treo */ });
  page.route('**/api/chat/messages*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) }));
  page.route('**/api/chat/presence*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));

  const rankCalls: string[] = [];
  // Hai route: profile dung truoc (first-match-wins) — glob Playwright
  // khong cho * qua duong /, nen /api/rankings/profile can pattern rieng.
  page.route('**/api/rankings/profile*', route =>
    route.fulfill(
      { contentType: 'application/json', body: JSON.stringify(
        {
          profile: {
            name: 'CaoThu', faction: 'shaolin', level: 42, reborn: 1, updated_at: String(Math.floor(Date.now() / 1000)),
            tower_best: 100, bosses: 10, combat_power: 50000,
            equipment: { weapon: { snapshot_version: 2, name: 'TestVu', detail: 0, particular: 0, icon: 'img/i/g1.png', tier: 1, series: 0, rarity: 1, enhancement: 0, platinum: 0, base: [], requirements: [], magic: [], set_lines: [] } },
          },
        },
      )
    }
  ));
  page.route('**/api/rankings*', route => {
    const u = new URL(route.request().url());
    rankCalls.push([u.searchParams.get('type'), u.searchParams.get('faction'), u.searchParams.get('mode'), u.searchParams.get('rank_id') || ''].join('|'));
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows: ROWS, total: 3, my_rank: 2 }) });
  });

  await createCharacter(page);

  // save co rankId (uuid v4)
  const S = await page.evaluate(() => (window as any).__G.S);
  expect(S.rankId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

  // mo panel chat, bấm BXH
  await page.locator('#worldChat .wc-toggle').click();
  await expect(page.locator('#worldChat .wc-panel')).toBeVisible();
  await page.locator('.wc-ranking').click();

  // bang xep hang Tháp mac dinh: 3 dong, "Hạng 2"
  await expect(page.locator('.world-rank-board')).toBeVisible();
  await expect(page.locator('.world-rank-table tbody tr')).toHaveCount(3);
  await expect(page.locator('.world-rank-self')).toHaveText('Hạng 2');
  // fetch dau tien: tower|all|normal|<rankId> (mac dinh chê đô = chê độ dang choi)
  expect(rankCalls[0]).toBe(`tower|all|normal|${S.rankId}`);

  // dong tab Cấp -> fetch type=level, cot "Cấp"
  await page.locator('.rank-tab[data-rank-kind="level"]').click();
  await expect.poll(() => rankCalls.some(c => c.startsWith('level|'))).toBe(true);
  await expect(page.locator('.world-rank-table thead th').nth(3)).toHaveText('Cấp');

  // loc phái -> fetch faction
  await page.locator('#worldRankFaction').selectOption('shaolin');
  await expect.poll(() => rankCalls.some(c => c.includes('|shaolin|'))).toBe(true);

  // bấm tên dong (Tháp -> click duoc) -> xem profile theo rank_id
  await page.locator('.rank-tab[data-rank-kind="tower"]').click();
  await expect.poll(() => rankCalls.filter(c => c.startsWith('tower|')).length >= 2).toBe(true);
  await page.locator('.world-rank-name').first().click();
  await expect(page.locator('.world-player-profile')).toBeVisible();
  await expect(page.locator('.world-profile-heading h3')).toHaveText('CaoThu');

  assertNoErrors();
});

test('bxh: chain quay lai (dong item -> ho so -> BXH) + thong bao rong theo phai', async ({ page }) => {
  page.route('**/api/chat/status', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 1 }) }));
  page.route('**/api/chat/stream*', () => { /* treo */ });
  page.route('**/api/chat/messages*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) }));
  page.route('**/api/chat/presence*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
  page.route('**/api/rankings/profile*', route =>
    route.fulfill(
      { contentType: 'application/json', body: JSON.stringify(
        {
          profile: {
            name: 'CaoThu', faction: 'shaolin', level: 42, reborn: 1, updated_at: String(Math.floor(Date.now() / 1000)),
            tower_best: 100, bosses: 10, combat_power: 50000,
            equipment: { weapon: { snapshot_version: 2, name: 'TestVu', detail: 0, particular: 0, icon: 'img/i/g1.png', tier: 1, series: 0, rarity: 1, enhancement: 0, platinum: 0, base: [], requirements: [], magic: [], set_lines: [] } },
          },
        },
      )
    }
  ));
  page.route('**/api/rankings*', route => {
    const u = new URL(route.request().url());
    const empty = u.searchParams.get('faction') === 'shaolin';
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows: empty ? [] : ROWS, total: empty ? 0 : 3, my_rank: 2 }) });
  });

  await createCharacter(page);
  await page.locator('#worldChat .wc-toggle').click();
  await expect(page.locator('#worldChat .wc-panel')).toBeVisible();
  await page.locator('.wc-ranking').click();
  await expect(page.locator('.world-rank-board')).toBeVisible();

  // loc phai Thieu Lam -> khong du lieu -> thong bao dung TEN PHAI (gieng nguon)
  await page.locator('#worldRankFaction').selectOption('shaolin');
  await expect(page.locator('.world-rank-message')).toHaveText('Chưa có dữ liệu Thiếu Lâm phái.');

  // ve Tat ca, mo profile tu BXH
  await page.locator('#worldRankFaction').selectOption('all');
  await page.locator('.world-rank-name').first().click();
  await expect(page.locator('#modal')).toHaveClass(/world-player-profile/);
  await expect(page.locator('#mBody .world-profile-heading h3')).toHaveText('CaoThu');

  // bam trang bi trong ho so -> itemModal; modal mat class profile (gieng nguon)
  await page.locator('#mBody [data-profile-item="weapon"]').click();
  await expect(page.locator('#mBody')).toContainText('TestVu');
  await expect(page.locator('#modal')).not.toHaveClass(/world-player-profile/);

  // Esc -> quay lai ho so (chain Ch)
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toHaveClass(/world-player-profile/);
  await expect(page.locator('#mBody .world-profile-heading h3')).toHaveText('CaoThu');

  // Esc -> quay lai BXH (chain wh)
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toHaveClass(/world-leaderboard-modal/);
  await expect(page.locator('.world-rank-board')).toBeVisible();
  await expect(page.locator('.world-rank-table tbody tr')).toHaveCount(3);

  // dong BXH -> an modal (khong con chuyen ve)
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal')).toHaveClass(/hidden/);

  assertNoErrors();
});

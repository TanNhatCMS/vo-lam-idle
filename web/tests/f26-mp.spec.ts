/* Test Thế Giới multiplayer (mpworld.ts) — mock WebSocket qua page.routeWebSocket
   (Playwright >= 1.48). Server giả: /mp nhận join -> welcome + profile + move.
   Assert: nút #mpStatus đổi trạng thái, players nhận entry, F9 vòng 3 mức PK. */
import { test, expect, Page } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
});

const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

async function createCharacter(page: Page) {
  await page.goto('/');
  await expect(page.locator('#pfName')).toBeVisible();
  await page.fill('#pfName', 'MPHiệp');
  await page.locator('.facpick button').first().click();
  await expect(page.locator('#bNotice')).toBeVisible();
  await page.locator('#bNotice').click();
  const skip = page.locator('#tSkip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  await expect(page.locator('#qBar .qb')).toHaveCount(19);
}

test('mp: nút Map Mình/Thế Giới, nối room giả, nhận người chơi, F9 vòng PK', async ({ page }) => {
  await page.routeWebSocket(/\/mp/, ws => {
    ws.onMessage(msg => {
      let m: any = {};
      try { m = JSON.parse(String(msg)); } catch { /* bỏ qua frame lạ */ }
      if (m.t === 'profile') {
        ws.send(JSON.stringify({ t: 'welcome', id: 'srv-1', protocol: 2 }));
        ws.send(JSON.stringify({ t: 'profile', id: 'p2', name: 'Kiếm Khách', faction: 'wudang', level: 320 }));
        ws.send(JSON.stringify({ t: 'move', id: 'p2', x: 260, y: 210 }));
      }
      if (m.t === 'pk_mode') ws.send(JSON.stringify({ t: 'pk_mode', mode: m.mode }));
    });
  });

  await createCharacter(page);

  // nút trạng thái mặc định: Map Mình
  const st = page.locator('#mpStatus');
  await expect(st).toBeVisible();
  await expect(st).toHaveText('Map Mình');

  // bấm -> vào Thế Giới (nối WS giả) -> trạng thái ok + có 1 người khác
  await st.click();
  await expect(st).toHaveText(/Thế giới · 1 người/, { timeout: 8000 });
  const players = await page.evaluate(() => window.__MP.state.players.size);
  expect(players).toBe(1);

  // room key đúng dạng field:<stage>:standard
  const rk = await page.evaluate(() => window.__MP.roomKey());
  expect(rk).toMatch(/^field:\d+:standard$/);

  // F9: tắt -> PK thường -> Đồ Sát -> tắt
  const pk = page.locator('#mpPkMode');
  await expect(pk).toBeVisible();
  await page.keyboard.press('F9');
  await expect(pk).toHaveText('PK · BẬT');
  await page.keyboard.press('F9');
  await expect(pk).toHaveText('ĐỒ SÁT');
  await page.keyboard.press('F9');
  await expect(pk).toHaveText('PK · TẮT');

  // về Map Mình: nút về trạng thái local, WS ngắt
  await st.click();
  await expect(st).toHaveText('Map Mình');
  await expect(pk).toBeHidden();
  await assertNoErrors();
});

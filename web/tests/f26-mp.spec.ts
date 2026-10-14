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
  /* mock chat the gioi: khong cho game noi LIVE chat server (409 presence flake — bẫy 2.6.11) */
  await page.route('**/api/chat/status', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 1 }) }));
  await page.route('**/api/chat/stream*', r => r.fulfill({
    contentType: 'text/event-stream', headers: { 'Cache-Control': 'no-store' },
    body: 'event: ready\ndata: {"messages":[],"online":3}\n\n',
  }));
  await page.route('**/api/chat/presence*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
  await page.route('**/api/chat/messages*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) }));
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

test('mp pk: pk_attack làm mất máu, trọng thương khi hết máu, mạn áp chặn về Map Mình', async ({ page }) => {
  const serverFrames: any[] = [];                      // page -> mock server
  await page.routeWebSocket(/\/mp/, ws => {
    ws.onMessage(msg => {
      let m: any = {};
      try { m = JSON.parse(String(msg)); } catch { return; }
      serverFrames.push(m);
      if (m.t === 'profile') {
        ws.send(JSON.stringify({ t: 'welcome', id: 'srv-1', protocol: 2 }));
        ws.send(JSON.stringify({ t: 'profile', id: 'killer1', name: 'Sát Thủ', faction: 'wudu', level: 500, pkMode: true }));
      }
      if (m.t === 'pk_mode') ws.send(JSON.stringify({ t: 'pk_mode', mode: m.mode }));
    });
  });

  await createCharacter(page);

  // vào Thế Giới, nhận Sát Thủ
  await page.locator('#mpStatus').click();
  await expect(page.locator('#mpStatus')).toHaveText(/Thế giới · 1 người/, { timeout: 8000 });
  await page.keyboard.press('F9');                 // bật PK thường
  await expect(page.locator('#mpPkMode')).toHaveText('PK · BẬT');

  // đòn pk_attack (dmg lớn hơn máu): ghost enemyHit → mất máu
  const atk = { ar: 100000, dmg: 999999, series: 0 };
  await page.evaluate(a => window.__MP.handle({ t: 'pk_attack', from: 'killer1', name: 'Sát Thủ', atk: a }), atk);
  const life = await page.evaluate(() => { const R = window.__G.R; return { life: R.life, max: R.P.life, killer: R.mpKiller || '' }; });
  expect(life.life).toBeLessThan(life.max);

  // chết trong 3s sau đòn → trọng thương: không lùi ải + modal Về thành dưỡng sức + server nhận pk_death
  await page.evaluate(a => {
    const R = window.__G.R;
    window.__MP.handle({ t: 'pk_attack', from: 'killer1', name: 'Sát Thủ', atk: { ar: 100000, dmg: a * 10, series: 0 } });
  }, life.max);
  await expect.poll(() => serverFrames.some(m => m.t === 'pk_death' && m.attackerId === 'killer1'), { timeout: 8000 }).toBe(true);   // onDeathByPlayer đã báo server
  await expect(page.locator('#modal')).toContainText('Bạn đã trọng thương');
  await expect(page.locator('#modal')).toContainText('Về thành dưỡng sức');

  // kill feed: tự hạ quái → server nhận monster_died; người khác hạ quái → log hiện
  await page.evaluate(() => window.__MP.monsterKilled('Hắc Hùng'));
  expect(serverFrames.some(m => m.t === 'monster_died' && m.n === 'Hắc Hùng' && m.killer === 'MPHiệp')).toBe(true);
  await page.evaluate(() => window.__MP.handle({ t: 'monster_died', n: 'Lang Báo', killer: 'Sát Thủ' }));
  await page.waitForTimeout(200);
  const feed = await page.evaluate(() => [...document.querySelectorAll('#t-log .log-entry, #log .log-entry')].map(x => x.textContent).join('|'));
  const hasFeed = feed.includes('vừa hạ') || (await page.evaluate(() => document.body.textContent.includes('vừa hạ Lang Báo')));
  expect(hasFeed).toBe(true);

  // server cộng mạn áp 2 điểm → KHÔNG được về Map Mình
  await page.evaluate(() => window.__MP.handle({ t: 'murder', count: 2, decayAt: Date.now() + 20 * 60000 }));
  await page.locator('#mpStatus').click();
  await expect(page.locator('#mpStatus')).toHaveText(/Thế giới/, { timeout: 4000 });   // vẫn ở Thế Giới
  const murder = await page.evaluate(() => window.__MP.state.murderCount);
  expect(murder).toBe(2);
  await expect(page.locator('#mpPkMode')).toBeVisible();   // chưa bị đá về local
  await assertNoErrors();
});

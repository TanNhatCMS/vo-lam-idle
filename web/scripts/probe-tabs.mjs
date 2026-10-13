/* Đo từng nút tab Phần thưởng trên mobile — xem hàng nút có cân đối không */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:8917';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.route('**/api/chat/status', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 0 }) }));
page.route('**/api/chat/stream*', () => {});
page.route('**/api/chat/messages*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) }));
page.route('**/api/chat/presence*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));

await page.goto(BASE + '/');
await page.fill('#pfName', 'MobProbe');
await page.locator('.facpick button').first().click();
await page.locator('#bNotice').click();
const skip = page.locator('#tSkip');
if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
await page.waitForSelector('#qBar .qb');
await page.locator('#qBar .qb', { hasText: 'Tháp I' }).first().click();
await page.waitForTimeout(400);

const tabs = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('#giftTabs button').forEach(b => {
    const r = b.getBoundingClientRect();
    out.push({ t: b.textContent, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  });
  return out;
});
// group by row (y)
const rows = {};
for (const t of tabs) (rows[t.y] = rows[t.y] || []).push(t);
for (const y of Object.keys(rows).sort((a, b) => a - b)) {
  const r = rows[y];
  const right = Math.max(...r.map(t => t.x + t.w));
  console.log(`row y=${y}: ${r.length} buttons, right edge=${right}, widths=[${r.map(t => t.w).join(',')}]`);
}
console.log('viewport 390; modal inner width ~347');

// kiểm tra: modal có bị lệch không — mbox so với tâm màn hình
const mbox = await page.evaluate(() => {
  const r = document.querySelector('#modal .mbox').getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
});
console.log('mbox center:', mbox.cx, mbox.cy, '(screen center: 195, 422)');

// pet modal full content (chọn pet đầu tiên nếu có)
await page.locator('#mClose').click();
await page.waitForTimeout(200);
await page.locator('#qBar .qb', { hasText: 'Đồng hành' }).first().click();
await page.waitForTimeout(400);
const petGeo = await page.evaluate(() => {
  const g = s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { s, y: Math.round(r.y), h: Math.round(r.height), sh: el.scrollHeight }; };
  return [g('#modal .mbox'), g('#mBody'), g('#mBody .petpick'), g('#mBody .pet-preview')].filter(Boolean);
});
console.log('pet modal:', JSON.stringify(petGeo));
await browser.close();

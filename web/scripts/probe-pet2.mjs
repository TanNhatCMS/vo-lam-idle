/* Đo pet modal khi đã có pet (cấp nhân vật lên bằng evaluate) */
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

// lên cấp 30 (mở Đồng hành) + cho pet
await page.evaluate(() => {
  const g = window.__G, S = g.S;
  S.lvl = 30;
  g.save();
});
await page.reload();
await page.waitForSelector('#qBar .qb');
await page.locator('#qBar .qb', { hasText: 'Đồng hành' }).first().click();
await page.waitForTimeout(400);
// nhận pet đầu tiên trong danh sách (nút Dẫn theo)
const adopted = await page.locator('#mBody [data-p-adopt]').first().click().then(() => true).catch(() => false);
console.log('adopt clicked:', adopted);
await page.waitForTimeout(400);

const g = await page.evaluate(() => {
  const out = {};
  const m = document.querySelector('#modal .mbox');
  const r = m.getBoundingClientRect();
  out.mbox = { y: Math.round(r.y), h: Math.round(r.height), sh: m.scrollHeight, ch: m.clientHeight };
  const grids = [...document.querySelectorAll('#mBody .petgroup-grid')];
  out.gridCount = grids.length;
  out.grids = grids.slice(0, 3).map((gr, gi) => {
    const cells = [...gr.querySelectorAll('button')];
    const rows = {};
    cells.forEach(b => {
      const cr = b.getBoundingClientRect();
      (rows[Math.round(cr.y)] = rows[Math.round(cr.y)] || []).push(Math.round(cr.height));
    });
    return { gi, cells: cells.length, rowHeights: Object.values(rows).map(r => r.join('/')) };
  });
  const pp = document.querySelector('#mBody .petpick');
  out.petpick = pp ? { sh: pp.scrollHeight, ch: pp.clientHeight, overflow: getComputedStyle(pp).overflow, maxH: getComputedStyle(pp).maxHeight } : null;
  const preview = document.querySelector('#mBody .pet-preview');
  if (preview) {
    const pr = preview.getBoundingClientRect();
    out.preview = { y: Math.round(pr.y), h: Math.round(pr.height) };
  }
  return out;
});
console.log(JSON.stringify(g, null, 1));
await browser.close();

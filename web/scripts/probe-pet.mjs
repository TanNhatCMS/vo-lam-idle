/* Đo pet modal khi đã chọn pet — danh sách loài có cân đối không */
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

await page.locator('#qBar .qb', { hasText: 'Đồng hành' }).first().click();
await page.waitForTimeout(400);
// chọn pet đầu tiên có nút "Dẫn theo"
await page.locator('#mBody [data-p-adopt]').first().click();
await page.waitForTimeout(400);

const g = await page.evaluate(() => {
  const out = {};
  const m = document.querySelector('#modal .mbox');
  const r = m.getBoundingClientRect();
  out.mbox = { y: Math.round(r.y), h: Math.round(r.height), sh: m.scrollHeight, ch: m.clientHeight };
  // từng ô lưới petgroup-grid: chiều cao từng ô có đều không
  const grids = [...document.querySelectorAll('#mBody .petgroup-grid')];
  out.grids = grids.map((gr, gi) => {
    const cells = [...gr.querySelectorAll('button')];
    const rows = {};
    cells.forEach(b => {
      const cr = b.getBoundingClientRect();
      (rows[Math.round(cr.y)] = rows[Math.round(cr.y)] || []).push(Math.round(cr.height));
    });
    return {
      gi,
      cols: Math.max(...Object.values(rows).map(r => r.length)),
      rowHeights: Object.values(rows).map(r => r.join('/')),
      rowYs: Object.keys(rows).sort((a, b) => a - b),
    };
  });
  // petpick có bị cắt trên khi scroll không
  const pp = document.querySelector('#mBody .petpick');
  out.petpick = pp ? { sh: pp.scrollHeight, ch: pp.clientHeight, overflow: getComputedStyle(pp).overflow } : null;
  return out;
});
console.log(JSON.stringify(g, null, 1));
await browser.close();

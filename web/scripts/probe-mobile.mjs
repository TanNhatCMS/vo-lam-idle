/* Probe giao diện Phần thưởng trên mobile viewport — chụp ảnh để xem layout */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:8917';
const OUT = 'C:/Users/KietNT/.zcode/v2/visualizations/2c7b745ae53d6b005f56efe0984db38c98888d43e3b9d43f3e44b2556959f1a0';

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

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(BASE + '/');
await page.fill('#pfName', 'MobProbe');
await page.locator('.facpick button').first().click();
await page.locator('#bNotice').click();
const skip = page.locator('#tSkip');
if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
await page.waitForSelector('#qBar .qb');

const clickQb = async (label) => {
  const btn = page.locator('#qBar .qb', { hasText: label }).first();
  await btn.click();
};

/* 1) Phần thưởng (mở từ nút Tháp I — tab Tháp) */
await clickQb('Tháp I');
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '/mob-gift-tower.png' });

/* chuyển sang tab Điểm danh (nội dung tổng quát) */
await page.locator('#giftTabs button', { hasText: 'Điểm danh' }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: OUT + '/mob-gift-login.png' });

/* 2) Đồng hành (modal riêng) */
await page.locator('#mClose').click();
await page.waitForTimeout(200);
await clickQb('Đồng hành');
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '/mob-pet.png' });

/* 3) đóng pet -> mở lại Phần thưởng (kiểm rò rỉ class pet-card-modal) */
await page.locator('#mClose').click();
await page.waitForTimeout(200);
await clickQb('Tháp I');
await page.waitForTimeout(300);
const leaked = await page.evaluate(() => document.getElementById('modal').className);
console.log('modal class sau pet:', leaked);
await page.screenshot({ path: OUT + '/mob-gift-after-pet.png' });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();

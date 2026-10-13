/* In bản đồ ASCII ảnh chụp màn hình — mỗi ký tự = 1 ô 8x16px, theo độ sáng */
import { chromium } from '@playwright/test';
import fs from 'fs';

const BASE = 'http://localhost:8917';
const OUT = 'C:/Users/KietNT/.zcode/v2/visualizations/2c7b745ae53d6b005f56efe0984db38c98888d43e3b9d43f3e44b2556959f1a0';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true,
  deviceScaleFactor: 1,
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

const shot = async (name) => {
  const buf = await page.screenshot({ type: 'png' });
  fs.writeFileSync(OUT + '/' + name + '.png', buf);
  // decode PNG qua canvas của playwright: dùng ảnh bitmap thô
  return buf;
};

/* Phần thưởng — tab Tháp */
await page.locator('#qBar .qb', { hasText: 'Tháp I' }).first().click();
await page.waitForTimeout(400);
await shot('v-mob-gift');

/* Đồng hành */
await page.locator('#mClose').click();
await page.waitForTimeout(200);
await page.locator('#qBar .qb', { hasText: 'Đồng hành' }).first().click();
await page.waitForTimeout(400);
await shot('v-mob-pet');

await browser.close();
console.log('done');

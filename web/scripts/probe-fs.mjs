/* Đo modal Phần thưởng ở các cỡ chữ (zoom --fs) trên mobile */
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

const measure = async (fs) => {
  await page.evaluate((f) => {
    const UIP = JSON.parse(localStorage.getItem('jxidle_ui') || '{}');
    UIP.fs = f;
    localStorage.setItem('jxidle_ui', JSON.stringify(UIP));
    document.documentElement.style.setProperty('--fs', String([0.9, 1, 1.15, 1.3][f]));
  }, fs);
  await page.locator('#qBar .qb', { hasText: 'Tháp I' }).first().click();
  await page.waitForTimeout(300);
  const g = await page.evaluate(() => {
    const r = document.querySelector('#modal .mbox').getBoundingClientRect();
    const cs = getComputedStyle(document.querySelector('#modal .mbox'));
    // nội dung có bị cắt trên không: scrollTop min/max
    const mb = document.querySelector('#modal .mbox');
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      right: Math.round(r.right), bottom: Math.round(r.bottom),
      zoom: cs.zoom, scrollTop: mb.scrollTop, scrollH: mb.scrollHeight, clientH: mb.clientHeight,
    };
  });
  await page.locator('#mClose').click();
  await page.waitForTimeout(150);
  return g;
};

for (const fs of [0, 1, 2, 3]) {
  const g = await measure(fs);
  console.log(`fs=${[0.9, 1, 1.15, 1.3][fs]}:`, JSON.stringify(g), g.bottom > 844 || g.y < 0 ? '  <<< TRÀN MÀN HÌNH' : '');
}
await browser.close();

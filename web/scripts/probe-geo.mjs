/* Đo hình học modal Phần thưởng trên mobile — phát hiện mất cân đối */
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

const geo = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    sel: s,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    scrollH: el.scrollHeight, clientH: el.clientHeight,
    overflow: cs.overflow, maxH: cs.maxHeight, position: cs.position,
    zoom: cs.zoom, fontSize: cs.fontSize,
  };
}, sel);

const report = async (name) => {
  console.log('=== ' + name + ' ===');
  const vw = page.viewportSize();
  console.log('viewport', vw.width, 'x', vw.height);
  for (const s of ['#app', '#modal', '#modal .mbox', '#mBody', '#giftTabs', '#giftTabs .dtabs', '#mBody .desc', '#mBody .btnrow', '#mBody h3', '#mBody .qrow']) {
    const g = await geo(s);
    if (g) console.log(JSON.stringify(g));
  }
  // nội dung có tràn ngang không
  const wide = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('#mBody *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2)) bad.push(el.tagName + '.' + el.className + ' right=' + Math.round(r.right));
    });
    return bad.slice(0, 10);
  });
  console.log('overflow-x elements:', wide.length ? wide : 'none');
};

const clickQb = async (label) => {
  await page.locator('#qBar .qb', { hasText: label }).first().click();
};

await clickQb('Tháp I');
await page.waitForTimeout(400);
await report('GIFT MODAL (tab Tháp) — mobile');

await page.locator('#giftTabs button', { hasText: 'Điểm danh' }).click();
await page.waitForTimeout(200);
await report('GIFT MODAL (tab Điểm danh) — mobile');

await page.locator('#mClose').click();
await page.waitForTimeout(200);
await clickQb('Đồng hành');
await page.waitForTimeout(400);
await report('PET MODAL — mobile');

await page.locator('#mClose').click();
await page.waitForTimeout(200);
await clickQb('Tháp I');
await page.waitForTimeout(300);
await report('GIFT MODAL SAU KHI MỞ PET — mobile');

await browser.close();

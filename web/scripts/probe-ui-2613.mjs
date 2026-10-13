/* Probe UI 2.6.13 (v2): Phần thưởng / Kỳ Trân Các geometry / header so nguồn
   Mobile viewport 390x844. */
import { chromium } from '@playwright/test';
import fs from 'fs';

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

await page.goto(BASE + '/');
await page.fill('#pfName', 'MobProbe');
await page.locator('.facpick button').first().click();
await page.locator('#bNotice').click();
const skip = page.locator('#tSkip');
if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
await page.waitForSelector('#qBar .qb');
await page.waitForTimeout(1200);
const shot = async (name) => fs.writeFileSync(OUT + '/' + name + '.png', await page.screenshot({ type: 'png' }));

/* qb mới: 19 nút */
const qbCount = await page.locator('#qBar .qb').count();
console.log('qb count:', qbCount);

/* 1) Phần thưởng — mở từ Tháp I (qb 0), chụp + dò từng tab */
await page.locator('#qBar .qb[data-q="0"]').click();
await page.waitForTimeout(400);
await shot('q1-gift-tower');
const tabs = await page.evaluate(() => [...document.querySelectorAll('#giftTabs button')].map(b => ({ g: b.dataset.g, t: (b.textContent || '').trim() })));
fs.writeFileSync(OUT + '/q1-tabs.json', JSON.stringify(tabs, null, 2));
for (const t of tabs) {
  await page.locator(`#giftTabs button[data-g="${t.g}"]`).click();
  await page.waitForTimeout(250);
  await shot('q1-gift-' + t.g);
}
const giftGeo = await page.evaluate(() => {
  const g = el => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { sh: el.scrollHeight, ch: el.clientHeight, st: el.scrollTop, ovf: cs.overflowY, h: Math.round(r.height), maxh: cs.maxHeight }; };
  return { body: g(document.querySelector('#mBody')), box: g(document.querySelector('#modal .mbox')), tabs: g(document.querySelector('#giftTabs')) };
});
fs.writeFileSync(OUT + '/q1-gift-geo.json', JSON.stringify(giftGeo, null, 2));
await page.locator('#mClose').click().catch(() => {});
await page.waitForTimeout(300);

/* 2) Kỳ Trân Các qua qb */
await page.locator('#qBar .qb', { hasText: 'Kỳ Trân Các' }).first().click();
await page.waitForTimeout(600);
await shot('q2-ktc');
const ktcGeo = await page.evaluate(() => {
  const g = el => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { sh: el.scrollHeight, ch: el.clientHeight, st: el.scrollTop, ovf: cs.overflowY, h: Math.round(r.height), maxh: cs.maxHeight, cls: el.className }; };
  const b = document.querySelector('#mBody');
  let scrollTest = null;
  if (b) { const before = b.scrollTop; b.scrollTop = 99999; scrollTest = { before, after: b.scrollTop, sh: b.scrollHeight, ch: b.clientHeight }; b.scrollTop = before; }
  return { body: g(b), box: g(document.querySelector('#modal .mbox')), modal: g(document.querySelector('#modal')), scrollTest };
});
fs.writeFileSync(OUT + '/q2-ktc-geo.json', JSON.stringify(ktcGeo, null, 2));
await page.locator('#mClose').click().catch(() => {});
await page.waitForTimeout(300);

/* 3) Header dump (không modal) */
const dom = await page.evaluate(() => {
  const el = document.querySelector('#top');
  return el ? el.outerHTML : null;
});
fs.writeFileSync(OUT + '/q3-header.html', dom || 'NO #top');
await shot('q3-header');
console.log('DONE');
await browser.close();

/* So save gốc trong .jxsave vs state sau khi nạp — tìm trường bị mất/đổi. */
import { chromium } from '@playwright/test';
import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('C:/Users/KietNT/Downloads/jxidle_wudu_cap1000_20261012_0711_1.jxsave', 'utf-8'));
const packed = raw.data;
const fileState = JSON.parse(JSON.parse(packed).d);          // {d,h} -> state

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.route('**/api/chat/status', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 0 }) }));
page.route('**/api/chat/stream*', () => {});
page.route('**/api/chat/messages*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) }));
page.route('**/api/chat/presence*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
await page.goto('http://localhost:8917/');
await page.waitForTimeout(800);
await page.evaluate(p => { localStorage.setItem('jxidle', p); localStorage.setItem('jxidle_slot', '0'); }, packed);
await page.reload();
await page.waitForTimeout(3000);
await page.waitForFunction(() => !!(window).__G && (window).__G.S && (window).__G.S.fac, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1000);

const live = await page.evaluate(() => JSON.parse(JSON.stringify((window).__G.S)));
const out = await page.evaluate(f => {
  // diff sâu kiểu nông + vài trường game-specific
  const S = (window).__G.S;
  const diffs = [];
  const keys = new Set([...Object.keys(f), ...Object.keys(S)]);
  for (const k of keys) {
    const a = JSON.stringify(f[k]), b = JSON.stringify(S[k]);
    if (a !== b) diffs.push({ k, file: (a || 'undefined').slice(0, 240), live: (b || 'undefined').slice(0, 240) });
  }
  return diffs;
}, fileState);
console.log('=== DIFF file vs live (trước recalc từ hoạt động) ===');
for (const d of out) console.log(d.k, '\n  FILE:', d.file, '\n  LIVE:', d.live, '\n');
await browser.close();

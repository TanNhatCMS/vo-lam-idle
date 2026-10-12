/* F16 — Modal tren mobile: vua chieu ngang man hinh, dung giua,
   khong bi trinh duyet tu cuon lam xep UI (body khong co scrollable overflow).
   MOCK /api/chat/* nhu moi test. */
import { test, expect, Page } from '@playwright/test';

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
});
const assertNoErrors = () => expect(errors, errors.join('\n')).toEqual([]);

test('mobile: modal vua chieu ngang, dung giua, UI khong bi xep', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.route('**/api/chat/status', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, online: 0 }) }));
  page.route('**/api/chat/stream*', () => { /* treo */ });
  page.route('**/api/chat/messages*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, messages: [] }) }));
  page.route('**/api/chat/presence*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));

  await page.goto('http://localhost:8917/');
  await expect(page.locator('#pfName')).toBeVisible();
  await page.fill('#pfName', 'MobModal');
  await page.locator('.facpick button').first().click();
  await expect(page.locator('#bNotice')).toBeVisible();
  await page.locator('#bNotice').click();
  const skip = page.locator('#tSkip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  await expect(page.locator('#qBar .qb')).toHaveCount(14);

  // trang thai mobile: #app = viewport, khong bi cuon
  const pre = await page.evaluate(() => ({
    mob: document.body.classList.contains('mob'),
    appTop: Math.round(document.getElementById('app').getBoundingClientRect().top),
    appW: Math.round(document.getElementById('app').getBoundingClientRect().width),
    bodyScrollTop: document.body.scrollTop,
    bodyH: document.body.scrollHeight,
  }));
  expect(pre.mob, 'phai co body.mob').toBe(true);
  expect(pre.appTop, 'app phai o dinh man hinh').toBe(0);
  expect(pre.appW, 'app vua chieu ngang').toBe(390);
  expect(pre.bodyScrollTop, 'body khong bi cuon').toBe(0);
  expect(pre.bodyH, 'body khong tran viewport').toBeLessThanOrEqual(844);

  // mo modal (Phan thuong qua qb[0])
  await page.locator('#qBar .qb').first().click();
  await expect(page.locator('#modal')).not.toHaveClass(/hidden/);
  // cho animation modal-box-enter (.28s) xong moi do
  await page.waitForTimeout(450);

  const post = await page.evaluate(() => {
    const m = document.getElementById('modal');
    const box = m.querySelector('.mbox');
    const mr = m.getBoundingClientRect(), br = box.getBoundingClientRect();
    return {
      appTop: Math.round(document.getElementById('app').getBoundingClientRect().top),
      bodyScrollTop: document.body.scrollTop,
      modalTop: Math.round(mr.top),
      modalW: Math.round(mr.width),
      boxTop: br.top,
      boxW: br.width,
      boxBottom: br.bottom,
      bottomEl: (document.elementFromPoint(195, 830) || {}).tagName,
      title: (m.textContent || '').slice(0, 30),
    };
  });
  expect(post.bodyScrollTop, 'mo modal van khong bi cuon').toBe(0);
  expect(post.appTop, 'app van o dinh').toBe(0);
  expect(post.modalTop, 'modal neo #app (top 0)').toBe(0);
  expect(post.modalW, 'modal vua chieu ngang man hinh').toBe(390);
  // mbox = (125vw - padding 12x2) x 0.8 = 370.8
  expect(post.boxW, 'mbox vua chieu ngang (tru padding)').toBeGreaterThan(368);
  expect(post.boxW).toBeLessThan(373);
  // dung giua man hinh: (844 - h)/2 +/- 2px
  const h = post.boxBottom - post.boxTop;
  const expectTop = (844 - h) / 2;
  expect(Math.abs(post.boxTop - expectTop), `boxTop=${post.boxTop} expect=${expectTop}`).toBeLessThanOrEqual(2);
  expect(post.bottomEl, 'dung duoi man hinh la modal').not.toBe('BODY');

  // duy tri 4s (scroll anchoring khong quay lai)
  await page.waitForTimeout(4000);
  const later = await page.evaluate(() => ({
    bodyScrollTop: document.body.scrollTop,
    appTop: Math.round(document.getElementById('app').getBoundingClientRect().top),
  }));
  expect(later.bodyScrollTop).toBe(0);
  expect(later.appTop).toBe(0);

  assertNoErrors();
  await ctx.close();
});

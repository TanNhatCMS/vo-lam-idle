/* Debug lực chiến sau import save wudu cap1000 (~20M lúc export → 1M+ bây giờ).
   Nạp save vào localStorage (format pack {d,h}), reload, đo mọi thành phần power. */
import { chromium } from '@playwright/test';
import fs from 'fs';

const SAVE_PATH = 'C:/Users/KietNT/Downloads/jxidle_wudu_cap1000_20261012_0711_1.jxsave';
const raw = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf-8'));
const packed = raw.data;                       // chuỗi {d,h} đúng như slot lưu

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
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const G = (window).__G, S = G.S, R = G.R;
  const P = R.P, a = P.main;
  const eDef = 8 + 3.2 * S.lvl, eAr = 30 + 9 * S.lvl;
  const baseHit = (x => x)(0);
  // tính hit thủ công như power()
  const d = eDef * 1; // ignore
  let hp = P.ar + eDef === 0 ? 50 : P.ar * 100 / (P.ar + eDef);
  if (hp > 99) hp = 95;
  hp = Math.max(40, hp);
  const hit = a.useAR ? (a.purePhysical
    ? 100 - Math.min(100 - hp, 3) * (1 - Math.min(100, Math.max(0, P.accMissReduction)) / 100)
    : hp) / 100 : 1;
  let dodge = eAr + P.def === 0 ? 50 : eAr * 100 / (eAr + P.def);
  if (dodge > 99) dodge = 95;
  dodge = Math.max(40, dodge) / 100;
  const avgRes = 0; // tính thủ công
  return {
    lvl: S.lvl, fac: S.fac, stage: S.stage, name: S.name,
    power: R.power,
    dpsRaw: a.dps, dpsTot: a.tot, rate: a.rate, melee: a.melee, targets: a.targets, around: a.around, radial: a.radial,
    mainSkill: a.n, useAR: a.useAR, purePhysical: a.purePhysical, ignore: a.ignore,
    parts: a.parts, crit: a.crit,
    aspd: P.aspd, aspdPhys: P.aspdPhys, aspdSpell: P.aspdSpell,
    ar: P.ar, accMissReduction: P.accMissReduction, def: P.def, life: P.life,
    hitCalc: hit, hpBase: hp, dodgeCalc: dodge,
    eng: P.eng, str: P.str, dex: P.dex, physStat: P.physStat, spellW: P.spellW, dmgMul: P.dmgMul,
    eqWeapon: S.eq && S.eq.weapon ? { n: S.eq.weapon.n, enh: S.eq.weapon.enh, mag: (S.eq.weapon.mag || []).length } : null,
    eqKeys: S.eq ? Object.keys(S.eq) : [],
    skIds: S.sk ? Object.keys(S.sk).length : 0,
    wpTier: P.spellW,
    sustain: a.sustain,
  };
});
console.log(JSON.stringify(info, null, 1));

/* Power thủ công theo công thức 2.6.13 */
const calc = await page.evaluate(() => {
  const G = (window).__G, S = G.S, R = G.R, P = R.P, a = P.main;
  const L = S.lvl, eDef = 8 + 3.2 * L, eAr = 30 + 9 * L;
  let hp = P.ar + eDef === 0 ? 50 : P.ar * 100 / (P.ar + eDef);
  if (hp > 99) hp = 95; hp = Math.max(40, hp);
  const hit = a.useAR ? (a.purePhysical ? 100 - Math.min(100 - hp, 3) * (1 - Math.min(100, Math.max(0, P.accMissReduction)) / 100) : hp) / 100 : 1;
  let dg = eAr * 100 / (eAr + P.def); if (dg > 99) dg = 95; dg = Math.max(40, dg) / 100;
  const avgRes = Object.values(P.res).reduce((t, v) => t + v, 0) / 5;
  const ehp = P.life / Math.max(0.2, 1 - avgRes / 100) / Math.max(0.3, 1 - dg);
  const dps = a.dps * hit;
  return { dps, ehp, powerManual: Math.pow(Math.max(1, dps), 0.7) * Math.pow(Math.max(1, ehp), 0.3), avgRes, dodgePct: dg * 100, eDef, eAr, ar: P.ar, def: P.def, life: P.life };
});
console.log(JSON.stringify(calc, null, 1));
await browser.close();

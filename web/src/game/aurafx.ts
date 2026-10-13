// @ts-nocheck — port tu nguon v107/v91: he thong vong sang mon phai (standing aura)
/* Vong sang quanh nhan vat: sprite anim ghep gan chan/body/dau theo ky nang da hoc.
   st_0/st_1 = Thieu Lam (15 Bat dong Minh Vuong — hien khi buff con han; 16 La Han Tran —
   hien khi vong sang bat). Bang AUR gop cac bang cua nguon (Lp/zp/Vp/Up/Zp/$p/nm/im/om/Gp);
   Gp (skill nang cap chuyen sinh st2_*) gate theo f cua skill, cac bang con lai gate theo
   mon phai cua bang. Quai trung bua hai ve aura lan dan (nguon tm — pool Vp/Up/$p). */
'use strict';
import { SK } from './core';
import { R } from './combat';
import { S } from './save';
import { img } from './render';
import { skKind, skillAuraEnabled, skillBuffActive } from './skillsys';

type AurDef = {
  f: string;                                 // file sprite fx/st_*.webp
  n: number; w: number; h: number;           // so khung, kich thuoc 1 khung
  ax: number; ay: number;                    // tam neo (goc ve = N - ax*scale, N - ay*scale)
  ms: number;                                // ms moi khung
  pos: 'head' | 'body' | 'foot';             // foot -> lop under, con lai -> lop over
  fac: string | null;                        // mon phai cua bang (null: theo f cua skill — Gp)
  m: 'buff' | 'aura' | 'auto' | 'aura146';   // cach kiem tra hien thi
  lift?: number;                             // dao cao dau (mac dinh 30 — Ip nguon)
  a?: number;                                // alpha rieng
};

const AUR: Record<number, AurDef> = {
  // Thieu Lam
  15:  { f: 'fx/st_0.webp',  n: 13, w: 342, h: 239, ax: 177, ay: 168, ms: 92,  pos: 'body', fac: 'shaolin', m: 'buff' },
  16:  { f: 'fx/st_1.webp',  n: 10, w: 107, h: 75,  ax: 50,  ay: 37,  ms: 120, pos: 'foot', fac: 'shaolin', m: 'aura' },
  273: { f: 'fx/st_29.webp', n: 15, w: 168, h: 167, ax: 85,  ay: 168, ms: 80,  pos: 'head', fac: 'shaolin', m: 'auto' },
  // Thien Vuong Bang
  33:  { f: 'fx/st_2.webp',  n: 10, w: 36,  h: 40,  ax: 16,  ay: 116, ms: 120, pos: 'head', fac: 'tianwang', m: 'buff' },
  42:  { f: 'fx/st_3.webp',  n: 20, w: 75,  h: 78,  ax: 35,  ay: 72,  ms: 60,  pos: 'head', fac: 'tianwang', m: 'buff', lift: 16 },
  // Ngu Doc Giao (con lai dung cho aura bua hai tren quai)
  69:  { f: 'fx/st_6.webp',  n: 24, w: 115, h: 104, ax: 55,  ay: 50,  ms: 50,  pos: 'foot', fac: 'wudu', m: 'aura', a: .85 },
  64:  { f: 'fx/st_4.webp',  n: 24, w: 87,  h: 109, ax: 41,  ay: 158, ms: 50,  pos: 'head', fac: 'wudu', m: 'auto' },
  67:  { f: 'fx/st_5.webp',  n: 24, w: 93,  h: 123, ax: 44,  ay: 163, ms: 50,  pos: 'head', fac: 'wudu', m: 'auto' },
  70:  { f: 'fx/st_7.webp',  n: 24, w: 89,  h: 117, ax: 42,  ay: 161, ms: 50,  pos: 'head', fac: 'wudu', m: 'auto' },
  72:  { f: 'fx/st_8.webp',  n: 24, w: 83,  h: 109, ax: 39,  ay: 159, ms: 50,  pos: 'head', fac: 'wudu', m: 'auto' },
  73:  { f: 'fx/st_9.webp',  n: 20, w: 101, h: 86,  ax: 55,  ay: 77,  ms: 60,  pos: 'body', fac: 'wudu', m: 'auto' },
  356: { f: 'fx/st_27.webp', n: 15, w: 25,  h: 50,  ax: 13,  ay: 129, ms: 80,  pos: 'head', fac: 'wudu', m: 'auto' },
  390: { f: 'fx/st_34.webp', n: 20, w: 52,  h: 46,  ax: 23,  ay: 97,  ms: 60,  pos: 'head', fac: 'wudu', m: 'auto' },
  // Thien Nhan Giao
  136: { f: 'fx/st_17.webp', n: 5,  w: 75,  h: 58,  ax: 37,  ay: 29,  ms: 240, pos: 'foot', fac: 'tianren', m: 'auto' },
  137: { f: 'fx/st_18.webp', n: 15, w: 64,  h: 52,  ax: 31,  ay: 117, ms: 80,  pos: 'head', fac: 'tianren', m: 'auto' },
  140: { f: 'fx/st_19.webp', n: 15, w: 67,  h: 55,  ax: 34,  ay: 119, ms: 80,  pos: 'head', fac: 'tianren', m: 'auto' },
  143: { f: 'fx/st_20.webp', n: 15, w: 69,  h: 56,  ax: 32,  ay: 114, ms: 80,  pos: 'head', fac: 'tianren', m: 'auto' },
  150: { f: 'fx/st_21.webp', n: 15, w: 62,  h: 74,  ax: 32,  ay: 128, ms: 80,  pos: 'head', fac: 'tianren', m: 'auto' },
  364: { f: 'fx/st_33.webp', n: 15, w: 60,  h: 51,  ax: 25,  ay: 68,  ms: 80,  pos: 'body', fac: 'tianren', m: 'auto' },
  391: { f: 'fx/st_35.webp', n: 18, w: 74,  h: 45,  ax: 36,  ay: 21,  ms: 67,  pos: 'foot', fac: 'tianren', m: 'auto' },
  // Thuy Yen mon
  100: { f: 'fx/st_14.webp', n: 16, w: 139, h: 100, ax: 70,  ay: 95,  ms: 75,  pos: 'body', fac: 'cuiyan', m: 'buff' },
  109: { f: 'fx/st_15.webp', n: 16, w: 122, h: 138, ax: 59,  ay: 102, ms: 75,  pos: 'body', fac: 'cuiyan', m: 'buff' },
  // Con Lon phai (con lai dung cho bua hai)
  171: { f: 'fx/st_24.webp', n: 15, w: 110, h: 95,  ax: 52,  ay: 87,  ms: 80,  pos: 'body', fac: 'kunlun', m: 'buff' },
  173: { f: 'fx/st_25.webp', n: 20, w: 129, h: 115, ax: 65,  ay: 110, ms: 60,  pos: 'body', fac: 'kunlun', m: 'buff' },
  178: { f: 'fx/st_28.webp', n: 24, w: 94,  h: 100, ax: 46,  ay: 79,  ms: 50,  pos: 'body', fac: 'kunlun', m: 'buff' },
  174: { f: 'fx/st_26.webp', n: 15, w: 39,  h: 45,  ax: 19,  ay: 111, ms: 80,  pos: 'head', fac: 'kunlun', m: 'auto' },
  175: { f: 'fx/st_27.webp', n: 15, w: 25,  h: 50,  ax: 13,  ay: 129, ms: 80,  pos: 'head', fac: 'kunlun', m: 'auto' },
  90:  { f: 'fx/st_12.webp', n: 15, w: 37,  h: 43,  ax: 18,  ay: 109, ms: 80,  pos: 'head', fac: 'kunlun', m: 'auto' },
  392: { f: 'fx/st_36.webp', n: 15, w: 38,  h: 49,  ax: 19,  ay: 111, ms: 80,  pos: 'head', fac: 'kunlun', m: 'auto' },
  393: { f: 'fx/st_37.webp', n: 15, w: 37,  h: 45,  ax: 18,  ay: 111, ms: 80,  pos: 'head', fac: 'kunlun', m: 'auto' },
  394: { f: 'fx/st_38.webp', n: 8,  w: 133, h: 128, ax: 64,  ay: 102, ms: 150, pos: 'body', fac: 'kunlun', m: 'auto' },
  // Vo Dang phai
  159: { f: 'fx/st_23.webp', n: 24, w: 104, h: 82,  ax: 53,  ay: 43,  ms: 50,  pos: 'foot', fac: 'wudang', m: 'aura' },
  157: { f: 'fx/st_22.webp', n: 24, w: 92,  h: 96,  ax: 43,  ay: 139, ms: 50,  pos: 'head', fac: 'wudang', m: 'buff' },
  // Nga My phai (gioi han 3 aura/pos uu tien req cao — nguon am())
  89:  { f: 'fx/st_11.webp', n: 16, w: 92,  h: 65,  ax: 47,  ay: 35,  ms: 75,  pos: 'foot', fac: 'emei', m: 'aura' },
  86:  { f: 'fx/st_10.webp', n: 16, w: 91,  h: 64,  ax: 47,  ay: 35,  ms: 75,  pos: 'foot', fac: 'emei', m: 'aura' },
  92:  { f: 'fx/st_13.webp', n: 15, w: 99,  h: 75,  ax: 51,  ay: 43,  ms: 80,  pos: 'foot', fac: 'emei', m: 'aura' },
  282: { f: 'fx/st2_281.webp', n: 20, w: 75, h: 65, ax: 37,  ay: 75,  ms: 100, pos: 'body', fac: 'emei', m: 'aura' },
  332: { f: 'fx/st_32.webp', n: 20, w: 130, h: 78,  ax: 66,  ay: 37,  ms: 60,  pos: 'foot', fac: 'emei', m: 'aura' },
  // Cai Bang
  277: { f: 'fx/st_30.webp', n: 15, w: 68,  h: 41,  ax: 29,  ay: 56,  ms: 80,  pos: 'body', fac: 'gaibang', m: 'buff' },
  130: { f: 'fx/st_16.webp', n: 16, w: 130, h: 98,  ax: 68,  ay: 83,  ms: 75,  pos: 'body', fac: 'gaibang', m: 'buff' },
  // Skill nang cap chuyen sinh (st2_*): gate theo f cua skill
  55:  { f: 'fx/st2_55.webp',  n: 30, w: 31,  h: 35, ax: 16, ay: 117, ms: 67,  pos: 'head', fac: null, m: 'auto' },
  57:  { f: 'fx/st2_57.webp',  n: 30, w: 31,  h: 36, ax: 16, ay: 115, ms: 67,  pos: 'head', fac: null, m: 'auto' },
  76:  { f: 'fx/st2_76.webp',  n: 20, w: 33,  h: 28, ax: 13, ay: 88,  ms: 100, pos: 'head', fac: null, m: 'auto' },
  146: { f: 'fx/st2_146.webp', n: 15, w: 73,  h: 54, ax: 38, ay: 32,  ms: 67,  pos: 'foot', fac: null, m: 'auto' },
  149: { f: 'fx/st2_149.webp', n: 15, w: 42,  h: 58, ax: 22, ay: 123, ms: 50,  pos: 'head', fac: null, m: 'auto' },
  208: { f: 'fx/st2_208.webp', n: 15, w: 71,  h: 57, ax: 37, ay: 33,  ms: 80,  pos: 'foot', fac: null, m: 'auto' },
  211: { f: 'fx/st2_211.webp', n: 30, w: 74,  h: 57, ax: 38, ay: 30,  ms: 50,  pos: 'foot', fac: null, m: 'auto' },
  226: { f: 'fx/st2_226.webp', n: 16, w: 76,  h: 53, ax: 38, ay: 30,  ms: 75,  pos: 'foot', fac: null, m: 'aura146' },
  281: { f: 'fx/st2_281.webp', n: 20, w: 75,  h: 65, ax: 37, ay: 75,  ms: 100, pos: 'body', fac: null, m: 'auto' },
  333: { f: 'fx/st2_333.webp', n: 20, w: 111, h: 64, ax: 56, ay: 30,  ms: 100, pos: 'foot', fac: null, m: 'auto' },
};

/* Pool tra cu aura bua hai tren quai (nguon tm: Vp[a]||Up[a]||$p[a]) */
const CURSE_POOL = new Set([64, 67, 69, 70, 72, 73, 356, 390, 136, 137, 140, 143, 150, 364, 391, 171, 173, 174, 175, 178, 90, 392, 393, 394]);

function auraOn(id, m) {
  if (m === 'aura146') return skillAuraEnabled(146);           // nguon Kp: 226 kiem tra vong sang 146
  const s = SK[id]; if (!s) return false;
  const k = m === 'auto' ? skKind(s) : m;
  if (k === 'buff') return skillBuffActive(id);
  if (k === 'aura') return skillAuraEnabled(id);
  return k === 'passive';                                      // passive: da hoc la ve (nguon ql)
}

function drawOne(c, d, x, y, scale, now, alpha, hero) {
  const im = img(d.f);
  if (!im || !im.complete || !im.naturalWidth) return;
  const fr = Math.floor((now * 1000 / d.ms) % d.n);
  const lift = hero && d.pos === 'head' ? (d.lift ?? 30) : 0;  // Ip nguon = 30, khong nhan scale
  c.save();
  c.globalAlpha = alpha;
  c.drawImage(im, fr * d.w, 0, d.w, d.h, x - d.ax * scale, y - d.ay * scale - lift, d.w * scale, d.h * scale);
  c.restore();
}

/* Vong sang cua nhan vat — goi 2 lan: layer 'under' (aura chan, truoc nhan vat) va
   'over' (aura than/dau, sau nhan vat). scale = HERO_SCALE * 0.6 nhu nguon (tf*.6). */
export function drawAuras(c, layer: 'under' | 'over', x, y, scale) {
  if (!S.fac || !R.P || R.deadT > 0) return;
  const under = layer === 'under';
  const now = R.skillClock || 0;
  const picked = [];
  const usedFile = new Set();
  const emeiPool = [];
  for (const id in AUR) {
    const d = AUR[id], sid = +id;
    if (d.pos === 'foot' !== under) continue;
    if ((d.fac || (SK[sid] && SK[sid].f)) !== S.fac) continue;
    if (!S.sk[sid] || !auraOn(sid, d.m)) continue;
    if (S.fac === 'emei' && d.fac === 'emei') { emeiPool.push({ d, id: sid }); continue; }
    if (usedFile.has(d.f)) continue;
    usedFile.add(d.f);
    picked.push(d);
  }
  if (emeiPool.length) {
    emeiPool.sort((a, b) => ((SK[b.id] && SK[b.id].req) || 0) - ((SK[a.id] && SK[a.id].req) || 0));
    const perPos = {};
    for (const it of emeiPool) {
      const arr = perPos[it.d.pos] || (perPos[it.d.pos] = []);
      if (arr.length >= 3 || arr.includes(it.d.f) || usedFile.has(it.d.f)) continue;
      arr.push(it.d.f);
      usedFile.add(it.d.f);
      picked.push(it.d);
    }
  }
  for (const d of picked) drawOne(c, d, x, y, scale, now, d.a ?? .9, true);
}

/* Aura bua hai tren quai (nguon tm): mo bua hai nao co sprite thi ve, alpha lan dan
   theo thoi gian con lai (1.5s cuoi). Goi 1 lan sau khi ve quai. */
export function drawCurseAuras(c, e, x, y, scale) {
  if (!e.curse) return;
  const now = R.skillClock || 0;
  const used = new Set();
  for (const id in e.curse) {
    const until = e.curse[id];
    if (!(until > now)) continue;
    const d = AUR[+id];
    if (!d || !CURSE_POOL.has(+id) || used.has(d.pos)) continue;
    used.add(d.pos);
    drawOne(c, d, x, y, scale, now, Math.min(.9, (until - now) / 1.5), false);
  }
}

// @ts-nocheck — module la chi nhap J (du lieu), khong nhap save/recipes
// (tránh vòng module: recipes → sets → save → recipes).
import { J } from './core';

/* ======================= BO THIEN CUC — Tháp II cap 200 (upstream v107) =======================
   Bo Đằng Long (Hoàng Kim cap 180) la nen cua bo Thiên Cực:
   - Nền: mọi mon Đằng Long cap 180 manh hon 1.25× (localPowerScale — rebalance v107).
   - Hoàng Kim Thiên Cực (Tháp II tầng 50+): doi ten, grp 10000+, yeu cau cap 200,
     nhan them ×1.25 tren nen (= 1.5625×).
   - Bạch Kim Thiên Cực: bo Bạch Kim cung gia dinh (cung grp goc, d/k/s, req),
     ten theo phiên bản Hoàng Kim để Lò Huyền Tinh nhan dien công thuc (2 món giống nhau),
     sức manh ×1.25. */
const TC_M = 1.25;

const reqOfRow = (r, id) => {
  const q = r.req.find(x => x[0] === id);
  return q ? q[1] : -1;
};
const sameReqs = (a, b) => {
  const fa = a.req.filter(x => x[0] !== 36), fb = b.req.filter(x => x[0] !== 36);
  return fa.length === fb.length && fa.every((x, i) => x[0] === fb[i][0] && x[1] === fb[i][1]);
};
const remapReq = req => req.map(([id, v]) => [id, id === 36 ? 200 : v]);

/* Nền: Đằng Long cap 180 manh hơn 25% (cả bo thường lưa lam nen cho Thiên Cực). */
for (const r of J.sets.gold) {
  if (r.n.startsWith('Đằng Long') && reqOfRow(r, 36) >= 180) r.localPowerScale = TC_M;
}

/* Hoàng Kim Thiên Cực — dong sinh tu bo Đằng Long (xem sets.ts TOWER2_SET_ROWS cu). */
export const TOWER2_SET_ROWS = J.sets.gold
  .filter(r => r.n.startsWith('Đằng Long') && reqOfRow(r, 36) >= 180)
  .map(r => Object.assign({}, r, {
    n: r.n.replace(/^Đằng Long/, 'Thiên Cực'),
    grp: 10000 + r.grp,
    tower2: true,
    req: remapReq(r.req),
    localPowerScale: (r.localPowerScale || 1) * TC_M,
  }));

/* Bạch Kim Thiên Cực — tim bo Bạch Kim cung gia dinh (grp goc + d/k/s + req),
   gan ten phien bản Hoàng Kim để platByBase (recipes.ts) khop voi ten do vang. */
export const TOWER2_PLATINA_ROWS = TOWER2_SET_ROWS.map(g => {
  const p = J.sets.platina.find(pr =>
    pr.grp === g.grp - 10000 && pr.d === g.d && pr.k === g.k && pr.s === g.s
    && reqOfRow(pr, 39) === reqOfRow(g, 39) && sameReqs(pr, g));
  if (!p) return null;
  return Object.assign({}, p, {
    n: g.n,
    grp: 10000 + p.grp,
    tower2: true,
    req: remapReq(p.req),
    localPowerScale: (p.localPowerScale || 1) * TC_M,
  });
}).filter(Boolean);

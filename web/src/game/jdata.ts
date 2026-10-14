/* ======================= DU LIEU GAME (goi assets OTA) =======================
   Toan bo bang du lieu port tu vanilla JS gio nam trong game/jdata/*.json (thu muc
   `jdata` thuoc goi `assets` OTA) thay vi bi bien dich vao chunk JS cua goi `data`.
   Doi bang can bang / hieu ung / am thanh khong con phai tai lai ca goi code.

   loadJData() duoc app/page.tsx cho chay XONG truoc khi import App — nho vay core.ts
   van dung duoc chi muc ngay luc module-init (J/W da co du lieu), khong phai chuyen
   sang khoi tao luoi. loop.boot() cung await lai cho chac (promise da xong -> tra ngay).

   Thieu file (media chua tai, ban web cu) -> giu gia tri rong; core.ts co guard `|| []`
   nen game van khoi dong, chi thieu du lieu tuong ung. */
'use strict';

export const JX: any = {};                                  // vat pham, ky nang, quai, bang cap
export const JW: any = {};                                  // vung, ban do, chi so quai theo vung
export const JFX: any = { m: {}, s: {}, c: {}, f: {} };      // hieu ung chieu
export const JMO: any = {};                                  // vat can ban do
export const JS: any = { music: {}, npc: {}, skill: {}, ui: {} };  // nhac + am thanh
export const JX_VI: any = { names: {}, attributeLabels: {}, skillNames: {}, attributeDescriptionOverrides: {} };  // dich Han -> Viet (upstream window.JX_VI)

const TARGETS: [string, any][] = [
  ['/jdata/jx.json', JX],
  ['/jdata/jw.json', JW],
  ['/jdata/jfx.json', JFX],
  ['/jdata/jmo.json', JMO],
  ['/jdata/jsnd.json', JS],
  ['/jdata/jxvi.json', JX_VI],
];

async function getJson(url: string, ms = 15000): Promise<any> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);          // mang cham / file thieu: khong treo man hinh cho
  try {
    const r = await fetch(url, { signal: ac.signal, cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let inflight: Promise<void> | null = null;
/* Bang cap (port upstream 2026-10-11): upstream regenerate toa bo
   bang exp bang cong thuc idle khi nap — bang nhung 200 entry trong
   jdata la du lieu goc JX1 bi ghi de; cap 9999 entry de len den
   cap 1000 (MAX_LEVEL). Cong thuc: floor(100 * n^2.2 * (1 + n/500)). */
const EXP_TABLE_SIZE = 9999;
export function loadJData(): Promise<void> {
  if (!inflight) {
    inflight = Promise.all(TARGETS.map(async ([url, dst]) => {
      const data = await getJson(url);
      if (data && typeof data === 'object') Object.assign(dst, data);   // giu nguyen dinh danh object da export
    })).then(() => {
      if (!Array.isArray(JX.exp) || JX.exp.length < EXP_TABLE_SIZE) {
        JX.exp = Array.from({ length: EXP_TABLE_SIZE }, (_, t) => {
          const n = t + 1;
          return Math.floor(100 * Math.pow(n, 2.2) * (1 + n / 500));
        });
      }
      /* Nguon: window.JX_VI = {...}; Object.assign(window.JX.attrDesc, JX_VI.attributeDescriptionOverrides)
         (5 mo ta "Sat thuong ky nang he Kim/Moc/Thuy/Hoa/Tho"). Ta gan vao JX_VI da export
         + expose window.JX_VI cho chat.ts viMessage (dich tin nhan chua ten Han). */
      if (JX_VI.attributeDescriptionOverrides && JX.attrDesc) {
        Object.assign(JX.attrDesc, JX_VI.attributeDescriptionOverrides);
      }
      if (typeof window !== 'undefined') (window as unknown as { JX_VI?: unknown }).JX_VI = JX_VI;
    });
  }
  return inflight;
}

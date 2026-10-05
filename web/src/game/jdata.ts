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

const TARGETS: [string, any][] = [
  ['/jdata/jx.json', JX],
  ['/jdata/jw.json', JW],
  ['/jdata/jfx.json', JFX],
  ['/jdata/jmo.json', JMO],
  ['/jdata/jsnd.json', JS],
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
export function loadJData(): Promise<void> {
  if (!inflight) {
    inflight = Promise.all(TARGETS.map(async ([url, dst]) => {
      const data = await getJson(url);
      if (data && typeof data === 'object') Object.assign(dst, data);   // giu nguyen dinh danh object da export
    })).then(() => undefined);
  }
  return inflight;
}

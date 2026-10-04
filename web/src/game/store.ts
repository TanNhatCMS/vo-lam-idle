/* ======================= STORE NHO: cau noi engine <-> React =======================
   Game chay bang trang thai mutable (S, R, H... trong cac module engine) giong ban goc.
   React doc truc tiep trang thai khi render; uiBump() bao React ve lai cac thanh phan HUD
   theo tick 10Hz cua vong game (loop.js uiPump). Khong dung state Redux/Context vi phai
   giu dung hanh vi idle 60 buoc/giay cua ban goc. */
let version = 0;
const listeners = new Set<() => void>();
export function uiBump() { version++; for (const l of listeners) l(); }
export function uiSubscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function uiVersion() { return version; }

/* tab hien tai cua bang thong tin (log/char/skill/inv/more) */
let tab = 'log';
export function uiGetTab() { return tab; }
export function uiSetTab(t) { if (t !== tab) { tab = t; uiBump(); } }

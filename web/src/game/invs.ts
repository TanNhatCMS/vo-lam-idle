// @ts-nocheck — chuyen tu vanilla JS: bat lai check tung file dan dan (xem README muc TypeScript)
/* So o hanh trang: o day (khong phai core.ts) vi core.ts phai giu nhap ngan (jdata/mapobs).
   Neu core nhap save/shop, chu ky module se dat sets.ts (dung J ngay luc module-init) truoc khi
   core khoi tao xong -> "Cannot access 'J' before initialization". */
import { INV_EXPANSION_MAX, INV_EXPANSION_STEP, INV_MAX, clamp } from './core';
import { potSlotsUsed } from './shop';
import { S } from './save';

export const invExpansionCount = () => clamp(Math.floor(+(S && S.invExpansions) || 0), 0, INV_EXPANSION_MAX);
export const invMax = () => INV_MAX + INV_EXPANSION_STEP * invExpansionCount();
export const invUsed = () => S.inv.length + (typeof potSlotsUsed === 'function' ? potSlotsUsed() : 0);

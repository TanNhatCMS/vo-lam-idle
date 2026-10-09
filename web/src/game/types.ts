/* ======================= KIỂU DỮ LIỆU DÙNG CHUNG =======================
   Game port từ vanilla JS với trạng thái mutable toàn cục (S, R, H...).
   Các interface dưới đây dùng index signature [k: string]: any để phản ánh đúng
   phong cách "thuộc tính thêm động giữa các module" của engine, đồng thời khai báo
   sẵn những trường được dùng nhiều nhất để UI có gợi ý kiểu.
   Bật strict dần: siết từng trường ở đây là nơi bắt đầu. */

/* Nhân vật đã lưu (localStorage 'jxidle*') — trường gốc xem save.ts newSave() */
export interface SaveState {
  [k: string]: any;
  v?: number;
  name: string;
  fac: string | null;
  sex: 0 | 1;
  sexSet?: boolean;
  lvl: number;
  xp: number;
  gold: number;
  attrPts: number;
  attr: { str: number; dex: number; vit: number; eng: number };
  skPts: number;
  sk: Record<number, number>;
  main: number;
  mainLock?: boolean;
  eq: Record<string, Item | undefined>;
  inv: Item[];
  stage: number;
  maxStage: number;
  wave: number;
  push: boolean;
  uid: number;
  autoEquip: boolean;
  autoPts: boolean | undefined;
  autoJunk?: boolean;
  autoForge?: boolean;
  autoBuy?: boolean;
  diff: number;
  tut: number;
  potOff: boolean;
  potUsed: number;
  potStock: { life: Record<string, number>; mana: Record<string, number> };
  ctrl: 'auto' | 'manual';
  joy?: 'fixed' | 'float';
  inputMode?: 'joy' | 'mouse';
  slots: number[];
  snd: { on: boolean; vol: number; music: boolean; mvol: number };
  lootF: { minRar: number; minLvl: number; groups: number[]; series: number[]; auto: boolean; always: boolean };
  ground: any[];
  mats: { ht: Record<string, number>; ore: Record<string, number>; shard: Record<string, number>; misc: Record<string, number> };
  last: number;
  lowFx?: boolean;
  rot?: boolean;
  fieldMode?: boolean;
  autoFind?: boolean;
  autoBossPriority?: boolean;
  autoRange?: 'near' | 'medium' | 'far';
  autoSkillSlots?: boolean[];
  autoHpPotion?: boolean;
  hpPotionAt?: number;
  autoMpPotion?: boolean;
  mpPotionAt?: number;
  autoTownHp?: boolean;
  townHpAt?: number;
}

/* Trang bị/nhân vật trên sân (H) */
export interface Hero {
  [k: string]: any;
  x: number;
  y: number;
  fac?: string;
}

/* Vật phẩm */
export interface Item {
  [k: string]: any;
  uid: number;
  d: number;      // chỉ số loại đồ trong J.items
  lvl: number;    // cấp đồ
  r: number;      // độ hiếm 0-5
  s: number;      // hệ (-1 nếu không)
  n: string;
  ic?: string;
  enh?: number;
  plv?: number;
  vio?: number;
  set?: number;
  mag: any[];
}

/* Trạng thái chiến đấu toàn cục (R trong combat.ts) — nhiều trường thêm động khi chơi */
export interface GameState {
  [k: string]: any;
  corpses: any[];
  lootWait: number;
  ground: any[];
  pickTarget: any;
  enemies: any[];
  P: any;
  life: number;
  mana: number;
  atkT: number;
  deadT: number;
  spawnT: number;
  kills: number;
  t0: number;
  logs: string[];
  fx: any[];
  txt: any[];
  dirty: boolean;
  stall: number;
  farm: number;
  quiet?: boolean;
  logDirty?: boolean;
  town?: boolean;
  petPos?: any;
  petLoot?: any;      // mon tren dat ma Dong hanh dang di nhat thay nguoi (loot.ts dat, rewards.petTick di chuyen)
}

/* Trạng thái màn Luyện Công (survival.ts) */
export interface SurvivalState {
  [k: string]: any;
  on: boolean;
}

/* Đầu vào (joystick/bàn phím/tay cầm) */
export interface InputState {
  [k: string]: any;
  active: boolean;
  id: number | null;
  fromJoy: boolean;
  ox: number;
  oy: number;
  x: number;
  y: number;
  moved: boolean;
  keys: Record<string, boolean>;
  target: { x: number; y: number } | null;
}

'use client';

import dynamic from 'next/dynamic';
import { loadJData } from '../game/jdata';

/* Game là SPA thuần client: canvas, requestAnimationFrame, localStorage, DOM island —
   không thể SSR. dynamic + ssr:false để bản static export vẫn prerender khung trang.
   Dữ liệu game (game/jdata/*.json, gói assets OTA) phải nạp XONG trước khi import App:
   core.ts dựng chỉ mục J/W ngay lúc module-init nên JX/JW phải có sẵn. */
const Game = dynamic(() => loadJData().then(() => import('../App')), { ssr: false });

export default function Page() {
  return <Game />;
}

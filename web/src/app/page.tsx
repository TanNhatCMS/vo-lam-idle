'use client';

import dynamic from 'next/dynamic';

/* Game là SPA thuần client: canvas, requestAnimationFrame, localStorage, DOM island —
   không thể SSR. dynamic + ssr:false để bản static export vẫn prerender khung trang. */
const Game = dynamic(() => import('../App'), { ssr: false });

export default function Page() {
  return <Game />;
}

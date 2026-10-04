import React from 'react';
import { useGameTick } from './useGameTick';
import { W, J, FAC, fmt, WAVES } from '../game/core';
import { R } from '../game/combat';
import { S } from '../game/save';

import { nameModal } from '../game/ui';
import { giftModal } from '../game/rewards';
import { uiSfx } from '../game/audio';
import { setCompact } from '../game/loop';

/* Thanh tren: cap, ten, kinh nghiem, ngan luong — ve theo tick thay cho updateTop() ban goc. */
export default function TopBar() {
  useGameTick();
  const fac = (S && S.fac) ? FAC[S.fac] : null;
  const need = fac ? (J.exp[S.lvl - 1] || 1) : 1;
  const xpPct = fac ? (S.xp / need * 100) : 0;
  const heroImg = fac ? ((W.hero || {})[S.fac] || {}).img : null;
  const facName = fac ? fac.n : 'Võ Lâm Idle';
  const displayName = fac && S.name && S.name !== fac.n ? S.name : facName;
  return (
    <header id="top">
      <div className="lvbox" style={(heroImg ? { '--pl': `url('${heroImg}')` } : undefined) as React.CSSProperties}
        onClick={() => { if (fac) nameModal(false); }}>
        <span id="lv">{fac ? S.lvl : 1}</span>
      </div>
      <div className="topmid">
        <div className="row">
          <b id="heroName">{fac && S.name && S.name !== fac.n ? <><small>{facName}</small>{displayName}</> : displayName}</b>
          <span id="stageLbl">{fac ? `Ải ${S.stage} · đợt ${S.wave}/${WAVES}` : ''}</span>
        </div>
        <div className="bar xp">
          <i id="xpBar" style={{ width: xpPct + '%' }} />
          <span id="xpTxt">{fac ? `${xpPct.toFixed(1)}%` : ''}</span>
        </div>
      </div>
      <div className="gold"><span className="coin" /><span id="gold">{fac ? fmt(S.gold) : 0}</span></div>
      <button id="giftBtn" title="Phần thưởng" onClick={() => { if (fac) { uiSfx('click'); giftModal(); } }}>🎁</button>
      <button id="compactBtn" title="Thu gọn / mở rộng sân đấu"
        onClick={() => setCompact(!document.body.classList.contains('compact'))}>⛶</button>
    </header>
  );
}

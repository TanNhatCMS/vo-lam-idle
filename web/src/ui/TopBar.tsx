import React from 'react';
import { useGameTick } from './useGameTick';
import { W, J, FAC, fmt, WAVES } from '../game/core';
import { R } from '../game/combat';
import { S } from '../game/save';

import { nameModal, showTab } from '../game/ui';
import { giftModal } from '../game/rewards';
import { adminModal } from '../game/admin';
import { uiSfx } from '../game/audio';
import { setCompact } from '../game/loop';

/* Thanh tren: khung giong 1:1 index.html ban vinarpg (hero-mark + status-frame 3 thanh
   EXP/HP/MP + Luc Chien) de style.css moi thao tac dung phan tu. Ve theo tick thay cho updateTop(). */
export default function TopBar() {
  useGameTick();
  const fac = (S && S.fac) ? FAC[S.fac] : null;
  const need = fac ? (J.exp[S.lvl - 1] || 1) : 1;
  const xpPct = fac ? (S.xp / need * 100) : 0;
  const heroImg = fac ? ((W.hero || {})[S.fac] || {}).img : null;
  const facName = fac ? fac.n : 'Võ Lâm Idle';
  const displayName = fac && S.name && S.name !== fac.n ? S.name : facName;
  /* HUD Dong hanh: so loai so huu + hoi chieu ky nang (docs/PET-MO-RONG.md) */
  const petN = fac && S.rw && S.rw.pets ? Object.keys(S.rw.pets).length : 0;
  const pet = fac && S.rw && S.rw.pet;
  const skillUnlocked = !!(pet && (pet.star | 0) >= 1);
  const cd = R.petSkillCd || 0;
  const P = R.P;
  return (
    <header id="top">
      <div className="hero-mark">
        <div className="lvbox" style={(heroImg ? { '--pl': `url('${heroImg}')` } : undefined) as React.CSSProperties}
          onClick={() => { if (fac) nameModal(false); }} />
        <span className="hero-level" aria-label="Cấp nhân vật"><span>Cấp</span><b>{fac ? S.lvl : 1}</b></span>
      </div>
      <div className="topmid">
        <div className="row">
          <span className="hero-identity"><b id="heroName">{fac && S.name && S.name !== fac.n ? <><small>{facName}</small>{displayName}</> : displayName}</b></span>
          <span id="stageLbl">{fac ? `Ải ${S.stage} · đợt ${S.wave}/${WAVES}` : ''}</span>
          <span className="top-power" aria-label="Lực Chiến"><span>Lực Chiến</span><b id="topPowerValue">{fac && P ? fmt(R.power) : 0}</b></span>
        </div>
        <div id="hud" className="status-frame">
          <div className="bar xp"><i id="xpBar" style={{ width: xpPct + '%' }} /><span className="bar-label">EXP</span><span id="xpTxt">{fac ? `${xpPct.toFixed(1)}%` : ''}</span></div>
          <div className="bar hp"><i id="hpBar" style={{ width: (fac && P ? clamp01(R.life / P.life) * 100 : 0) + '%' }} /><span className="bar-label">HP</span><span id="hpTxt">{fac && P ? `${fmt(R.life)} / ${fmt(P.life)}` : ''}</span></div>
          <div className="bar mp"><i id="mpBar" style={{ width: (fac && P ? clamp01(R.mana / P.mana) * 100 : 0) + '%' }} /><span className="bar-label">MP</span><span id="mpTxt">{fac && P ? `${fmt(R.mana)} / ${fmt(P.mana)}` : ''}</span></div>
        </div>
      </div>
      <div className="gold"><img className="coin" src="ui/yuanbao.png" alt="" aria-hidden="true" /><span id="gold">{fac ? fmt(S.gold) : 0}</span></div>
      {petN > 0 && (
        <button id="petChip" title="Đồng hành — bấm để mở thẻ"
          onClick={() => { uiSfx('click'); showTab('pet'); }}>🐾{petN}{skillUnlocked
            ? <small>{cd > 0 ? Math.ceil(cd) + 's' : '⚡'}</small> : null}
        </button>
      )}
      <button id="adminQuickBtn" title="Bảng thử nghiệm" onClick={() => { if (fac) { uiSfx('click'); adminModal(); } }}>⚡</button>
      <button id="giftBtn" title="Phần thưởng" onClick={() => { if (fac) { uiSfx('click'); giftModal(); } }}>🎁</button>
      <button id="compactBtn" title="Thu gọn / mở rộng sân đấu"
        onClick={() => setCompact(!document.body.classList.contains('compact'))}>⛶</button>
    </header>
  );
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

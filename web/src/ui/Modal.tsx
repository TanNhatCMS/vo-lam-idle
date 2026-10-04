import React from 'react';
import { closeModal } from '../game/ui';

/* Khung hop thoai. Noi dung (#mBody) la island — ui.js modal() ghi innerHTML nhu ban goc;
   class hidden cung do engine toggle (modal/closeModal) nen React giu nguyen const. */
export default function Modal() {
  return (
    <div id="modal" className="hidden" role="dialog" aria-modal="true"
      onClick={e => { if ((e.target as HTMLElement).id === 'modal') closeModal(); }}>
      <div className="mbox" tabIndex={-1}>
        <button className="mx" id="mClose" onClick={() => closeModal()}>✕</button>
        <div id="mBody" />
      </div>
    </div>
  );
}

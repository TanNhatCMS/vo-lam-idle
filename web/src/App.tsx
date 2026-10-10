'use client';

import React, { useEffect } from 'react';
import './game/consolelog';   // hook nhat ky console — phai import TRUOC moi module game khac
import { boot } from './game/loop';
import TopBar from './ui/TopBar';
import Battle from './ui/Battle';
import Panel from './ui/Panel';
import TabsNav from './ui/TabsNav';
import Modal from './ui/Modal';
import Toast from './ui/Toast';

/* Hien loi render len man hinh (WebView thuc khong co DevTools — trang trang la bao khong tim duoc loi) */
function showFatal(e: unknown) {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;inset:auto 8px 8px 8px;z-index:99999;background:#300;color:#fdd;padding:8px;font-size:11px;white-space:pre-wrap;max-height:40vh;overflow:auto';
  box.textContent = '[loi render] ' + ((e as Error)?.stack || String(e));
  document.body.appendChild(box);
}

/* Khung app giong 1:1 index.html ban goc (id + class de style.css va cac module engine
   van thao tac dung phan tu). Nhom "island" (#mBody, #toast, #svHud, #svBar, #t-*)
   React chi tao khong rong — engine ghi innerHTML/textContent vao do nhu ban goc. */
export default function App() {
  useEffect(() => {
    const onErr = (e: ErrorEvent) => {
      if (document.getElementById('app') && !document.getElementById('app')!.childElementCount) showFatal(e.error || e.message);
    };
    window.addEventListener('error', onErr);
    boot();
    return () => window.removeEventListener('error', onErr);
  }, []);
  return (
    <div id="app">
      <TopBar />
      <Battle />
      <aside id="worldChat" aria-label="Chat thế giới" />
      <Panel />
      <TabsNav />
      <Modal />
      <Toast />
    </div>
  );
}

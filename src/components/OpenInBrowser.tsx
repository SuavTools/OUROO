'use client';

import { useEffect, useState } from 'react';

const APP_URL = 'https://ouroo.vercel.app';

// Detect in-app browsers (Instagram / Facebook / TikTok webviews) where orientation is locked
// and PWA install is blocked — the experience people get when tapping a link in Instagram.
function detect() {
  if (typeof navigator === 'undefined') return { inApp: false, ios: false, android: false, name: '' };
  const ua = navigator.userAgent || '';
  const ios = /iphone|ipad|ipod/i.test(ua);
  const android = /android/i.test(ua);
  let name = '';
  if (/Instagram/i.test(ua)) name = 'Instagram';
  else if (/FBAN|FBAV|FB_IAB/i.test(ua)) name = 'Facebook';
  else if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) name = 'TikTok';
  return { inApp: !!name, ios, android, name };
}

export function OpenInBrowser() {
  const [env, setEnv] = useState<ReturnType<typeof detect> | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const e = detect();
    setEnv(e);
    setDismissed(sessionStorage.getItem('ouroo_iab') === '1');
  }, []);

  if (!env?.inApp || dismissed) return null;

  const close = () => { sessionStorage.setItem('ouroo_iab', '1'); setDismissed(true); };

  const openExternal = () => {
    if (env.android) {
      // Android: hand the URL to Chrome directly.
      window.location.href = `intent://ouroo.vercel.app/#Intent;scheme=https;package=com.android.chrome;end`;
    } else {
      // iOS can't be forced from a webview — copy the link so they can paste in Safari.
      copy();
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(APP_URL); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  return (
    <div className="relative z-50 bg-brandRed text-black px-4 py-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.6rem)' }}>
      <button onClick={close} className="absolute top-2 right-3 text-black/50 hover:text-black text-lg leading-none" style={{ top: 'calc(env(safe-area-inset-top) + 0.3rem)' }}>✕</button>
      <p className="font-bold text-sm leading-snug pr-6">Estás no navegador do {env.name} — o ecrã não roda e não dá para instalar a app. 🚫</p>
      {env.ios ? (
        <p className="text-[13px] mt-1 leading-snug">
          Toca nos <b>três pontos (⋯)</b> no canto e escolhe <b>“Abrir no navegador”</b>.
          {' '}Ou <button onClick={copy} className="underline font-bold">copia o link</button> e abre no Safari.
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button onClick={openExternal} className="bg-black text-white font-bold uppercase text-xs tracking-widest px-4 py-2 active:scale-95">Abrir no Chrome →</button>
          <button onClick={copy} className="border border-black/40 font-bold uppercase text-xs tracking-widest px-3 py-2 active:scale-95">Copiar link</button>
        </div>
      )}
      {copied && <p className="text-[12px] font-bold mt-1">✓ Link copiado — cola no teu navegador.</p>}
    </div>
  );
}

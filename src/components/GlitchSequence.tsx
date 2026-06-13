'use client';

// A full-screen glitch + terminal-code takeover, triggered by an admin-authored marker (on room enter
// or at a coordinate). The editable text is typed out as terminal output over a glitching backdrop.
// Click anywhere (or the prompt, once done) to dismiss.

import { useEffect, useRef, useState } from 'react';

export function GlitchSequence({ text, onClose }: { text: string; onClose: () => void }) {
  const lines = text.split('\n');
  const [shown, setShown] = useState<string[]>([]);
  const [partial, setPartial] = useState('');
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let li = 0, ci = 0; const acc: string[] = [];
    const tick = () => {
      if (li >= lines.length) { setDone(true); return; }
      const line = lines[li];
      if (ci < line.length) { ci++; setPartial(line.slice(0, ci)); timer.current = setTimeout(tick, 10 + Math.random() * 22); }
      else { acc.push(line); setShown([...acc]); setPartial(''); ci = 0; li++; timer.current = setTimeout(tick, line === '' ? 60 : 130); }
    };
    timer.current = setTimeout(tick, 220);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="fixed inset-0 z-[120] bg-black overflow-hidden cursor-pointer select-none" onClick={onClose}
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
      {/* glitch tear bands */}
      <div className="ouroo-gl ouroo-gl1" />
      <div className="ouroo-gl ouroo-gl2" />
      {/* scanlines + flicker */}
      <div className="pointer-events-none absolute inset-0 ouroo-flick" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,255,120,0.05) 0px, rgba(0,255,120,0.05) 1px, transparent 1px, transparent 3px)' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 45%, rgba(0,40,10,0.0), rgba(0,0,0,0.55) 80%)' }} />

      <div className="relative h-full w-full px-6 sm:px-10 font-mono text-[12px] sm:text-[14px] leading-relaxed text-[#39ff77] overflow-hidden ouroo-jit">
        <div className="max-w-3xl">
          {shown.map((l, i) => <p key={i} className="ouroo-rgb whitespace-pre-wrap break-words" data-t={l}>{l || ' '}</p>)}
          {!done && <p className="ouroo-rgb whitespace-pre-wrap break-words">{partial}<span className="inline-block w-2 h-4 -mb-0.5 bg-[#39ff77] ml-0.5 animate-pulse" /></p>}
        </div>
        {done && <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-[0.3em] text-[#39ff77]/70 animate-pulse">▸ press to continue</p>}
      </div>

      <style>{`
        @keyframes ouroo-glj { 0%,100%{transform:translateX(0);opacity:.0} 7%{transform:translateX(-12px);opacity:.5} 8%{transform:translateX(8px)} 9%{transform:translateX(0);opacity:0} 53%{opacity:0} 55%{transform:translateY(6px);opacity:.4} 57%{transform:translateY(0);opacity:0} }
        @keyframes ouroo-jit { 0%,100%{transform:translate(0,0)} 92%{transform:translate(0,0)} 94%{transform:translate(-3px,1px)} 96%{transform:translate(2px,-1px)} 98%{transform:translate(-1px,0)} }
        @keyframes ouroo-flick { 0%,100%{opacity:.5} 50%{opacity:.8} 53%{opacity:.3} 54%{opacity:.75} }
        .ouroo-gl{position:absolute;left:0;right:0;height:36%;mix-blend-mode:screen;pointer-events:none}
        .ouroo-gl1{top:18%;background:linear-gradient(90deg,rgba(255,0,80,.12),rgba(0,255,180,.12));animation:ouroo-glj 3.2s steps(1) infinite}
        .ouroo-gl2{top:55%;background:linear-gradient(90deg,rgba(0,180,255,.12),rgba(255,0,140,.12));animation:ouroo-glj 2.3s steps(1) infinite .7s}
        .ouroo-flick{animation:ouroo-flick 2.6s ease-in-out infinite}
        .ouroo-jit{animation:ouroo-jit 4s steps(1) infinite}
        .ouroo-rgb{text-shadow:-1.5px 0 rgba(255,0,80,.7), 1.5px 0 rgba(0,200,255,.7)}
      `}</style>
    </div>
  );
}

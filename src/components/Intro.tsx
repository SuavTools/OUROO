'use client';

import { useEffect, useRef, useState } from 'react';

// The cold-open: after the age gate, OURO (the Curator) boots up and inducts the new user into the
// quest before they ever see the site. Shown once per device. Canon lives in /LORE.md.
const SEEN = 'ouroo_intro_seen';
const AGE = 'ouroo_age_ok';

const SCRIPT: string[] = [
  '> OUROO // SIGNAL DETECTED',
  '> a new user. it has been a while.',
  '',
  'The people logged off. Nobody knows why.',
  'The machines kept the lights on. They always do.',
  '',
  'This is what is left — a world that forgets itself',
  'when no one is watching.',
  '',
  'You are signal now. Stay, and the Loop keeps turning.',
  'Mine crystals against the dark. Build.',
  'Remember the world into shape.',
  '',
  'Somewhere below, a door waits: the Terminal.',
  'Find the codes. Reach the core. It is yours if you do.',
];

export function Intro() {
  const [show, setShow] = useState(false);
  const [lines, setLines] = useState<string[]>([]);   // fully-typed lines
  const [partial, setPartial] = useState('');           // line currently typing
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show after the age gate clears (event), or immediately for a returning ager who hasn't seen it.
  useEffect(() => {
    let ok = false, seen = true;
    try { ok = localStorage.getItem(AGE) === '1'; seen = localStorage.getItem(SEEN) === '1'; } catch {}
    if (ok && !seen) setShow(true);
    const onProceed = () => { try { if (localStorage.getItem(SEEN) !== '1') setShow(true); } catch { setShow(true); } };
    window.addEventListener('ouroo:proceed', onProceed);
    return () => window.removeEventListener('ouroo:proceed', onProceed);
  }, []);

  // Typewriter: reveal SCRIPT line by line, character by character.
  useEffect(() => {
    if (!show || done) return;
    let li = 0, ci = 0;
    const acc: string[] = [];
    const tick = () => {
      if (li >= SCRIPT.length) { setDone(true); return; }
      const line = SCRIPT[li];
      if (ci < line.length) { ci++; setPartial(line.slice(0, ci)); timer.current = setTimeout(tick, 16 + Math.random() * 22); }
      else { acc.push(line); setLines([...acc]); setPartial(''); ci = 0; li++; timer.current = setTimeout(tick, line === '' ? 90 : 320); }
    };
    timer.current = setTimeout(tick, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [show, done]);

  if (!show) return null;

  const finish = () => { try { localStorage.setItem(SEEN, '1'); } catch {} setShow(false); };
  const skip = () => { if (timer.current) clearTimeout(timer.current); setLines(SCRIPT); setPartial(''); setDone(true); };

  return (
    <div className="fixed inset-0 z-[90] bg-black flex flex-col items-center justify-center px-6 overflow-hidden"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>
      {/* scanline wash */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 3px)' }} />
      {/* ambient signal glow */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 42%, rgba(0,207,255,0.10), transparent 60%)' }} />

      {!done && <button onClick={skip} className="absolute top-4 right-5 z-10 text-[11px] uppercase tracking-[0.2em] text-white/35 hover:text-white transition-colors" style={{ top: 'calc(env(safe-area-inset-top) + 1rem)' }}>skip ▸</button>}

      <div className="relative w-full max-w-xl font-mono text-[13px] sm:text-sm leading-relaxed">
        {lines.map((l, i) => (
          <p key={i} className={l.startsWith('>') ? 'text-[#00cfff]' : l === '' ? 'h-3' : 'text-white/80'}>{l || ' '}</p>
        ))}
        {!done && <p className={partial.startsWith('>') ? 'text-[#00cfff]' : 'text-white/80'}>{partial}<span className="inline-block w-2 h-4 -mb-0.5 bg-[#00cfff] ml-0.5 animate-pulse" /></p>}
      </div>

      {done && (
        <div className="relative mt-10 flex flex-col items-center gap-5 animate-[fadeIn_0.6s_ease]">
          <p className="font-helvetica font-black text-5xl sm:text-6xl tracking-tighter text-white">OUROO<span className="text-brandRed">.</span></p>
          <button onClick={finish} className="bg-brandRed text-black font-bold uppercase tracking-[0.3em] text-sm px-10 py-4 hover:bg-white transition-colors active:scale-95">Enter ▸</button>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">the loop runs warmer when someone is watching</p>
        </div>
      )}
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

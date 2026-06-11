'use client';

import { useEffect, useState } from 'react';

// First-visit age attestation. Self-declared 13+ is the accepted baseline for a
// game with chat under COPPA (US) / GDPR (EU). Stored locally so it shows once.
const KEY = 'ouroo_age_ok';

export function AgeGate() {
  const [passed, setPassed] = useState<boolean | null>(null); // null = not yet read (SSR / first paint)
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    try { setPassed(localStorage.getItem(KEY) === '1'); } catch { setPassed(true); }
  }, []);

  // Don't render anything until we know, and nothing once the gate is cleared.
  if (passed === null || passed) return null;

  const allow = () => {
    try { localStorage.setItem(KEY, '1'); } catch {}
    setPassed(true);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-6"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
      <div className="max-w-sm w-full border border-white/15 bg-black p-7 text-center space-y-5">
        <p className="font-helvetica font-black text-3xl tracking-tighter">OUROO<span className="text-brandRed">.</span></p>

        {blocked ? (
          <>
            <h2 className="font-helvetica font-black uppercase tracking-widest text-base text-white">Come back later</h2>
            <p className="text-sm text-white/60 leading-relaxed">You need to be 13 or older to play OUROO. Thanks for stopping by — see you when you’re old enough.</p>
            <button onClick={() => setBlocked(false)} className="text-[11px] uppercase tracking-widest text-white/40 hover:text-white">← Back</button>
          </>
        ) : (
          <>
            <h2 className="font-helvetica font-black uppercase tracking-widest text-base text-white">Are you 13 or older?</h2>
            <p className="text-sm text-white/60 leading-relaxed">OUROO has live chat and social rooms. You must be at least 13 to enter.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={allow} className="flex-1 bg-brandRed text-black font-bold uppercase text-xs tracking-widest py-3.5 active:scale-95 hover:bg-white transition-colors">Yes, I’m 13+</button>
              <button onClick={() => setBlocked(true)} className="px-5 border border-white/20 text-white/60 hover:text-white text-xs uppercase tracking-widest active:scale-95">No</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

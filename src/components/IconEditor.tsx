'use client';

import { useEffect, useState } from 'react';
import { ICON_SHAPES, ICON_PALETTE, MAX_ICON_LAYERS, emptyIcon, type IconLayer, type IconShape, type IconSpec, type CustomIcon } from '@/lib/icons';
import { buyIcon, mintIcon, ICON_PRICE, CURRENCY_SYMBOL, useWallet } from '@/lib/wallet';
import { amIModerator } from '@/lib/chat';
import { IconPreview } from '@/components/IconPreview';

const SHAPE_GLYPH: Record<IconShape, string> = {
  diamond: '◆', circle: '●', square: '■', triangle: '▲', star: '★', heart: '♥', ring: '◎', hex: '⬡',
};

// In-app procedural icon maker. Compose a few coloured shapes → mint it into your wallet for Cristais.
export function IconEditor({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (icon: CustomIcon) => void }) {
  const wallet = useWallet();
  const [spec, setSpec] = useState<IconSpec>(emptyIcon);
  const [sel, setSel] = useState(0);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [isMod, setIsMod] = useState(false);   // moderators mint icons for free
  useEffect(() => { if (open) amIModerator().then(setIsMod); }, [open]);

  if (!open) return null;
  const layer = spec.layers[sel] ?? spec.layers[0];
  const setLayer = (patch: Partial<IconLayer>) =>
    setSpec(s => ({ ...s, layers: s.layers.map((l, i) => (i === sel ? { ...l, ...patch } : l)) }));
  const addLayer = () => {
    if (spec.layers.length >= MAX_ICON_LAYERS) return;
    const n: IconLayer = { shape: 'circle', color: ICON_PALETTE[3], scale: 0.5, rot: 0, dx: 0, dy: 0 };
    setSpec(s => ({ ...s, layers: [...s.layers, n] }));
    setSel(spec.layers.length);
  };
  const delLayer = () => {
    if (spec.layers.length <= 1) return;
    setSpec(s => ({ ...s, layers: s.layers.filter((_, i) => i !== sel) }));
    setSel(Math.max(0, sel - 1));
  };

  const save = () => {
    setMsg(null);
    const res = isMod ? { ok: true as const, icon: mintIcon(name, spec) } : buyIcon(name, spec);
    if (!res.ok || !res.icon) { setMsg(res.error || 'Erro'); return; }
    onSaved?.(res.icon);
    setSpec(emptyIcon()); setSel(0); setName('');
    onClose();
  };

  const Slider = ({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) => (
    <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/50">
      <span className="w-12 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="flex-1 accent-brandYellow" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[80] bg-black/92 backdrop-blur-sm flex justify-center overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md min-h-full px-5" onClick={e => e.stopPropagation()}
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-helvetica font-black text-xl text-white">Criar Ícone</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none">✕</button>
        </div>

        {/* Live preview */}
        <div className="flex items-center justify-center mb-4">
          <div className="w-28 h-28 border border-white/15 bg-black/60 flex items-center justify-center">
            <IconPreview spec={spec} size={104} animate />
          </div>
        </div>

        {/* Layers */}
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto">
          {spec.layers.map((l, i) => (
            <button key={i} onClick={() => setSel(i)} title={l.shape}
              className={`shrink-0 w-9 h-9 border flex items-center justify-center text-base ${i === sel ? 'border-brandYellow text-brandYellow' : 'border-white/15 text-white/55'}`}>
              {SHAPE_GLYPH[l.shape]}
            </button>
          ))}
          {spec.layers.length < MAX_ICON_LAYERS && (
            <button onClick={addLayer} className="shrink-0 w-9 h-9 border border-white/15 text-white/55 hover:text-white text-lg">+</button>
          )}
          {spec.layers.length > 1 && (
            <button onClick={delLayer} className="shrink-0 w-9 h-9 border border-brandRed/40 text-brandRed/80 hover:text-brandRed ml-auto">🗑️</button>
          )}
        </div>

        {/* Shape picker */}
        <div className="grid grid-cols-8 gap-1 mb-3">
          {ICON_SHAPES.map(sh => (
            <button key={sh} onClick={() => setLayer({ shape: sh })}
              className={`aspect-square border flex items-center justify-center text-lg ${layer.shape === sh ? 'border-brandYellow text-brandYellow' : 'border-white/12 text-white/55 hover:text-white'}`}>
              {SHAPE_GLYPH[sh]}
            </button>
          ))}
        </div>

        {/* Colour */}
        <div className="grid grid-cols-12 gap-1 mb-3">
          {ICON_PALETTE.map(c => (
            <button key={c} onClick={() => setLayer({ color: c })} title={c}
              className={`aspect-square rounded-sm border ${layer.color === c ? 'border-white' : 'border-white/10'}`} style={{ background: c }} />
          ))}
        </div>

        {/* Transforms */}
        <div className="space-y-2 mb-4">
          <Slider label="Tam" value={layer.scale} min={0.2} max={1} step={0.05} onChange={v => setLayer({ scale: v })} />
          <Slider label="Rodar" value={layer.rot} min={0} max={1} step={0.02} onChange={v => setLayer({ rot: v })} />
          <Slider label="X" value={layer.dx} min={-1} max={1} step={0.05} onChange={v => setLayer({ dx: v })} />
          <Slider label="Y" value={layer.dy} min={-1} max={1} step={0.05} onChange={v => setLayer({ dy: v })} />
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/50">
            <input type="checkbox" checked={!!layer.spin} onChange={e => setLayer({ spin: e.target.checked })} className="accent-brandYellow" />
            Girar sozinho
          </label>
        </div>

        {/* Background */}
        <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1.5">Fundo</p>
        <div className="grid grid-cols-12 gap-1 mb-4">
          <button onClick={() => setSpec(s => ({ ...s, bg: null }))} title="sem fundo"
            className={`aspect-square rounded-sm border text-[10px] text-white/50 flex items-center justify-center ${!spec.bg ? 'border-white' : 'border-white/10'}`}>∅</button>
          {ICON_PALETTE.map(c => (
            <button key={c} onClick={() => setSpec(s => ({ ...s, bg: c }))} title={c}
              className={`aspect-square rounded-sm border ${spec.bg === c ? 'border-white' : 'border-white/10'}`} style={{ background: c }} />
          ))}
        </div>

        {/* Name + save */}
        <input value={name} onChange={e => setName(e.target.value)} maxLength={24} placeholder="Nome do ícone"
          className="w-full bg-white/5 border border-white/15 text-white px-3 py-2.5 text-sm outline-none focus:border-brandYellow mb-3" />
        <button onClick={save} disabled={!isMod && wallet.balance < ICON_PRICE}
          className="w-full bg-brandYellow text-black font-bold uppercase tracking-[0.15em] text-sm py-3 hover:bg-white transition-colors active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed">
          {isMod ? 'Criar ícone (grátis · mod)' : `Criar por ${CURRENCY_SYMBOL} ${ICON_PRICE}`}
        </button>
        <p className="text-[11px] text-center mt-2 text-white/40">{isMod ? 'Mods criam sem custo.' : `Tens ${CURRENCY_SYMBOL} ${wallet.balance.toLocaleString('pt-PT')}`}</p>
        {msg && <p className="text-[11px] text-center mt-1 text-brandRed">{msg}</p>}
      </div>
    </div>
  );
}

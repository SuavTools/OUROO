// Generative ambient room music — owned, royalty-free Web Audio. NO licensed tracks (the Spotify/
// YouTube embeds were removed for copyright; this is fully synthesized). In lore this is the SUAV
// signal — the carrier wave that holds the Loop together. A slow lo-fi pad + sparse arpeggio + optional
// bass pulse, with a per-room mood. Starts on a user gesture (browser autoplay), mutable, low volume.

type Mood = { scale: number[]; root: number; beatMs: number; wave: OscillatorType; cutoff: number; bass: boolean; gain: number };

// scale = semitone offsets; root = base frequency (Hz). Tuned per sector's vibe.
const MOODS: Record<string, Mood> = {
  praca:   { scale: [0, 2, 4, 7, 9],  root: 220, beatMs: 900,  wave: 'triangle', cutoff: 1400, bass: false, gain: 0.5 },  // calm, hopeful
  jardim:  { scale: [0, 2, 4, 7, 9],  root: 196, beatMs: 1100, wave: 'sine',     cutoff: 1050, bass: false, gain: 0.46 }, // serene, koto-ish
  clube:   { scale: [0, 3, 5, 7, 10], root: 165, beatMs: 440,  wave: 'sawtooth', cutoff: 1900, bass: true,  gain: 0.4 },  // loudest signal — a pulse
  archive: { scale: [0, 2, 3, 7, 8],  root: 174, beatMs: 1300, wave: 'sine',     cutoff: 780,  bass: false, gain: 0.42 }, // sparse, melancholy
  foundry: { scale: [0, 2, 3, 5, 7],  root: 147, beatMs: 760,  wave: 'triangle', cutoff: 980,  bass: true,  gain: 0.42 }, // warm, industrial drone
  default: { scale: [0, 2, 4, 7, 9],  root: 220, beatMs: 950,  wave: 'triangle', cutoff: 1300, bass: false, gain: 0.44 },
};

export class RoomMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private step = 0;
  private mood: Mood = MOODS.default;
  private muted = false;
  private running = false;

  private ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.mood.gain * 0.12;   // ambient: kept low
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass'; this.filter.frequency.value = this.mood.cutoff; this.filter.Q.value = 0.6;
    this.filter.connect(this.master); this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.linearRampToValueAtTime(m ? 0 : this.mood.gain * 0.12, this.ctx.currentTime + 0.25);
  }
  isMuted() { return this.muted; }

  setRoom(slug: string) {
    this.mood = MOODS[slug] ?? MOODS.default; this.step = 0;
    if (this.filter) this.filter.frequency.linearRampToValueAtTime(this.mood.cutoff, (this.ctx?.currentTime ?? 0) + 0.4);
    if (this.master && this.ctx && !this.muted) this.master.gain.linearRampToValueAtTime(this.mood.gain * 0.12, this.ctx.currentTime + 0.4);
    if (this.running && this.timer) { clearTimeout(this.timer); this.loop(); }
  }

  start() {   // call from a user gesture (resumes the context); safe to call repeatedly
    this.ensure(); if (!this.ctx) return;
    this.ctx.resume?.().catch(() => {});
    if (this.running) return;
    this.running = true; this.loop();
  }
  stop() { this.running = false; if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  dispose() { this.stop(); try { this.ctx?.close(); } catch { /* ignore */ } this.ctx = null; }

  private loop = () => {
    if (!this.running) return;
    this.tick();
    this.timer = setTimeout(this.loop, this.mood.beatMs);
  };

  private note(semi: number, dur: number, vol: number, detune = 0) {
    if (!this.ctx || !this.filter) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = this.mood.wave; o.frequency.value = this.mood.root * Math.pow(2, semi / 12); o.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.28); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.filter); o.start(t); o.stop(t + dur + 0.05);
  }

  private tick() {
    const m = this.mood, sc = m.scale, dur = m.beatMs / 1000;
    if (this.step % 4 === 0) { const base = sc[(this.step / 4) % sc.length]; [0, 7, 12].forEach((iv, i) => this.note(base + iv, dur * 3.6, 0.1, i * 5)); }   // pad chord (root · 5th · octave)
    if (this.step % 2 === 1) { const a = sc[(this.step + (this.step % 5)) % sc.length]; this.note(a + 12, dur * 0.8, 0.07); }                                  // sparse arpeggio, octave up
    if (m.bass && this.step % 4 === 0) this.note(sc[0] - 12, dur * 1.6, 0.14);                                                                                  // bass pulse
    this.step++;
  }
}

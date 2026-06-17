// Generative ambient room music — owned, royalty-free Web Audio. NO licensed tracks (the Spotify/
// YouTube embeds were removed for copyright; this is fully synthesized). In lore this is the SUAV
// signal — the carrier wave that holds the Loop together. A slow lo-fi pad + sparse arpeggio + optional
// bass pulse, with a per-room mood. Starts on a user gesture (browser autoplay), mutable, low volume.

type Mood = { scale: number[]; root: number; beatMs: number; wave: OscillatorType; cutoff: number; bass: boolean; gain: number; kick?: boolean; hihat?: boolean; hihatOffbeat?: boolean; hihatOpen?: boolean; snare?: boolean; stab?: boolean };

// scale = semitone offsets; root = base frequency (Hz). Tuned per sector's vibe.
// cutoff is deliberately low — a muffled, behind-the-glass lo-fi bed that sits UNDER the room.
const MOODS: Record<string, Mood> = {
  praca:   { scale: [0, 2, 4, 7, 9],  root: 220, beatMs: 900,  wave: 'triangle', cutoff: 760, bass: false, gain: 0.5 },  // calm, hopeful
  jardim:  { scale: [0, 2, 4, 7, 9],  root: 196, beatMs: 1100, wave: 'sine',     cutoff: 640, bass: false, gain: 0.46 }, // serene, koto-ish
  clube:   { scale: [0, 3, 5, 7, 10], root: 165, beatMs: 440,  wave: 'sawtooth', cutoff: 980,  bass: true,  gain: 0.4 },  // loudest signal — a pulse
  sweat:   { scale: [0, 3, 7, 10],   root: 110, beatMs: 460,  wave: 'sawtooth', cutoff: 1100, bass: true,  gain: 0.38, kick: true, snare: true, hihatOffbeat: true, hihatOpen: true }, // dark techno — A2 root, minor-7th, 130 BPM, bright and heavy
  archive: { scale: [0, 2, 3, 7, 8],  root: 174, beatMs: 1300, wave: 'sine',     cutoff: 520, bass: false, gain: 0.42 }, // sparse, melancholy
  foundry: { scale: [0, 2, 3, 5, 7],  root: 147, beatMs: 760,  wave: 'triangle', cutoff: 620, bass: true,  gain: 0.42 }, // warm, industrial drone
  disco:   { scale: [0, 2, 4, 7, 9, 10], root: 196, beatMs: 500, wave: 'sawtooth', cutoff: 1800, bass: true, gain: 0.44, kick: true, hihat: true, snare: true, stab: true }, // funky 120 BPM — G3 root, mixolydian, tight stabs, hi-hats
  u_2a698cb336b8: { scale: [0, 3, 7, 10], root: 110, beatMs: 460, wave: 'sawtooth', cutoff: 1100, bass: true, gain: 0.38, kick: true, snare: true, hihatOffbeat: true, hihatOpen: true },  // notwesyoung's room → sweat
  u_4c7959e1b001: { scale: [0, 2, 4, 7, 9, 10], root: 196, beatMs: 500, wave: 'sawtooth', cutoff: 1800, bass: true, gain: 0.44, kick: true, hihat: true, snare: true, stab: true }, // Rusty's Basement → disco
  default: { scale: [0, 2, 4, 7, 9],  root: 220, beatMs: 950,  wave: 'triangle', cutoff: 700, bass: false, gain: 0.44 },
};

export class RoomMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;          // SFX bus — crisp, bypasses the music lowpass
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
    this.master.gain.value = this.muted ? 0 : this.mood.gain * 0.14;   // ambient: kept low
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass'; this.filter.frequency.value = this.mood.cutoff; this.filter.Q.value = 0.6;
    this.filter.connect(this.master); this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.muted ? 0 : 0.5; this.sfx.connect(this.ctx.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) {
      if (this.master) this.master.gain.linearRampToValueAtTime(m ? 0 : this.mood.gain * 0.14, this.ctx.currentTime + 0.25);
      if (this.sfx) this.sfx.gain.linearRampToValueAtTime(m ? 0 : 0.5, this.ctx.currentTime + 0.05);
    }
  }

  // A soft footstep: a short pitch-dropping thud + a faint scuff. Call once per stride.
  footstep() {
    this.ensure(); if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150 + Math.random() * 40, t); o.frequency.exponentialRampToValueAtTime(68, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.15);
    // brief noise scuff for texture — bandlimited so it's a soft "tuf", not a click
    const len = Math.floor(this.ctx.sampleRate * 0.05);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const ns = this.ctx.createBufferSource(); ns.buffer = buf;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
    const ng = this.ctx.createGain(); ng.gain.value = 0.02;
    ns.connect(bp); bp.connect(ng); ng.connect(this.sfx); ns.start(t);
  }
  isMuted() { return this.muted; }

  // Approaching an NPC: a soft two-note "signal recognises you" chime — ethereal, lowpassed bell.
  chime() {
    this.ensure(); if (!this.ctx || !this.sfx) return;
    const t0 = this.ctx.currentTime;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600; lp.Q.value = 0.5; lp.connect(this.sfx);
    [0, 7].forEach((semi, i) => {   // root then a fifth up, a beat apart
      const t = t0 + i * 0.13;
      const f = 523.25 * Math.pow(2, semi / 12);   // C5 base
      [1, 2].forEach((mult, j) => {                 // fundamental + soft octave shimmer
        const o = this.ctx!.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult;
        const g = this.ctx!.createGain(); const peak = (j === 0 ? 0.025 : 0.008);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        o.connect(g); g.connect(lp); o.start(t); o.stop(t + 0.75);
      });
    });
  }

  // Stepping through a portal: a soft rising sweep that blooms and fades — crossing the threshold.
  portal() {
    this.ensure(); if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(2400, t + 0.5); lp.frequency.exponentialRampToValueAtTime(700, t + 1.1);
    lp.Q.value = 0.6; lp.connect(this.sfx);
    [220, 330, 440].forEach((f, i) => {   // a quiet rising triad shimmer
      const o = this.ctx!.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.5, t + 0.9);
      const g = this.ctx!.createGain(); const peak = 0.05 - i * 0.012;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g); g.connect(lp); o.start(t); o.stop(t + 1.15);
    });
  }

  setRoom(slug: string) {
    this.mood = MOODS[slug] ?? MOODS.default; this.step = 0;
    if (this.filter) this.filter.frequency.linearRampToValueAtTime(this.mood.cutoff, (this.ctx?.currentTime ?? 0) + 0.4);
    if (this.master && this.ctx && !this.muted) this.master.gain.linearRampToValueAtTime(this.mood.gain * 0.14, this.ctx.currentTime + 0.4);
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

  private kickDrum() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.07);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.25);
  }

  private openHiHat() {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime; const dur = 0.22;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;   // flat white noise — envelope via GainNode
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
    const peak = this.ctx.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 10000; peak.gain.value = 5; peak.Q.value = 1.0;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp); hp.connect(peak); peak.connect(g); g.connect(this.sfx); src.start(t); src.stop(t + dur + 0.01);
  }

  private hiHat() {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.025);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = this.ctx.createGain(); g.gain.value = 0.06;
    src.connect(hp); hp.connect(g); g.connect(this.sfx); src.start(t);
  }

  private snareDrum() {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    // noise body
    const len = Math.floor(this.ctx.sampleRate * 0.12);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.8;
    const g = this.ctx.createGain(); g.gain.value = 0.08;
    src.connect(bp); bp.connect(g); g.connect(this.sfx); src.start(t);
    // tonal crack
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 185;
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.05, t + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(og); og.connect(this.sfx); o.start(t); o.stop(t + 0.08);
  }

  private tick() {
    const m = this.mood, sc = m.scale, dur = m.beatMs / 1000;
    // Chord pad — staccato stabs on beat 1 + upbeat answer on beat 3; long pads otherwise
    if (this.step % 4 === 0) {
      const base = sc[(this.step / 4) % sc.length];
      [0, 7, 12].forEach((iv, i) => this.note(base + iv, dur * (m.stab ? 0.9 : 3.6), 0.1, i * 5));
    }
    if (m.stab && this.step % 4 === 2) {
      const base = sc[(this.step / 2) % sc.length];
      [0, 4, 7, 10].forEach((iv, i) => this.note(base + iv, dur * 0.3, 0.09, i * 4));   // dominant-7th stab
    }
    if (this.step % 2 === 1) { const a = sc[(this.step + (this.step % 5)) % sc.length]; this.note(a + 12, dur * 0.8, 0.07); }   // sparse arpeggio, octave up
    // Bass — walking root→fifth in stab/disco mode, single pulse otherwise
    if (m.bass) {
      if (m.stab) {
        if (this.step % 4 === 0) this.note(sc[0] - 12, dur * 0.8, 0.16);
        if (this.step % 4 === 2) this.note(sc[0] - 5,  dur * 0.65, 0.12);   // fifth above bass root
      } else {
        if (this.step % 4 === 0) this.note(sc[0] - 12, dur * 1.6, 0.14);
      }
    }
    if (m.kick) this.kickDrum();                                                                                    // four-on-the-floor
    if (m.hihat) { this.hiHat(); setTimeout(() => { if (this.running) this.hiHat(); }, m.beatMs / 2); }            // 8th-note hi-hats (disco)
    if (m.hihatOffbeat) { setTimeout(() => { if (this.running) m.hihatOpen ? this.openHiHat() : this.hiHat(); }, m.beatMs / 2); }   // offbeat-only hi-hats (techno)
    if (m.snare && this.step % 2 === 1) this.snareDrum();                                                          // backbeat 2 and 4
    this.step++;
  }
}

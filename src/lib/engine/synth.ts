// Shared arcade synth — Web Audio music loop + SFX library.
// Extracted verbatim from ArcadeCanvas so every game mode on the platform shares the
// exact same sound identity (jump/crystal/explosion + the escalating music bed).
// Self-contained: touches only `window`/AudioContext, no component state.
export class ArcadeSynth {
  ctx: AudioContext;
  filter: BiquadFilterNode;
  masterGain: GainNode;
  isPlaying = false;
  intensityLevel = 0;
  nextNoteTime = 0;
  noteIndex = 0;
  scheduleInterval: number | null = null;
  scaleNotes = [55, 65.41, 73.42, 82.41, 98, 110, 130.81, 146.83, 164.81, 196, 220];
  rhythmGrid = [1, 0, 1, 1, 0, 1, 0, 1];

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.filter = this.ctx.createBiquadFilter();
    this.masterGain = this.ctx.createGain();
    this.filter.type = 'lowpass'; this.filter.Q.value = 9;
    this.masterGain.gain.value = 0.14;
    this.filter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  startLoop() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.noteIndex = 0;
    this.scheduleInterval = window.setInterval(() => {
      while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
        if (this.rhythmGrid[this.noteIndex % this.rhythmGrid.length] === 1) this.emitNote(this.nextNoteTime);
        const bpm = 135 + this.intensityLevel * 9;
        this.nextNoteTime += (60 / bpm) * 0.25;
        this.noteIndex++;
      }
    }, 30);
  }

  stopLoop() {
    this.isPlaying = false;
    if (this.scheduleInterval) { window.clearInterval(this.scheduleInterval); this.scheduleInterval = null; }
  }

  setIntensity(n: number) { this.intensityLevel = Math.min(15, Math.floor(n / 4)); }

  emitNote(time: number) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = this.intensityLevel > 8 ? 'sawtooth' : 'square';
    const idx = Math.min((this.noteIndex % 6) + Math.floor(this.intensityLevel / 3), this.scaleNotes.length - 1);
    let freq = this.scaleNotes[idx];
    if (this.intensityLevel > 4 && this.noteIndex % 4 === 0) freq *= 2;
    if (this.intensityLevel > 10 && this.noteIndex % 8 >= 6) freq *= 2;
    osc.frequency.setValueAtTime(freq, time);
    this.filter.frequency.setValueAtTime(450 + this.intensityLevel * 140, time);
    this.filter.frequency.exponentialRampToValueAtTime(130, time + 0.14);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.5, time + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(env); env.connect(this.filter);
    osc.start(time); osc.stop(time + 0.15);
  }

  sfx(f0: number, f1: number, type: OscillatorType, dur: number, vol: number) {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f1, this.ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + dur + 0.01);
  }

  playJump()       { this.sfx(200, 400,  'sine',     0.12, 0.18); }
  playBlaster()    { this.sfx(880, 110,  'sawtooth', 0.18, 0.28); }
  playWideShot()   { this.sfx(660, 80,   'sawtooth', 0.28, 0.38); }
  playRapidShot()  {
    this.sfx(1100, 200, 'square', 0.12, 0.3);
    setTimeout(() => this.sfx(1300, 250, 'square', 0.12, 0.3), 120);
    setTimeout(() => this.sfx(1500, 300, 'square', 0.12, 0.3), 240);
  }
  playNova()       {
    this.sfx(200, 40, 'sawtooth', 0.8, 0.5);
    setTimeout(() => this.sfx(800, 1600, 'sine', 0.6, 0.4), 100);
    setTimeout(() => this.sfx(400, 20, 'triangle', 0.7, 0.45), 200);
  }
  playChargeUp()   { this.sfx(300, 1200, 'sine',     0.05, 0.08); }
  playExplosion()  { this.sfx(180, 35,   'triangle', 0.28, 0.40); }
  playCrystal()    { this.sfx(520, 900,  'sine',     0.22, 0.20); }
  playCharge()     { this.sfx(300, 700,  'sine',     0.30, 0.25); }
  playHurt()       { this.sfx(120, 60,   'sawtooth', 0.30, 0.40); }
  playCombo(n: number) { this.sfx(400 + n * 80, 800 + n * 80, 'sine', 0.25, 0.22); }
  playShield()     { this.sfx(200, 1200, 'sine',     0.45, 0.28); }
  playShieldBreak(){ this.sfx(600, 80,   'sawtooth', 0.30, 0.35); }
  playSpeedBoost() { this.sfx(300, 1400, 'triangle', 0.35, 0.30); }
  playSuperKill()  {
    this.sfx(800, 40, 'sawtooth', 0.6, 0.5);
    setTimeout(() => this.sfx(600, 30, 'square',   0.4, 0.4), 80);
    setTimeout(() => this.sfx(400, 20, 'triangle', 0.5, 0.45), 160);
  }
  playScoreMult()  { this.sfx(400, 1600, 'sine',     0.4, 0.3); }
  playTripleJump() { this.sfx(300, 1200, 'triangle', 0.3, 0.25); }
  playPerkDraft()  { this.sfx(500, 1800, 'sine',     0.5, 0.3); }
  playMagnet()     { this.sfx(350, 900,  'sine',     0.3, 0.22); }
  playBossIntro()  {
    this.sfx(120, 40, 'sawtooth', 0.8, 0.5);
    setTimeout(() => this.sfx(80, 30, 'square', 0.6, 0.4), 200);
  }
  playBossHit()    { this.sfx(400, 150, 'sawtooth', 0.2, 0.3); }
  playBossKill()   {
    this.sfx(600, 20, 'sawtooth', 1.0, 0.5);
    setTimeout(() => this.sfx(800, 30, 'square',   0.7, 0.45), 120);
    setTimeout(() => this.sfx(1200, 40, 'triangle', 0.5, 0.4),  240);
  }
  playGoldenKill() { this.sfx(900, 1800, 'sine', 0.5, 0.4); setTimeout(() => this.sfx(1200, 2400, 'sine', 0.4, 0.35), 80); }
  playPerfectShot(){ this.sfx(800, 2000, 'sine', 0.3, 0.35); setTimeout(() => this.sfx(1200, 2800, 'sine', 0.25, 0.3), 80); }
  playWeather()    { this.sfx(80, 40, 'triangle', 0.8, 0.35); }
  playChainTick()  { this.sfx(600 + this.intensityLevel * 40, 900, 'sine', 0.08, 0.12); }
  playHazard()     { this.sfx(150, 60, 'sawtooth', 0.35, 0.45); setTimeout(() => this.sfx(100, 40, 'sawtooth', 0.25, 0.35), 150); }
  playSniper()     { this.sfx(1200, 300, 'square', 0.1, 0.2); }
  playTankHit()    { this.sfx(200, 100, 'sawtooth', 0.2, 0.35); }
  playBomberDrop() { this.sfx(400, 80, 'sawtooth', 0.25, 0.3); }
  playTimeCrystal(){ this.sfx(200, 800, 'sine', 0.4, 0.3); setTimeout(()=>this.sfx(400,1200,'sine',0.3,0.25),150); }
  playGhostCrystal(){ this.sfx(600,1800,'sine',0.3,0.2); setTimeout(()=>this.sfx(900,2400,'sine',0.2,0.15),100); }
  playMirrorCrystal(){ this.sfx(300,1500,'triangle',0.35,0.28); }
  playFloatCrystal(){ this.sfx(400,2000,'sine',0.5,0.35); setTimeout(()=>this.sfx(600,2400,'triangle',0.4,0.3),100); setTimeout(()=>this.sfx(800,2800,'sine',0.3,0.25),200); }
  playOuroMode()  { this.sfx(200,1600,'sine',0.8,0.5); setTimeout(()=>this.sfx(400,2400,'triangle',0.6,0.45),150); setTimeout(()=>this.sfx(800,3200,'sine',0.5,0.4),300); }
  playBerserker() { this.sfx(100,50,'sawtooth',0.6,0.7); setTimeout(()=>this.sfx(150,60,'sawtooth',0.5,0.6),100); }
  playGhostRun()  { this.sfx(800,200,'triangle',0.5,0.35); setTimeout(()=>this.sfx(600,150,'sine',0.4,0.3),150); }
  setMuted(m: boolean) { this.masterGain.gain.setTargetAtTime(m ? 0 : 0.14, this.ctx.currentTime, 0.1); }
}

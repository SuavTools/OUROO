'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BrandText } from './BrandText';

// ============================================================
// SCORE ENGINE v3 — DRUM MACHINE + SEQUENCED ARPEGGIOS
// ============================================================

class ScoreEngine {
  ctx: AudioContext;
  master: GainNode;
  comp: DynamicsCompressorNode;
  reverbSend: GainNode;
  reverbNode: ConvolverNode | null = null;

  isRunning = false;
  bpm = 90;
  step = 0;           // 0–31 (2 bars of 16th notes)
  nextTime = 0;
  tickInterval: number | null = null;

  currentAct = 1;
  currentLevel = 1;
  combo = 0;
  tension = 0;

  // Each act has its own drum pattern, bass pattern, arp pattern
  // Patterns are 16 steps (one bar), looped

  // ---- DRUM PATTERNS ----
  // kick:   16 booleans
  // snare:  16
  // hihat:  16
  // open:   16 (open hihat accent)
  drumPatterns: Record<number, { kick: number[]; snare: number[]; hihat: number[]; open: number[] }> = {
    1: { // OURO: slow 4/4, sparse
      kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      open:  [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,1],
    },
    2: { // MELHORES DIAS: jazzy swing 8th feel
      kick:  [1,0,0,0, 1,0,0,0, 1,0,0,1, 0,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0],
      hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
      open:  [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0],
    },
    3: { // DILEMA: industrial syncopated
      kick:  [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,1,0,0],
      snare: [0,0,1,0, 1,0,0,1, 0,0,1,0, 1,0,0,1],
      hihat: [1,1,0,1, 1,1,0,1, 1,1,0,1, 1,0,1,1],
      open:  [0,0,0,0, 0,1,0,0, 0,0,0,0, 0,1,0,0],
    },
    4: { // JAZZADELICA: chaotic 4/4 with ghost hits
      kick:  [1,0,1,0, 0,1,0,0, 1,0,0,1, 0,0,1,0],
      snare: [0,0,0,1, 1,0,0,0, 0,1,0,0, 1,0,0,1],
      hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
      open:  [0,0,1,0, 0,0,0,1, 0,1,0,0, 0,0,1,0],
    },
  };

  // ---- ARP PATTERNS ---- (semitone offsets from root A)
  arpPatterns: Record<number, number[][]> = {
    1: [ // OURO: two alternating minor pentatonic runs, slow
      [0, 3, 7, 10, 12, 10, 7, 3],
      [0, 3, 5,  7, 10,  7, 5, 3],
    ],
    2: [ // MELHORES DIAS: jazzy ascending + chromatic touches
      [0, 4, 7, 11, 12, 11, 9, 7],
      [0, 3, 5,  7,  9, 12,  9, 7],
    ],
    3: [ // DILEMA: dissonant tritone-heavy
      [0, 1, 6, 7, 6, 1, 0, 6],
      [0, 6, 7, 1, 6, 0, 7, 6],
    ],
    4: [ // JAZZADELICA: rapid dense chromatic bursts
      [0, 3, 5, 7, 10, 12, 10, 7, 5, 3, 0, 3, 7, 10, 12, 7],
      [12, 10, 7, 5, 3, 0, 3, 5, 7, 10, 12, 7, 5, 3, 0, 5],
    ],
  };

  // ---- BASS LINES ---- (MIDI-style: [semitone_offset, beat_step] pairs)
  bassLines: Record<number, { note: number; step: number; dur: number }[]> = {
    1: [ // OURO: root hits with occasional 5th
      { note: 0,  step: 0,  dur: 3 },
      { note: 7,  step: 4,  dur: 2 },
      { note: 0,  step: 8,  dur: 3 },
      { note: 5,  step: 12, dur: 2 },
    ],
    2: [ // MELHORES DIAS: walking bass
      { note: 0,  step: 0,  dur: 2 },
      { note: 3,  step: 2,  dur: 2 },
      { note: 5,  step: 4,  dur: 2 },
      { note: 7,  step: 6,  dur: 2 },
      { note: 5,  step: 8,  dur: 2 },
      { note: 3,  step: 10, dur: 2 },
      { note: 0,  step: 12, dur: 2 },
      { note: 10, step: 14, dur: 2 },
    ],
    3: [ // DILEMA: aggressive syncopated
      { note: 0,  step: 0,  dur: 2 },
      { note: 0,  step: 3,  dur: 1 },
      { note: 6,  step: 6,  dur: 2 },
      { note: 1,  step: 8,  dur: 2 },
      { note: 0,  step: 11, dur: 1 },
      { note: 7,  step: 13, dur: 2 },
    ],
    4: [ // JAZZADELICA: dense walking
      { note: 0,  step: 0,  dur: 1 },
      { note: 3,  step: 1,  dur: 1 },
      { note: 5,  step: 2,  dur: 1 },
      { note: 7,  step: 3,  dur: 1 },
      { note: 10, step: 4,  dur: 1 },
      { note: 12, step: 5,  dur: 1 },
      { note: 10, step: 6,  dur: 1 },
      { note: 7,  step: 7,  dur: 1 },
      { note: 5,  step: 8,  dur: 1 },
      { note: 3,  step: 9,  dur: 1 },
      { note: 0,  step: 10, dur: 1 },
      { note: 3,  step: 11, dur: 1 },
      { note: 5,  step: 12, dur: 1 },
      { note: 7,  step: 13, dur: 1 },
      { note: 9,  step: 14, dur: 1 },
      { note: 7,  step: 15, dur: 1 },
    ],
  };

  // ---- MELODY LINES ---- (acts 2+), plays every 2nd bar
  melodyLines: Record<number, { note: number | null; step: number; dur: number }[]> = {
    2: [
      { note: 12, step: 0,  dur: 2 },
      { note: null, step: 2, dur: 2 },
      { note: 10, step: 4,  dur: 1 },
      { note: 12, step: 5,  dur: 1 },
      { note: 9,  step: 6,  dur: 2 },
      { note: null, step: 8, dur: 2 },
      { note: 7,  step: 10, dur: 1 },
      { note: 9,  step: 11, dur: 1 },
      { note: 12, step: 12, dur: 3 },
      { note: null, step: 15, dur: 1 },
    ],
    3: [
      { note: 13, step: 0,  dur: 1 },
      { note: 6,  step: 2,  dur: 2 },
      { note: 13, step: 5,  dur: 1 },
      { note: 7,  step: 7,  dur: 2 },
      { note: 6,  step: 9,  dur: 1 },
      { note: 13, step: 11, dur: 1 },
      { note: 12, step: 13, dur: 2 },
    ],
    4: [
      { note: 19, step: 0,  dur: 1 },
      { note: 17, step: 1,  dur: 1 },
      { note: 15, step: 2,  dur: 1 },
      { note: 12, step: 3,  dur: 1 },
      { note: 10, step: 4,  dur: 1 },
      { note: 12, step: 5,  dur: 1 },
      { note: 15, step: 6,  dur: 1 },
      { note: 17, step: 7,  dur: 1 },
      { note: 19, step: 8,  dur: 2 },
      { note: 17, step: 10, dur: 1 },
      { note: 15, step: 11, dur: 1 },
      { note: 19, step: 12, dur: 1 },
      { note: 22, step: 13, dur: 1 },
      { note: 19, step: 14, dur: 2 },
    ],
  };

  rootHz = 55.0; // A1

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 4;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.002;
    this.comp.release.value = 0.15;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;

    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.18;

    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.reverbSend.connect(this.ctx.destination);

    this.buildReverb();
  }

  async buildReverb() {
    const len = this.ctx.sampleRate * 1.8;
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = buf;
    this.reverbNode.connect(this.reverbSend);
  }

  midiToHz(semitones: number, octaveShift = 0): number {
    return this.rootHz * Math.pow(2, (semitones + octaveShift * 12) / 12);
  }

  // ---- DRUM SYNTHESIS ----
  kick(time: number, vol = 1) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, time);
    o.frequency.exponentialRampToValueAtTime(40, time + 0.08);
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(vol * 1.1, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    o.connect(g); g.connect(this.comp);
    o.start(time); o.stop(time + 0.4);

    // Click transient
    const click = this.ctx.createOscillator();
    const cg = this.ctx.createGain();
    click.type = 'square'; click.frequency.value = 600;
    cg.gain.setValueAtTime(0.001, time);
    cg.gain.linearRampToValueAtTime(vol * 0.3, time + 0.002);
    cg.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    click.connect(cg); cg.connect(this.comp);
    click.start(time); click.stop(time + 0.03);
  }

  snare(time: number, vol = 1) {
    // Tonal body
    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 200;
    og.gain.setValueAtTime(0.001, time);
    og.gain.linearRampToValueAtTime(vol * 0.6, time + 0.004);
    og.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    o.connect(og); og.connect(this.comp);
    o.start(time); o.stop(time + 0.15);

    // Noise body
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.25, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = this.ctx.createBufferSource();
    n.buffer = buf;
    const ng = this.ctx.createGain();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 3500; nf.Q.value = 0.8;
    ng.gain.setValueAtTime(0.001, time);
    ng.gain.linearRampToValueAtTime(vol * 0.7, time + 0.005);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    n.connect(nf); nf.connect(ng); ng.connect(this.comp);
    n.start(time); n.stop(time + 0.22);
  }

  hihat(time: number, vol = 0.4, open = false) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * (open ? 0.35 : 0.05), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = this.ctx.createBufferSource(); n.buffer = buf;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = open ? 7000 : 10000;
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, time + (open ? 0.3 : 0.04));
    n.connect(f); f.connect(g); g.connect(this.comp);
    n.start(time); n.stop(time + (open ? 0.38 : 0.06));
  }

  // ---- SYNTH HELPERS ----
  pluck(freq: number, time: number, dur: number, vol: number, type: OscillatorType = 'sawtooth', octave = 0) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    const cutoff = 600 + this.combo * 180 + (this.currentAct - 1) * 400;
    f.frequency.setValueAtTime(cutoff * 3, time);
    f.frequency.exponentialRampToValueAtTime(cutoff, time + dur * 0.3);
    f.Q.value = 4 + this.currentAct;

    const hz = freq * Math.pow(2, octave);
    o.type = type;
    o.frequency.setValueAtTime(hz, time);
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);

    o.connect(f); f.connect(g); g.connect(this.comp);
    if (this.reverbNode) { const rs = this.ctx.createGain(); rs.gain.value = 0.15; g.connect(rs); rs.connect(this.reverbNode); }
    o.start(time); o.stop(time + dur + 0.01);
  }

  bassNote(freq: number, time: number, dur: number, vol: number) {
    // Sub sine + filtered square layered
    const sub = this.ctx.createOscillator();
    const subg = this.ctx.createGain();
    sub.type = 'sine'; sub.frequency.value = freq;
    subg.gain.setValueAtTime(0.001, time);
    subg.gain.linearRampToValueAtTime(vol * 0.8, time + 0.01);
    subg.gain.setValueAtTime(vol * 0.8, time + dur - 0.04);
    subg.gain.exponentialRampToValueAtTime(0.001, time + dur);
    sub.connect(subg); subg.connect(this.comp);
    sub.start(time); sub.stop(time + dur + 0.01);

    const sq = this.ctx.createOscillator();
    const sqg = this.ctx.createGain();
    const sqf = this.ctx.createBiquadFilter();
    sq.type = 'square'; sq.frequency.value = freq;
    sq.detune.value = 4;
    sqf.type = 'lowpass'; sqf.frequency.value = 800; sqf.Q.value = 3;
    sqg.gain.setValueAtTime(0.001, time);
    sqg.gain.linearRampToValueAtTime(vol * 0.35, time + 0.01);
    sqg.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.7);
    sq.connect(sqf); sqf.connect(sqg); sqg.connect(this.comp);
    sq.start(time); sq.stop(time + dur + 0.01);
  }

  chord(rootFreq: number, intervals: number[], time: number, dur: number, vol: number) {
    intervals.forEach((semi, i) => {
      const hz = rootFreq * Math.pow(2, semi / 12);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 2000; f.Q.value = 1;
      o.type = 'triangle'; o.frequency.value = hz;
      g.gain.setValueAtTime(0.001, time + i * 0.005);
      g.gain.linearRampToValueAtTime(vol / intervals.length, time + i * 0.005 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);
      o.connect(f); f.connect(g); g.connect(this.comp);
      if (this.reverbNode) { const rs = this.ctx.createGain(); rs.gain.value = 0.2; g.connect(rs); rs.connect(this.reverbNode); }
      o.start(time + i * 0.005); o.stop(time + dur + 0.01);
    });
  }

  // ---- SEQUENCER ----
  getAct(level: number) {
    if (level <= 4)  return 1;
    if (level <= 8)  return 2;
    if (level <= 12) return 3;
    return 4;
  }

  getBpm(level: number) {
    const actBpm: Record<number, number> = { 1: 88, 2: 104, 3: 122, 4: 145 };
    const act = this.getAct(level);
    // Each level within act nudges BPM slightly up
    const withinAct = ((level - 1) % 4);
    return actBpm[act] + withinAct * 3;
  }

  start(level: number) {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.isRunning = true;
    this.currentLevel = level;
    this.currentAct = this.getAct(level);
    this.bpm = this.getBpm(level);
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.tickInterval = window.setInterval(() => this.tick(), 20);
  }

  stop() {
    this.isRunning = false;
    if (this.tickInterval !== null) { window.clearInterval(this.tickInterval); this.tickInterval = null; }
  }

  updateLevel(level: number) {
    this.currentLevel = level;
    this.currentAct = this.getAct(level);
    this.bpm = this.getBpm(level);
  }

  tick() {
    if (!this.isRunning) return;
    while (this.nextTime < this.ctx.currentTime + 0.1) {
      this.scheduleStep(this.nextTime, this.step % 16);
      const spb = 60 / this.bpm;
      const swing = (this.step % 2 === 1) ? spb * 0.055 : 0; // swing feel
      this.nextTime += spb * 0.25 + swing; // 16th notes
      this.step = (this.step + 1) % 64; // 4 bars before wrap
    }
  }

  scheduleStep(t: number, s: number) {
    const act = this.currentAct;
    const pat = this.drumPatterns[act];
    const spb = 60 / this.bpm;
    const sixteenth = spb * 0.25;

    // ---- DRUMS ----
    const kickVol  = 1.0 + (act === 3 ? 0.15 : 0) + this.tension * 0.1;
    const snareVol = 0.85 + this.tension * 0.1;
    const hhVol    = 0.35 + this.combo * 0.02;

    if (pat.kick[s])  this.kick(t, kickVol);
    if (pat.snare[s]) this.snare(t, snareVol);
    if (pat.hihat[s]) this.hihat(t, hhVol, false);
    if (pat.open[s])  this.hihat(t, hhVol * 1.3, true);

    // ---- BASS ----
    const bassLine = this.bassLines[act];
    for (const note of bassLine) {
      if (note.step === s) {
        const hz = this.midiToHz(note.note, 0);
        const dur = sixteenth * note.dur * 0.85;
        const bassVol = 0.65 + (act >= 3 ? 0.1 : 0);
        this.bassNote(hz, t, dur, bassVol);
      }
    }

    // ---- ARP ----
    // Pick which arp pattern (alternates every 8 steps)
    const arpPatList = this.arpPatterns[act];
    const patIdx = Math.floor(this.step / 8) % arpPatList.length;
    const arpPat = arpPatList[patIdx];
    const arpStep = s % arpPat.length;
    const arpNote = arpPat[arpStep];

    // Arp density increases with act
    const arpEvery = act <= 1 ? 2 : 1; // act 1: every other 16th; act 2+: every 16th
    if (s % arpEvery === 0) {
      const arpOct  = act >= 3 ? 1 : 0;
      const arpType: OscillatorType = act === 1 ? 'triangle' : act === 2 ? 'sine' : act === 3 ? 'sawtooth' : 'square';
      const arpVol  = 0.18 + this.combo * 0.025 + (act - 1) * 0.04;
      const arpDur  = sixteenth * (act >= 4 ? 0.6 : 0.85);
      const hz = this.midiToHz(arpNote, arpOct + 1);
      this.pluck(hz, t, arpDur, arpVol, arpType);
    }

    // ---- MELODY ---- (every 2nd bar = step 16–31 in 32-step window, or act 4 always)
    const inMelodyBar = (this.step >= 16 && this.step < 32) || act === 4;
    const melLine = this.melodyLines[act] ?? this.melodyLines[2];
    if (inMelodyBar && melLine) {
      for (const note of melLine) {
        if (note.step === s && note.note !== null) {
          const melOct  = act >= 4 ? 2 : 1;
          const melType: OscillatorType = act <= 2 ? 'sine' : 'sawtooth';
          const melVol  = 0.12 + this.combo * 0.015;
          const melDur  = sixteenth * note.dur * 1.1;
          const hz = this.midiToHz(note.note, melOct);
          this.pluck(hz, t, melDur, melVol, melType, 0);
        }
      }
    }

    // ---- CHORD STAB ---- (acts 2+, on the 2-and and 4-and)
    if (act >= 2 && (s === 5 || s === 13)) {
      const chordIntervals = act === 2
        ? [0, 3, 7]          // minor triad
        : act === 3
          ? [0, 6, 7]        // tritone stab
          : [0, 3, 7, 10];   // minor 7th
      const chordRoot = this.midiToHz(0, 1);
      const chordVol  = 0.08 + this.tension * 0.06;
      const chordDur  = act >= 4 ? sixteenth * 1.5 : sixteenth * 0.9;
      this.chord(chordRoot, chordIntervals, t, chordDur, chordVol);
    }

    // ---- TENSION NOISE BURST (act 3+) ----
    if (act >= 3 && (s === 7 || s === 15) && this.tension > 0.3) {
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.08, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
      const n = this.ctx.createBufferSource(); n.buffer = buf;
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 2;
      g.gain.setValueAtTime(this.tension * 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      n.connect(f); f.connect(g); g.connect(this.comp);
      n.start(t); n.stop(t + 0.09);
    }

    // ---- ACT 4 EXTRA GLITCH LAYER ----
    if (act === 4 && s % 3 === 0 && this.combo >= 3) {
      // Random high pitched glitch ping
      const glitchHz = this.midiToHz(Math.floor(Math.random() * 12) + 19, 2);
      this.pluck(glitchHz, t, sixteenth * 0.25, 0.05 + this.combo * 0.01, 'square');
    }
  }

  // ---- GAMEPLAY REACTIVITY ----
  onCrystalCollect(combo: number) {
    this.combo = Math.min(10, combo);
    this.tension = Math.max(0, this.tension - 0.12);
    // Bright arp ping — reward note
    const pingHz = this.midiToHz([12, 14, 15, 17, 19][combo % 5], 2);
    this.pluck(pingHz, this.ctx.currentTime + 0.02, 0.35, 0.2, 'sine');
  }

  onNearMiss() {
    this.tension = Math.min(1, this.tension + 0.25);
  }

  onLand() {
    this.tension = Math.max(0, this.tension - 0.04);
  }

  setMuted(muted: boolean) {
    this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.1);
  }

  sfxShoot(freq: number, type: OscillatorType, dur: number, vol: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type === 'sawtooth' || type === 'square' ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (freq > 400) o.frequency.exponentialRampToValueAtTime(freq * 1.3, this.ctx.currentTime + dur);
    else o.frequency.exponentialRampToValueAtTime(freq * 0.4, this.ctx.currentTime + dur);
    g.gain.setValueAtTime(0.001, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol * 0.5, this.ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }
}

// ============================================================
// INTERFACES
// ============================================================
interface Player { x: number; y: number; width: number; height: number; vx: number; vy: number; isGrounded: boolean; jumpCount: number; stretch: number; }
interface Platform { x: number; y: number; baseY: number; width: number; height: number; styleType: 'solid' | 'pillar' | 'glitch'; waveOffset: number; isSafeZone?: boolean; }
interface Crystal { x: number; y: number; size: number; collected: boolean; pulseOffset: number; }
interface Particle { x: number; y: number; vx: number; vy: number; color: string; alpha: number; life: number; size: number; }
interface FloatText { id: number; text: string; x: number; y: number; vy: number; alpha: number; life: number; }
interface MatrixColumn { x: number; y: number; speed: number; chars: string[]; }
interface BannerText { text: string; x: number; y: number; speed: number; size: number; alpha: number; driftY: number; }

const ACT_NAMES: Record<number, string> = { 1: 'OURO', 2: 'MELHORES DIAS', 3: 'DILEMA', 4: 'JAZZADELICA' };

// ============================================================
// COMPONENT
// ============================================================
export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ScoreEngine | null>(null);

  const [score, setScore] = useState(0);
  const [currentTrack, setCurrentTrack] = useState(1);
  const [trackTransition, setTrackTransition] = useState(false);
  const [floatTexts, setFloatTexts] = useState<FloatText[]>([]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [toastActive, setToastActive] = useState(false);
  const [toastText, setToastText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [nowPlayingAct, setNowPlayingAct] = useState('OURO');

  const [hasLevelFiveCheckpoint, setHasLevelFiveCheckpoint] = useState(false);
  const [hasLevelTenCheckpoint, setHasLevelTenCheckpoint] = useState(false);
  const [isTrackThreeMilestone, setIsTrackThreeMilestone] = useState(false);
  const [isLevelFiveMilestone, setIsLevelFiveMilestone] = useState(false);
  const [isLevelTenMilestone, setIsLevelTenMilestone] = useState(false);
  const [isAlbumCleared, setIsAlbumCleared] = useState(false);

  const textIdCounter = useRef(0);
  const animationFrameRef = useRef<number>(0);

  const DEFAULT_PLAYER_WIDTH = 38;
  const DEFAULT_PLAYER_HEIGHT = 52;

  const stateRef = useRef({
    player: { x: 140, y: 300, width: DEFAULT_PLAYER_WIDTH, height: DEFAULT_PLAYER_HEIGHT, vx: 0, vy: 0, isGrounded: false, jumpCount: 0, stretch: 1 } as Player,
    platforms: [] as Platform[], crystals: [] as Crystal[], particles: [] as Particle[],
    floatTexts: [] as FloatText[], matrixColumns: [] as MatrixColumn[], bannerTexts: [] as BannerText[],
    gameTicks: 0, keys: { ArrowUp: false, Space: false, KeyW: false },
    baseSpeed: 5.2, difficultyModifier: 1, scoreAccumulator: 0,
    lastTime: 0, fpsInterval: 1000 / 60, screenFlash: 0,
    milesTraveled: 0, comboCount: 0, crystalsCaughtTotal: 0,
    coyoteCounter: 0, jumpBufferCounter: 0, trackSeventeenCrystals: 0,
    warpToast: { active: false, text: '', life: 0, maxLife: 90, y: 0 }
  });

  const feedbackWords = ['SOUL', 'ALMA', 'DOBRO', 'OURO', 'RAW', 'WILD', 'ENERGY', 'DISSENT', 'ENTROPY'];
  const milestonePhrases = ['MATRIX TUNED', 'ALMA LINKED', 'CHEF LEVEL UP', 'SOVEREIGN CORE', 'ENTROPY STABLE'];

  const getEngine = (): ScoreEngine => {
    if (!engineRef.current) engineRef.current = new ScoreEngine();
    return engineRef.current;
  };

  useEffect(() => {
    if (isPlaying && !isAlbumCleared) {
      const eng = getEngine();
      if (!eng.isRunning) { eng.start(currentTrack); }
      else { eng.updateLevel(currentTrack); }
      setNowPlayingAct(ACT_NAMES[eng.getAct(currentTrack)] ?? 'OURO');
    } else {
      engineRef.current?.stop();
    }
  }, [currentTrack, isPlaying, isAlbumCleared]);

  const toggleMute = () => {
    const eng = engineRef.current; if (!eng) return;
    const next = !isMuted; eng.setMuted(next); setIsMuted(next);
  };

  const handleCanvasClick = () => {
    const eng = engineRef.current;
    if (eng && eng.ctx.state === 'suspended') {
      eng.ctx.resume().then(() => { if (!eng.isRunning && isPlaying && !isAlbumCleared) eng.start(currentTrack); });
    } else if (!eng && isPlaying && !isAlbumCleared) {
      getEngine().start(currentTrack);
    }
  };

  const playSfx = (freq: number, type: OscillatorType, dur: number, vol: number) => {
    try { getEngine().sfxShoot(freq, type, dur, vol); } catch (_) {}
  };

  const triggerGlitchWarpToast = (text: string) => {
    const s = stateRef.current;
    s.warpToast.active = true; s.warpToast.text = text;
    s.warpToast.life = s.warpToast.maxLife; s.warpToast.y = window.innerHeight * 0.22;
    playSfx(480, 'sawtooth', 0.25, 0.18);
  };

  const getRequiredScoreForClear = (track: number) => {
    if (track <= 5) return 500; if (track === 17) return 1700; return 700;
  };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const state = stateRef.current;
    state.matrixColumns = [];
    const count = Math.floor(canvas.width / 24);
    for (let i = 0; i < count; i++) {
      const chars: string[] = [];
      for (let j = 0; j < Math.floor(Math.random() * 15) + 8; j++) chars.push(Math.random() > 0.5 ? '1' : '0');
      state.matrixColumns.push({ x: i * 24, y: Math.random() * -canvas.height, speed: Math.random() * 4 + 2, chars });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const state = stateRef.current;

    const spawnBanner = () => {
      let pool = ['THE COOKBOOK', 'CHEF MODE', 'RAW OUTPUT', 'OURO ARCHIVE'];
      if (currentTrack >= 3) pool = ['DROOPY SOUL', 'WILD CORES', 'BROKEN AESTHETIC', 'DISSENT ENGINE'];
      if (currentTrack >= 5) pool = ['SOVEREIGNTY', 'QUANTITY FOR SOVEREIGNTY', 'ANTI-SANITIZATION', 'TROJAN HORSE'];
      if (currentTrack >= 13) pool = ['FINAL MILESTONE', 'ALMA SYNC STABLE', 'MAXIMUM ENERGY', 'SOVEREIGN CORE'];
      state.bannerTexts.push({ text: pool[Math.floor(Math.random() * pool.length)], x: canvas.width + 150, y: Math.random() * (canvas.height * 0.5) + 120, speed: Math.random() * 2 + 1, size: Math.floor(Math.random() * 50) + 50, alpha: Math.random() * 0.04 + 0.02, driftY: (Math.random() - 0.5) * 0.3 });
    };

    const resizeCanvas = () => {
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      state.bannerTexts = []; for (let i = 0; i < 3; i++) spawnBanner();
    };
    window.addEventListener('resize', resizeCanvas); resizeCanvas();

    const resetLayout = () => {
      state.platforms = [{ x: 0, y: canvas.height - 180, baseY: canvas.height - 180, width: 950, height: 600, styleType: 'solid', waveOffset: 0, isSafeZone: true }];
      state.crystals = [{ x: 450, y: canvas.height - 210, size: 24, collected: false, pulseOffset: 0 }, { x: 700, y: canvas.height - 210, size: 24, collected: false, pulseOffset: 1 }];
      state.particles = []; state.floatTexts = []; state.comboCount = 0; state.crystalsCaughtTotal = 0;
      state.coyoteCounter = 0; state.jumpBufferCounter = 0; state.trackSeventeenCrystals = 0; state.warpToast.active = false;
    };
    if (state.gameTicks === 0 && isPlaying) resetLayout();

    const checkpoint = () => {
      state.platforms = []; state.crystals = [];
      const ty = canvas.height - 200;
      state.player.x = 140; state.player.y = ty - state.player.height - 20; state.player.vy = 0; state.player.isGrounded = true;
      state.platforms.push({ x: 0, y: ty, baseY: ty, width: canvas.width + 400, height: 600, styleType: 'solid', waveOffset: 0, isSafeZone: true });
      for (let i = 0; i < 2; i++) state.crystals.push({ x: 500 + i * 250, y: ty - 50, size: 24, collected: false, pulseOffset: i });
    };

    const doJump = () => {
      const p = state.player;
      if (p.isGrounded || state.coyoteCounter > 0) {
        p.vy = -14.6; p.isGrounded = false; p.jumpCount = 1; p.stretch = 1.35;
        state.coyoteCounter = 0; state.jumpBufferCounter = 0;
        burst(p.x + p.width / 2, p.y + p.height, '#ff4e3e', 15, 3); playSfx(160, 'square', 0.12, 0.15);
      } else if (p.jumpCount === 1) {
        p.vy = -12.4; p.jumpCount = 2; p.stretch = 1.45; state.jumpBufferCounter = 0;
        burst(p.x + p.width / 2, p.y + p.height / 2, '#ffe65c', 25, 4); feedback(p.x, p.y - 20, 'DOUBLE JUMP'); playSfx(240, 'square', 0.15, 0.12);
      } else if (p.jumpCount === 2 && !p.isGrounded) {
        p.vy = 18.5; p.jumpCount = 3; state.jumpBufferCounter = 0;
        burst(p.x + p.width / 2, p.y, '#ffffff', 18, 5); feedback(p.x, p.y - 20, 'GRAVITY DROP'); playSfx(90, 'sawtooth', 0.2, 0.25);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying || isAlbumCleared) return;
      if (e.code === 'KeyM') { toggleMute(); return; }
      if (e.code === 'Digit1') { setCurrentTrack(1); setScore(0); state.scoreAccumulator = 0; state.trackSeventeenCrystals = 0; checkpoint(); playSfx(300, 'sine', 0.2, 0.2); return; }
      if (e.code === 'Digit3') { setCurrentTrack(3); setScore(1000); state.scoreAccumulator = 0; state.trackSeventeenCrystals = 0; checkpoint(); setIsTrackThreeMilestone(true); setTimeout(() => setIsTrackThreeMilestone(false), 2000); playSfx(350, 'sine', 0.2, 0.2); return; }
      if (e.code === 'Digit5') { setCurrentTrack(5); setScore(2200); state.scoreAccumulator = 0; state.trackSeventeenCrystals = 0; checkpoint(); setHasLevelFiveCheckpoint(true); setIsLevelFiveMilestone(true); setTimeout(() => setIsLevelFiveMilestone(false), 2200); playSfx(400, 'sine', 0.2, 0.2); return; }
      if (e.code === 'Digit0') { setCurrentTrack(10); setScore(5700); state.scoreAccumulator = 0; state.trackSeventeenCrystals = 0; checkpoint(); setHasLevelTenCheckpoint(true); setIsLevelTenMilestone(true); setTimeout(() => setIsLevelTenMilestone(false), 2400); playSfx(450, 'sine', 0.2, 0.2); return; }
      if (e.code === 'Digit6') { setCurrentTrack(15); setScore(9200); state.scoreAccumulator = 0; state.trackSeventeenCrystals = 0; checkpoint(); feedback(140, 200, 'THE FINAL 3'); playSfx(500, 'sine', 0.25, 0.25); return; }
      if (e.code === 'Digit9') { setCurrentTrack(17); setScore(10000); state.scoreAccumulator = 0; state.trackSeventeenCrystals = 0; checkpoint(); triggerGlitchWarpToast("TRACK 17 MARATHON ACTIVATED"); return; }
      if (['ArrowUp', ' ', 'KeyW'].includes(e.code)) { state.jumpBufferCounter = 6; doJump(); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') state.keys.Space = false;
      if (e.code === 'ArrowUp') state.keys.ArrowUp = false;
      if (e.code === 'KeyW') state.keys.KeyW = false;
    };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);

    const burst = (x: number, y: number, color: string, count: number, force: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2; const sp = Math.random() * force + 1.5;
        state.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color, alpha: 1, life: Math.random() * 25 + 15, size: Math.random() * 3.5 + 1 });
      }
    };
    const feedback = (x: number, y: number, word?: string) => {
      const w = word ?? feedbackWords[Math.floor(Math.random() * feedbackWords.length)];
      textIdCounter.current++;
      state.floatTexts.push({ id: textIdCounter.current, text: w, x, y, vy: -2.5 - Math.random() * 2, alpha: 1, life: 45 });
    };

    const updatePhysics = () => {
      if (!isPlaying || isAlbumCleared) return;
      if (state.warpToast.active) { state.warpToast.life--; if (state.warpToast.life <= 0) state.warpToast.active = false; }
      if (trackTransition || isTrackThreeMilestone || isLevelFiveMilestone || isLevelTenMilestone) {
        state.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; p.alpha = Math.max(0, p.life / 25); });
        state.particles = state.particles.filter(p => p.life > 0);
        const p = state.player; p.vy += 0.74; if (p.vy > 19) p.vy = 19; p.y += p.vy;
        state.platforms.forEach(pl => { if (p.x + p.width > pl.x && p.x < pl.x + pl.width && p.y + p.height >= pl.y && p.y + p.height - p.vy <= pl.y + 18) { p.y = pl.y - p.height; p.vy = 0; p.isGrounded = true; p.jumpCount = 0; } });
        return;
      }
      state.gameTicks++;
      const sc = Math.min(12, currentTrack);
      state.difficultyModifier = 1 + (sc - 1) * 0.07;
      const spd = state.baseSpeed * state.difficultyModifier;
      const p = state.player;
      state.milesTraveled += spd * 0.025;
      if (state.screenFlash > 0) state.screenFlash -= 0.08;
      if (state.jumpBufferCounter > 0) state.jumpBufferCounter--;
      if (p.isGrounded) { state.coyoteCounter = 5; } else if (state.coyoteCounter > 0) { state.coyoteCounter--; }
      if (state.gameTicks % 140 === 0 && state.bannerTexts.length < 5) spawnBanner();
      state.bannerTexts.forEach(b => { b.x -= spd * 0.2 + b.speed; b.y += b.driftY; });
      state.bannerTexts = state.bannerTexts.filter(b => b.x > -500);
      state.matrixColumns.forEach(col => { col.y += col.speed; if (col.y > canvas.height) col.y = Math.random() * -150 - 50; });
      state.platforms.forEach(pl => {
        pl.x -= p.vx;
        if (currentTrack >= 3 && !pl.isSafeZone) {
          const of2 = currentTrack === 17 ? 0.032 : currentTrack >= 13 ? 0.025 : 0.014;
          const ws = of2 + currentTrack * 0.003; const wa = Math.min(130, 10 + currentTrack * 6);
          const oy = pl.y;
          pl.y = pl.baseY + Math.sin(state.gameTicks * ws + pl.waveOffset) * wa;
          if (p.isGrounded && p.x + p.width > pl.x && p.x < pl.x + pl.width && Math.abs((p.y + p.height) - oy) < 4) p.y += (pl.y - oy);
        }
      });
      const wasGrounded = p.isGrounded;
      p.vy += 0.76; if (p.vy > 20) p.vy = 20; p.y += p.vy; p.vx = spd;
      p.stretch += (1 - p.stretch) * 0.15;
      if (!p.isGrounded && Math.abs(p.vy) > 2) p.stretch = 1 + Math.abs(p.vy) * 0.025;
      if (!wasGrounded && p.vy > 8) {
        const near = state.platforms.find(pl => Math.abs((p.x + p.width / 2) - (pl.x + pl.width / 2)) < pl.width * 0.6 && Math.abs((p.y + p.height) - pl.y) < 60);
        if (!near) engineRef.current?.onNearMiss();
      }
      let onGround = false;
      for (const pl of state.platforms) {
        if (p.x + p.width > pl.x && p.x < pl.x + pl.width && p.y + p.height >= pl.y && p.y + p.height - p.vy <= pl.y + 18) {
          if (!p.isGrounded && p.vy > 5) { p.stretch = 0.7; burst(p.x + p.width / 2, pl.y, '#ff4e3e', 10, 2.5); }
          p.y = pl.y - p.height; p.vy = 0; p.isGrounded = true; p.jumpCount = 0; state.comboCount = 0; onGround = true;
          engineRef.current?.onLand();
          if (state.jumpBufferCounter > 0) doJump();
        }
      }
      if (!onGround) p.isGrounded = false;
      if (p.y > canvas.height) { setIsPlaying(false); playSfx(110, 'sawtooth', 0.5, 0.3); return; }
      state.crystals.forEach(c => {
        c.x -= p.vx;
        if (!c.collected && p.x < c.x + c.size && p.x + p.width > c.x && p.y < c.y + c.size && p.y + p.height > c.y) {
          c.collected = true; state.scoreAccumulator += 100; state.screenFlash = 0.35;
          setScore(prev => prev + 100); state.comboCount++; state.crystalsCaughtTotal++;
          if (currentTrack === 17) state.trackSeventeenCrystals++;
          engineRef.current?.onCrystalCollect(state.comboCount);
          burst(c.x + c.size / 2, c.y + c.size / 2, '#ffe65c', 25, 5);
          if (currentTrack === 17) {
            if (state.trackSeventeenCrystals === 5) triggerGlitchWarpToast("CHEF CRANKING THE HEAT");
            else if (state.trackSeventeenCrystals === 10) triggerGlitchWarpToast("BRAND SOVEREIGNTY SECURED");
            else if (state.trackSeventeenCrystals === 15) triggerGlitchWarpToast("TROJAN HORSE BREACH");
            else if (state.trackSeventeenCrystals === 16) triggerGlitchWarpToast("TRANSMITTING MAXIMUM DISSENT...");
          } else if (state.crystalsCaughtTotal % 5 === 0) {
            if (currentTrack === 3) triggerGlitchWarpToast("LIQUID REBEL_ DETECTED");
            else if (currentTrack === 6) triggerGlitchWarpToast("QUANTITY_ FOR_ SOVEREIGNTY");
            else if (currentTrack === 10) triggerGlitchWarpToast("ENTROPY RESIST_ DEPLOYED");
            else if (currentTrack === 14) triggerGlitchWarpToast("THE COOKBOOK ACQUISITION");
            else { setToastText(milestonePhrases[Math.floor(Math.random() * milestonePhrases.length)]); setToastActive(true); setTimeout(() => setToastActive(false), 1400); }
          }
          if (state.comboCount >= 2) feedback(c.x, c.y - 30, `COMBO x${state.comboCount}`); else feedback(c.x, c.y - 15);
          if (state.scoreAccumulator >= getRequiredScoreForClear(currentTrack)) {
            state.scoreAccumulator = 0; const next = currentTrack + 1;
            if (currentTrack === 17) { setIsAlbumCleared(true); playSfx(180, 'sine', 1.2, 0.35); return; }
            setCurrentTrack(next); checkpoint(); playSfx(440, 'triangle', 0.4, 0.2);
            if (next === 3) { setIsTrackThreeMilestone(true); setTimeout(() => setIsTrackThreeMilestone(false), 2000); }
            else if (next === 5) { setHasLevelFiveCheckpoint(true); setIsLevelFiveMilestone(true); setTimeout(() => setIsLevelFiveMilestone(false), 2200); }
            else if (next === 10) { setHasLevelTenCheckpoint(true); setIsLevelTenMilestone(true); setTimeout(() => setIsLevelTenMilestone(false), 2400); }
            else { setTrackTransition(true); setTimeout(() => setTrackTransition(false), 1500); }
          }
        }
      });
      if (trackTransition || isTrackThreeMilestone || isLevelFiveMilestone || isLevelTenMilestone) return;
      state.platforms = state.platforms.filter(pl => pl.x + pl.width > -120);
      state.crystals = state.crystals.filter(c => c.x > -50);
      if (state.platforms.length < 6) {
        const last = state.platforms[state.platforms.length - 1];
        let sty: 'solid'|'pillar'|'glitch' = 'solid';
        let minW = currentTrack === 17 ? 150 : currentTrack >= 15 ? 200 : 260;
        let maxW = currentTrack === 17 ? 250 : currentTrack >= 15 ? 300 : 380;
        let gap = currentTrack === 17 ? Math.random()*40+120 : currentTrack >= 15 ? Math.random()*40+95 : Math.random()*80+90;
        let w = Math.random()*(maxW-minW)+minW;
        if (currentTrack >= 5 && currentTrack < 12) { sty = Math.random()>0.4?'pillar':'solid'; if(sty==='pillar') w=Math.random()*50+240; }
        else if (currentTrack >= 12) { sty = Math.random()>0.45?'glitch':'pillar'; if(currentTrack<15) w=Math.random()*60+240; }
        const nx = last.x+last.width+gap; let mvs=20;
        if (currentTrack>=3) { const hf=currentTrack===17?12:10; mvs=Math.min(190,(currentTrack===17?70:50)+currentTrack*hf); }
        const dir=Math.random()>0.45?1:-1;
        const nby=Math.max(canvas.height-480,Math.min(canvas.height-180,last.baseY+Math.random()*mvs*dir));
        state.platforms.push({x:nx,y:nby,baseY:nby,width:w,height:600,styleType:sty,waveOffset:Math.random()*Math.PI*2});
        if (Math.random()>0.25) { const ch=currentTrack<=3?45:50+Math.random()*40; state.crystals.push({x:nx+w/2-12,y:nby-ch,size:24,collected:false,pulseOffset:Math.random()*Math.PI*2}); }
      }
      state.particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life--;p.alpha=Math.max(0,p.life/25);});
      state.particles=state.particles.filter(p=>p.life>0);
      state.floatTexts.forEach(t=>{t.y+=t.vy;t.life--;t.alpha=Math.max(0,t.life/45);});
      state.floatTexts=state.floatTexts.filter(t=>t.life>0);
      if (state.gameTicks%3===0) setFloatTexts([...state.floatTexts]);
    };

    const drawCanvas = () => {
      const sd = stateRef.current;
      let pc='#ff4e3e',sc2='#ffe65c',bg='#000000',gl=false;
      if (currentTrack>=3&&currentTrack<5){pc='#ff4e3e';sc2='#ffe65c';}
      else if(currentTrack>=5&&currentTrack<9){pc='#ffe65c';sc2='#ff4e3e';}
      else if(currentTrack>=9&&currentTrack<13){pc='#ffffff';sc2='#ff4e3e';bg='#0b0000';}
      else if(currentTrack>=13){gl=true;pc=sd.gameTicks%8<4?'#ff4e3e':'#ffe65c';sc2=sd.gameTicks%4<2?'#ffffff':'#000000';bg=sd.gameTicks%30===0?'#150000':'#000000';}
      ctx.save();
      if(currentTrack>=3)ctx.translate(Math.sin(sd.gameTicks*0.01)*15,0);
      if(gl&&sd.gameTicks%15<3)ctx.translate((Math.random()-0.5)*12,0);
      ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);
      if(sd.screenFlash>0){ctx.fillStyle=`rgba(255,78,62,${sd.screenFlash*0.12})`;ctx.fillRect(0,0,canvas.width,canvas.height);}
      ctx.save();ctx.strokeStyle=gl?'rgba(255,78,62,0.1)':`rgba(255,78,62,${currentTrack>=3?0.09:0.04})`;ctx.lineWidth=currentTrack>=3?2:1.5;
      const hor=canvas.height*0.35;
      for(let i=-200;i<canvas.width+200;i+=70){ctx.beginPath();ctx.moveTo(i,canvas.height);ctx.lineTo(canvas.width/2+(i-canvas.width/2)*0.08,hor);ctx.stroke();}
      ctx.restore();
      if(sd.milesTraveled<500){ctx.save();ctx.font='900 28px "Helvetica Neue",Arial,sans-serif';ctx.fillStyle=sc2;ctx.textAlign='center';ctx.fillText('CATCH THE CRYSTALS TO CLEAR THE LEVELS',canvas.width/2,canvas.height*0.28);ctx.restore();}
      ctx.save();sd.bannerTexts.forEach(b=>{ctx.font=`900 ${b.size}px "Helvetica Neue",sans-serif`;ctx.fillStyle=`rgba(255,78,62,${gl?b.alpha*2.5:b.alpha})`;ctx.fillText(b.text,b.x,b.y);});ctx.restore();
      ctx.save();ctx.font='900 14vw "Helvetica Neue",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=currentTrack>=9?'rgba(255,78,62,0.025)':'rgba(255,78,62,0.04)';ctx.fillText(String(Math.floor(sd.milesTraveled)).padStart(4,'0'),canvas.width/2,canvas.height/2);ctx.restore();
      ctx.save();ctx.font='13px monospace';sd.matrixColumns.forEach(col=>{col.chars.forEach((ch,idx)=>{const cy=col.y+idx*18;if(cy>0&&cy<canvas.height){ctx.fillStyle=idx===col.chars.length-1?sc2:`rgba(255,78,62,${0.1+(idx/col.chars.length)*0.35})`;ctx.fillText(ch,col.x,cy);}});});ctx.restore();
      sd.platforms.forEach(pl=>{ctx.fillStyle=pc;ctx.fillRect(pl.x,pl.y,pl.width,pl.height);ctx.fillStyle=sc2;ctx.fillRect(pl.x,pl.y,pl.width,5);});
      sd.crystals.forEach(c=>{if(c.collected)return;const fy=Math.sin(sd.gameTicks*0.1+c.pulseOffset)*8;ctx.save();ctx.translate(c.x+c.size/2,c.y+c.size/2+fy);ctx.rotate(sd.gameTicks*0.04);ctx.fillStyle=sc2;ctx.beginPath();ctx.moveTo(0,-c.size/2);ctx.lineTo(c.size/2,0);ctx.lineTo(0,c.size/2);ctx.lineTo(-c.size/2,0);ctx.closePath();ctx.fill();ctx.restore();});
      sd.particles.forEach(pt=>{ctx.save();ctx.globalAlpha=pt.alpha;ctx.fillStyle=pt.color;ctx.fillRect(pt.x,pt.y,pt.size,pt.size);ctx.restore();});
      const p=sd.player;const th=p.height*p.stretch;const tw=p.width/(p.stretch*0.85);
      ctx.save();ctx.translate(p.x+p.width/2,p.y+(p.height-th)+th/2);if(!p.isGrounded)ctx.rotate(p.vy*0.025);ctx.fillStyle=sc2;ctx.beginPath();ctx.moveTo(0,-th/2);ctx.lineTo(tw/2,0);ctx.lineTo(0,th/2);ctx.lineTo(-tw/2,0);ctx.closePath();ctx.fill();ctx.restore();
      const t=sd.warpToast;
      if(t.active){ctx.save();ctx.font='900 36px "Helvetica Neue",Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';const tw2=ctx.measureText(t.text).width;const sx=canvas.width/2-tw2/2;ctx.fillStyle='rgba(0,0,0,0.82)';ctx.fillRect(sx-40,t.y-35,tw2+80,70);ctx.strokeStyle=sc2;ctx.lineWidth=2;ctx.strokeRect(sx-40,t.y-35,tw2+80,70);for(let i=0;i<tw2;i+=2){const yo=Math.sin((sd.gameTicks*0.2)+(i*0.04))*14;ctx.save();ctx.beginPath();ctx.rect(sx+i,t.y-40,2,80);ctx.clip();ctx.fillStyle=(sd.gameTicks%10<5)?sc2:pc;ctx.fillText(t.text,canvas.width/2,t.y+yo);ctx.restore();}ctx.font='bold 9px monospace';ctx.fillStyle=pc;ctx.fillText("// OUTPUT_OVERRIDE_SIGNAL //",canvas.width/2,t.y-48);ctx.restore();}
      ctx.restore();
    };

    const gameLoop=(now:number)=>{
      animationFrameRef.current=requestAnimationFrame(gameLoop);
      const el=now-state.lastTime;
      if(el>state.fpsInterval){state.lastTime=now-(el%state.fpsInterval);updatePhysics();drawCanvas();}
    };
    animationFrameRef.current=requestAnimationFrame(gameLoop);
    return ()=>{cancelAnimationFrame(animationFrameRef.current);window.removeEventListener('resize',resizeCanvas);window.removeEventListener('keydown',handleKeyDown);window.removeEventListener('keyup',handleKeyUp);};
  },[isPlaying,currentTrack,trackTransition,isTrackThreeMilestone,isLevelFiveMilestone,isLevelTenMilestone,isAlbumCleared]);

  const handleReboot=(tier:'T-01'|'T-05'|'T-10')=>{
    const e=stateRef.current;
    e.player.x=140;e.player.y=300;e.player.vy=0;e.player.jumpCount=0;e.player.stretch=1;
    e.scoreAccumulator=0;e.gameTicks=0;e.milesTraveled=0;e.coyoteCounter=0;e.jumpBufferCounter=0;e.trackSeventeenCrystals=0;e.warpToast.active=false;
    setScore(0);setIsAlbumCleared(false);
    if(tier==='T-10'&&hasLevelTenCheckpoint)setCurrentTrack(10);
    else if(tier==='T-05'&&hasLevelFiveCheckpoint)setCurrentTrack(5);
    else setCurrentTrack(1);
    setIsPlaying(true);
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden" onClick={handleCanvasClick}>
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

      {isPlaying&&(<div className="absolute inset-0 pointer-events-none overflow-hidden z-20">{floatTexts.map(txt=>(<div key={txt.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 font-black text-2xl tracking-tight drop-shadow-[0_2px_5px_rgba(0,0,0,1)] mix-blend-difference select-none animate-pulse" style={{left:`${txt.x}px`,top:`${txt.y}px`,opacity:txt.alpha}}><BrandText text={txt.text} className="text-brandYellow font-black"/></div>))}</div>)}

      <div className="absolute top-6 left-6 right-6 flex justify-between items-start font-mono pointer-events-none z-10">
        <div className="flex flex-col"><span className="text-xs text-brandRed opacity-60">ALBUM PROJECT</span><BrandText text="OURO" className="text-3xl text-brandYellow"/></div>
        {isPlaying&&(<div className="flex flex-col items-center"><span className="text-[9px] text-brandRed opacity-50 tracking-widest uppercase">SCORE — ACT</span><span className="text-xs text-brandYellow font-bold tracking-widest uppercase">{nowPlayingAct}</span></div>)}
        <div className="flex gap-12 text-right">
          <div className="flex flex-col"><span className="text-xs text-brandRed opacity-60">MATRIX LEVEL</span><span className="text-xl text-brandYellow font-bold">TRACK {String(currentTrack).padStart(2,'0')}/17{currentTrack===17&&` [${stateRef.current.trackSeventeenCrystals}/17]`}</span></div>
          <div className="flex flex-col"><span className="text-xs text-brandRed opacity-60">ENERGY CAPTURED</span><span className="text-xl text-white font-bold tracking-wider">{score} pts</span></div>
        </div>
      </div>

      {isPlaying&&(<button onClick={e=>{e.stopPropagation();toggleMute();}} className="absolute z-30 pointer-events-auto font-mono text-xs tracking-widest border border-brandYellow/40 px-3 py-1 text-brandYellow/60 hover:text-brandYellow hover:border-brandYellow transition-all bg-black/40" style={{top:'80px',right:'24px'}}>{isMuted?'[ UNMUTE ]':'[ MUTE ]'}</button>)}

      {toastActive&&!isAlbumCleared&&(<div className="absolute top-28 left-1/2 transform -translate-x-1/2 px-8 py-4 border-2 border-brandYellow bg-black font-mono text-center select-none z-50 shadow-[4px_4px_0px_#ff4e3e]"><span className="text-[10px] text-brandRed block tracking-widest font-bold uppercase pb-1">// SYSTEM DATA INGEST //</span><BrandText text={toastText} className="text-2xl text-brandYellow font-black tracking-tight block"/></div>)}

      {isPlaying&&(<div className="absolute bottom-6 left-6 right-6 flex justify-between font-mono text-[10px] tracking-wider text-brandYellow/40 pointer-events-none select-none z-10 uppercase"><div className="flex flex-col gap-1 text-left"><span>[SPACE] / [W] — JUMP / DOUBLE LEAP</span><span>[MID-AIR TAP] — GRAVITY DOWN STAMP</span><span>[M] — MUTE / UNMUTE</span></div><div className="text-right flex flex-col justify-end text-brandYellow opacity-80 font-bold"><span>DEV KEYS // [1] T-01 // [3] T-03 // [5] T-05 // [0] T-10 // [6] T-15 // [9] T-17</span></div></div>)}

      {!isPlaying&&(<div className="absolute inset-0 bg-brandBlack flex items-center justify-center z-50 transition-all duration-300"><div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,78,62,0.3)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none"/><div className="w-full max-w-xl px-12 text-left space-y-8 relative z-10"><div className="space-y-2 border-l-4 border-brandRed pl-6"><span className="text-xs text-brandRed font-mono tracking-[0.3em] block uppercase opacity-70">// ENGINE_SHUTDOWN_SEQUENCE_METRICS</span><h2><BrandText text="OUTOFBOUNDS" className="text-5xl md:text-6xl text-brandRed block font-black tracking-tighter leading-none"/></h2></div><div className="font-mono text-xs text-gray-500 leading-relaxed max-w-md space-y-2 uppercase"><p>&gt; RUN STATUS: TERMINATED</p><p>&gt; TRACK {String(currentTrack).padStart(2,'0')}</p><div className="space-y-1 text-brandYellow font-bold pt-1">{hasLevelTenCheckpoint&&<p>&gt; RESTORE OVERRIDE: NODE T-10 ONLINE.</p>}{hasLevelFiveCheckpoint&&<p>&gt; RESTORE OVERRIDE: NODE T-05 ONLINE.</p>}</div></div><div className="pt-2 flex flex-wrap gap-4">{hasLevelTenCheckpoint&&<button onClick={()=>handleReboot('T-10')} className="bg-brandYellow hover:bg-brandYellow/80 text-black font-helvetica font-black py-4 px-6 text-xs uppercase tracking-widest transition-all cursor-pointer pointer-events-auto border-none active:scale-95">RESPAWN AT NODE (T-10)</button>}{hasLevelFiveCheckpoint&&<button onClick={()=>handleReboot('T-05')} className="bg-white hover:bg-white/80 text-black font-helvetica font-black py-4 px-6 text-xs uppercase tracking-widest transition-all cursor-pointer pointer-events-auto border-none active:scale-95">RESPAWN AT CHECKPOINT (T-05)</button>}<button onClick={()=>handleReboot('T-01')} className="bg-brandRed hover:bg-brandRed/80 text-black font-helvetica font-black py-4 px-6 text-xs uppercase tracking-widest transition-all cursor-pointer pointer-events-auto border-none active:scale-95">TOTAL REBOOT (T-01)</button></div></div></div>)}

      {isTrackThreeMilestone&&(<div className="absolute inset-0 bg-[#000000] flex flex-col items-center justify-center z-40"><div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ff4e3e_1.5px,transparent_1.5px)] bg-[size:24px_24px] pointer-events-none"/><div className="text-center max-w-xl px-12 space-y-3 border-y border-brandRed/40 py-10 bg-[#050000]"><span className="text-xs text-brandRed font-mono tracking-[0.4em] block uppercase animate-pulse">// WARNING: GRID GEOMETRY COUPLING //</span><h2><BrandText text="PHASE 02: DROOPY SOUL" className="text-4xl md:text-5xl text-brandYellow block font-black tracking-tight"/></h2><p className="text-[10px] text-gray-500 font-mono block uppercase tracking-widest">TUNNEL DISTORTION ACTIVATED. PARALLAX ANOMALIES EN ROUTE.</p></div></div>)}
      {trackTransition&&(<div className="absolute inset-0 bg-brandBlack/95 backdrop-blur-md flex flex-col items-center justify-center z-40"><div className="text-center space-y-2 max-w-md px-6 border-y border-brandRed/30 py-8 bg-[#050000]"><span className="text-xs text-brandRed font-mono tracking-[0.4em] block uppercase animate-pulse">SYNCHRONIZING REBEL OUTPUT MATRIX...</span><h2><BrandText text={`TRACK ${String(currentTrack).padStart(2,'0')}`} className="text-5xl md:text-6xl text-brandYellow block font-black"/></h2><span className="text-[10px] text-gray-500 font-mono block pt-2 uppercase tracking-widest">SAFE GRID LEVEL SECTOR INJECTED_</span></div></div>)}
      {isLevelFiveMilestone&&(<div className="absolute inset-0 bg-[#000000] flex flex-col items-center justify-center z-40"><div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(255,230,92,0.4)_1px,transparent_1px)] bg-[size:100%_6px] pointer-events-none"/><div className="text-center max-w-xl px-12 space-y-4 border border-brandYellow py-12 bg-[#080500] shadow-[0_0_50px_rgba(255,230,92,0.15)] animate-pulse"><span className="text-xs text-brandYellow font-mono tracking-[0.4em] block uppercase">// WARNING: SYSTEM METRIC EXTRAPOLATION //</span><h2><BrandText text="THE REBEL MATRIX ACCELERATES" className="text-4xl md:text-5xl text-brandRed block font-black tracking-tighter leading-none"/></h2><p className="text-xs text-brandYellow/60 font-mono uppercase tracking-widest">SCORE ACT II — MELHORES DIAS</p><p className="text-[11px] text-gray-400 font-mono max-w-xs mx-auto pt-2 uppercase">GRID ARCHITECTURE UNSTABLE. BASELINE SPEED ENHANCED. SESSION RECOVERY CHECKPOINT CREATED AT T-05.</p></div></div>)}
      {isLevelTenMilestone&&(<div className="absolute inset-0 bg-[#000000] flex flex-col items-center justify-center z-40"><div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(255,230,92,0.4)_1px,transparent_1px)] bg-[size:100%_6px] pointer-events-none"/><div className="text-center max-w-2xl px-12 space-y-4 border-2 border-brandRed py-16 bg-[#000000] shadow-[0_0_60px_rgba(255,78,62,0.3)]"><span className="text-xs text-brandRed font-mono tracking-[0.5em] block uppercase font-black">[!!] CORE SYSTEM PURGE DETECTED [!!]</span><h2><BrandText text="ENTROPY OVERLOAD" className="text-5xl md:text-6xl text-brandYellow block font-black tracking-tight"/></h2><p className="text-xs text-brandYellow/60 font-mono uppercase tracking-widest">SCORE ACT III — DILEMA</p><p className="text-xs text-gray-400 font-mono max-w-sm mx-auto pt-2 uppercase leading-relaxed">PLATFORM FOOTPRINT COORDINATES CORRUPTED. SESSION CHECKPOINT LOGGED_</p></div></div>)}
      {isAlbumCleared&&(<div className="absolute inset-0 bg-brandBlack flex items-center justify-center z-50"><div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffe65c_1.5px,transparent_1.5px)] bg-[size:32px_32px] pointer-events-none"/><div className="w-full max-w-2xl px-12 text-left space-y-8 relative z-10"><div className="space-y-3 border-l-4 border-brandYellow pl-6"><span className="text-xs text-brandYellow font-mono tracking-[0.4em] block uppercase">// COMPILATION_COMPLETE_SEQUENCE_SUCCESS //</span><h1><BrandText text="ALBUM TRANSMITTED" className="text-5xl md:text-6xl text-brandYellow block font-black tracking-tighter leading-none"/></h1></div><div className="font-mono text-xs text-gray-400 uppercase leading-relaxed space-y-3 max-w-md border border-brandYellow/20 p-6 bg-black/40 backdrop-blur-sm"><p className="text-brandYellow font-bold">&gt; RUN INTEGRITY: MAXIMUM MASTERED [17/17 TRACKS CLEAR]</p><p>&gt; TOTAL ENERGY CAPTURED: {score} METRIC UNITS</p><p>&gt; TOTAL DISTANCE TRAVELED: {Math.floor(stateRef.current.milesTraveled)} STEPS</p><p className="pt-2 text-gray-500 text-[10px] leading-normal font-sans tracking-wide">THE 17-TRACK MATRIX HAS TRAVELED DIRECTLY ACROSS THE DISCS OF DISSENT. THE CHEF HAS SECURED ABSOLUTE BRAND SOVEREIGNTY WITHIN THE SYSTEM LOOP. EXIT EN ROUTE.</p></div><div className="pt-2"><button onClick={()=>handleReboot('T-01')} className="bg-brandYellow hover:bg-brandRed text-black font-helvetica font-black py-4 px-10 text-sm uppercase tracking-widest transition-all duration-200 cursor-pointer pointer-events-auto border-none active:scale-95 shadow-[4px_4px_0px_#ff4e3e]">REBOOT MAIN GRIDS</button></div></div></div>)}
    </div>
  );
};
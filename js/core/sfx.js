// Синтезированные звуки (WebAudio): ничего не скачивается, работает офлайн.
import * as store from './store.js';
let ctx = null;
function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const on = () => store.get().sound;
const vol = () => store.get().volume;

function noise(dur, { freq = 2000, q = 1, gain = 0.4, type = 'bandpass', sweep = 0, delay = 0 } = {}) {
  const c = ac(); if (!c || !on()) return;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.value = gain * vol();
  const t = c.currentTime + delay;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(50, freq + sweep), t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}
function tone(freq, dur, { type = 'sine', gain = 0.25, delay = 0, slide = 0 } = {}) {
  const c = ac(); if (!c || !on()) return;
  const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = c.createGain();
  const t = c.currentTime + delay;
  if (slide) o.frequency.exponentialRampToValueAtTime(freq + slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * vol(), t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  unlock() { ac(); },
  deal() { noise(0.09, { freq: 2600, q: 0.8, gain: 0.5, sweep: -1200 }); },
  flip() { noise(0.07, { freq: 3200, q: 1.2, gain: 0.35, sweep: -1800 }); },
  chip() { tone(1900, 0.06, { type: 'triangle', gain: 0.18 }); tone(2600, 0.05, { type: 'triangle', gain: 0.1, delay: 0.02 }); },
  click() { tone(900, 0.04, { type: 'sine', gain: 0.12 }); },
  turn() { tone(660, 0.12, { gain: 0.14 }); tone(990, 0.16, { gain: 0.12, delay: 0.09 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { gain: 0.18, delay: i * 0.09, type: 'triangle' })); },
  lose() { tone(300, 0.3, { type: 'sawtooth', gain: 0.08, slide: -120 }); },
  tick() { tone(1400, 0.025, { type: 'square', gain: 0.05 }); },
  place() { tone(420, 0.08, { type: 'triangle', gain: 0.18, slide: -80 }); noise(0.04, { freq: 900, gain: 0.25 }); },
};

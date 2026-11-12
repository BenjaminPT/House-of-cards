// Общие утилиты для игровых движков (чистая логика, без DOM).
export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUIT_CH = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const isRed = (s) => s === 'H' || s === 'D';
export const clone = (o) => JSON.parse(JSON.stringify(o));

export function newDeck(n = 1) {
  const d = [];
  for (let k = 0; k < n; k++) for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  return d;
}

export function shuffle(a, rnd = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Криптостойкий, если доступен, иначе Math.random.
export function secureRnd() {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) {
    const buf = new Uint32Array(1);
    return () => {
      c.getRandomValues(buf);
      return buf[0] / 4294967296;
    };
  }
  return Math.random;
}

export const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];

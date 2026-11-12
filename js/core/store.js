// Настройки и профиль (localStorage). Без зависимостей.
const KEY = 'hoc.v1';
const rid = (n = 8) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

export const DEFAULTS = {
  id: null,
  name: '',
  sound: true,
  volume: 0.6,
  motion: 'full', // full | reduced
  theme: 'dark', // dark | light | auto
  table: 'graphite',
  fourColor: false,
  back: { design: 'diamonds', c1: '#1d2f4a', c2: '#d8b36a', emblem: 'spade', text: '', image: null, frame: 'thin', scale: 1 },
  slots: [null, null, null],
  stats: {},
};

let cache = null;
const subs = new Set();

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { s = {}; }
  const merged = { ...DEFAULTS, ...s, back: { ...DEFAULTS.back, ...(s.back || {}) } };
  if (!merged.id) merged.id = rid(10);
  if (!merged.name) merged.name = 'Игрок ' + Math.floor(100 + Math.random() * 900);
  return merged;
}

export function get() {
  if (!cache) { cache = load(); save(); }
  return cache;
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* квота (большая картинка) */ }
}
export function set(patch) {
  const s = get();
  Object.assign(s, patch);
  save();
  subs.forEach((f) => f(s));
}
export function setBack(patch) {
  const s = get();
  s.back = { ...s.back, ...patch };
  save();
  subs.forEach((f) => f(s));
}
export function subscribe(f) { subs.add(f); return () => subs.delete(f); }
export function bump(stat, by = 1) {
  const s = get();
  s.stats[stat] = (s.stats[stat] || 0) + by;
  save();
}
export { rid };

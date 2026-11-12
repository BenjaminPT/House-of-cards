// Статистика игрока и очки по режимам. Хранится локально (localStorage) и переживает выход из игры.
import * as store from './store.js';

const blank = () => ({ plays: 0, wins: 0, draws: 0, points: 0, net: 0, streak: 0, bestStreak: 0, recent: [], x: {} });

export function get(game) {
  const s = store.get();
  return { ...blank(), ...(s.stats && s.stats[game] ? s.stats[game] : {}) };
}
export function all() {
  const s = store.get();
  return Object.fromEntries(Object.keys(s.stats || {}).map((k) => [k, get(k)]));
}
export function totals() {
  const t = { plays: 0, wins: 0, points: 0 };
  for (const g of Object.values(all())) { t.plays += g.plays; t.wins += g.wins; t.points += g.points; }
  return t;
}

/**
 * Запись результата.
 * d: { play, win, draw, points, net }   — основные счётчики
 * ex: { add: {ключ: n}, max: {ключ: n}, min: {ключ: n} } — доп. показатели режима
 */
export function rec(game, d = {}, ex = {}) {
  const s = store.get();
  s.stats = s.stats || {};
  const g = (s.stats[game] = { ...blank(), ...(s.stats[game] || {}) });
  g.x = g.x || {};
  g.plays += d.play || 0; g.wins += d.win || 0; g.draws += d.draw || 0; g.points += Math.max(0, d.points || 0); g.net += d.net || 0;
  if (d.play) {
    g.recent = [...g.recent, d.win ? 'w' : d.draw ? 'd' : 'l'].slice(-24);
    if (d.win) { g.streak++; g.bestStreak = Math.max(g.bestStreak, g.streak); } else if (!d.draw) g.streak = 0;
  } else if (d.win) { g.wins += 0; }
  for (const [k, n] of Object.entries(ex.add || {})) g.x[k] = (g.x[k] || 0) + n;
  for (const [k, n] of Object.entries(ex.max || {})) g.x[k] = Math.max(g.x[k] || 0, n);
  for (const [k, n] of Object.entries(ex.min || {})) g.x[k] = g.x[k] ? Math.min(g.x[k], n) : n;
  store.set({ stats: s.stats });
}
export function reset() { store.set({ stats: {} }); }
export const rate = (g) => (g.plays ? Math.round((g.wins / g.plays) * 100) : 0);
export const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

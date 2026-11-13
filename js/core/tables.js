// Параметры столов: масштаб фишек под баланс, пресеты входа, стеки ботов.
import { mulberry32 } from '../engines/common.js';

// Минимальный вход и «сколько юнитов в стеке» для каждой игры
export const BUYIN = {
  poker: { min: 200, per: 150 },
  blackjack: { min: 100, per: 100 },
  roulette: { min: 100, per: 200 },
};

const NICE = [1, 2, 5];
/** Ближайшее «круглое» число (1-2-5 × 10^k) не больше x, минимум 1. */
export function niceFloor(x) {
  if (x < 1) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  let best = p;
  for (const m of NICE) if (m * p <= x) best = m * p;
  return best;
}

/** Размер юнита (минимальной фишки/ставки) для входа buyIn. */
export const unitFor = (game, buyIn) => niceFloor(buyIn / BUYIN[game].per);

/** Предлагаемые суммы входа от баланса. */
export function buyInPresets(game, balance) {
  const { min } = BUYIN[game];
  if (balance < min) return [];
  const out = new Set();
  for (const f of [0.1, 0.25, 0.5, 1]) {
    let v = f === 1 ? balance : niceFloor(balance * f);
    if (f !== 1 && v < min) v = min;
    if (v >= min && v <= balance) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Стеки ботов подбираются под вход игрока: от ~0,5× до ~2,2×, все разные и ни один не равен входу.
 * Игрок при этом может выиграть сколько угодно — потолка стола нет.
 */
export function botStacks(game, buyIn, n, seed = Date.now()) {
  const rnd = mulberry32((seed >>> 0) ^ 0x9e3779b9);
  const u = unitFor(game, buyIn);
  const step = Math.max(1, u);
  const used = new Set([buyIn]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = Math.exp(Math.log(0.5) + rnd() * (Math.log(2.2) - Math.log(0.5)));
    let v = Math.max(step * 20, Math.round((buyIn * f) / step) * step);
    while (used.has(v)) v += step * (1 + Math.floor(rnd() * 3));
    used.add(v); out.push(v);
  }
  return out;
}

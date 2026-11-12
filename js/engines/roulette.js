// Европейская рулетка (один ноль), общий стол для нескольких игроков.
export const meta = {
  id: 'roulette', name: 'Рулетка', min: 1, max: 6,
  desc: 'Европейская рулетка: все виды ставок, общий стол.',
};
const START = 1000;
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');
export const numAt = (c, r) => 3 * c + (3 - r); // колонка 0..11, строка 0..2 (сверху)

// ---- допустимые ставки ----
const SPOTS = new Map();
const key = (nums) => [...nums].sort((a, b) => a - b).join('-');
const addSpot = (nums, type, payout, label) => SPOTS.set(key(nums), { type, payout, label, nums: [...nums].sort((a, b) => a - b) });
for (let n = 0; n <= 36; n++) addSpot([n], 'straight', 35, `№${n}`);
for (let c = 0; c < 12; c++) for (let r = 0; r < 3; r++) {
  if (c < 11) addSpot([numAt(c, r), numAt(c + 1, r)], 'split', 17, 'Сплит');
  if (r < 2) addSpot([numAt(c, r), numAt(c, r + 1)], 'split', 17, 'Сплит');
  if (c < 11 && r < 2) addSpot([numAt(c, r), numAt(c + 1, r), numAt(c, r + 1), numAt(c + 1, r + 1)], 'corner', 8, 'Угол');
}
for (const n of [1, 2, 3]) addSpot([0, n], 'split', 17, 'Сплит');
for (let c = 0; c < 12; c++) addSpot([3 * c + 1, 3 * c + 2, 3 * c + 3], 'street', 11, 'Стрит');
for (let c = 0; c < 11; c++) addSpot([3 * c + 1, 3 * c + 2, 3 * c + 3, 3 * c + 4, 3 * c + 5, 3 * c + 6], 'six', 5, 'Шестёрка');
addSpot([0, 1, 2], 'trio', 11, 'Трио'); addSpot([0, 2, 3], 'trio', 11, 'Трио'); addSpot([0, 1, 2, 3], 'basket', 8, 'Корзина');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
for (let k = 1; k <= 3; k++) addSpot(range(1, 36).filter((n) => n % 3 === k % 3), 'column', 2, `Колонка ${k}`);
addSpot(range(1, 12), 'dozen', 2, '1-я дюжина'); addSpot(range(13, 24), 'dozen', 2, '2-я дюжина'); addSpot(range(25, 36), 'dozen', 2, '3-я дюжина');
addSpot(range(1, 18), 'even', 1, '1–18'); addSpot(range(19, 36), 'even', 1, '19–36');
addSpot(range(1, 36).filter((n) => n % 2 === 0), 'even', 1, 'Чёт'); addSpot(range(1, 36).filter((n) => n % 2 === 1), 'even', 1, 'Нечет');
addSpot([...REDS], 'even', 1, 'Красное'); addSpot(range(1, 36).filter((n) => !REDS.has(n)), 'even', 1, 'Чёрное');

export const spotInfo = (nums) => SPOTS.get(key(nums)) || null;
export const spotKey = key;

export function init(players, opts = {}, rnd = Math.random) {
  return {
    game: 'roulette', phase: 'bet', round: 1, spinId: 0, result: null, history: [],
    players: players.map((p) => ({
      id: p.id, name: p.name, bot: !!p.bot, chips: START, bets: [], stack: [], ready: false, last: [], delta: 0,
    })),
  };
}

const staked = (p) => p.bets.reduce((a, b) => a + b.amount, 0);

function place(p, nums, amount) {
  const info = spotInfo(nums);
  const k = key(nums);
  let b = p.bets.find((x) => x.key === k);
  if (!b) { b = { key: k, nums: info.nums, amount: 0, payout: info.payout, label: info.label, type: info.type }; p.bets.push(b); }
  b.amount += amount; p.chips -= amount;
  p.stack.push({ key: k, amount });
}

export function act(st, pid, a, rnd = Math.random) {
  if (pid === 'sys') {
    if (a.t === 'settle' && st.phase === 'spin') {
      const n = st.result.n;
      for (const p of st.players) {
        let back = 0;
        const s = staked(p);
        for (const b of p.bets) if (b.nums.includes(n)) back += b.amount * (b.payout + 1);
        p.chips += back;
        p.delta = back - s;
        p.last = p.bets.map((b) => ({ nums: b.nums, amount: b.amount }));
      }
      st.phase = 'result';
      return null;
    }
    if (a.t === 'newRound' && st.phase === 'result') {
      st.phase = 'bet'; st.round++;
      st.result = null;
      for (const p of st.players) { p.bets = []; p.stack = []; p.ready = false; }
      return null;
    }
    return 'bad-sys';
  }
  const p = st.players.find((x) => x.id === pid);
  if (!p) return 'no-player';
  if (st.phase !== 'bet') return 'locked';
  switch (a.t) {
    case 'bet': {
      const amt = Math.floor(+a.amount);
      if (p.ready || !(amt > 0) || amt > p.chips || !Array.isArray(a.nums) || !spotInfo(a.nums)) return 'bad-bet';
      place(p, a.nums, amt); return null;
    }
    case 'undo': {
      if (p.ready) return 'locked';
      const last = p.stack.pop();
      if (!last) return null;
      const b = p.bets.find((x) => x.key === last.key);
      b.amount -= last.amount; p.chips += last.amount;
      if (b.amount <= 0) p.bets.splice(p.bets.indexOf(b), 1);
      return null;
    }
    case 'clear':
      if (p.ready) return 'locked';
      p.chips += staked(p); p.bets = []; p.stack = []; return null;
    case 'repeat': {
      if (p.ready || p.bets.length) return 'cannot';
      const total = p.last.reduce((x, b) => x + b.amount, 0);
      if (!total || total > p.chips) return 'cannot';
      for (const b of p.last) place(p, b.nums, b.amount);
      return null;
    }
    case 'rebuy':
      if (p.chips > 0 || p.bets.length || p.ready) return 'cannot';
      p.chips = START; return null;
    case 'ready':
      if (p.ready) return null;
      p.ready = true;
      if (st.players.every((x) => x.ready)) {
        st.phase = 'spin'; st.spinId++;
        st.result = { n: Math.floor(rnd() * 37) };
        st.result.color = colorOf(st.result.n);
        st.history.unshift(st.result.n);
        st.history = st.history.slice(0, 14);
      }
      return null;
    case 'unready':
      p.ready = false; return null;
    default: return 'unknown';
  }
}

export function pending(st) {
  if (st.phase === 'bet') return st.players.filter((p) => !p.ready).map((p) => p.id);
  return [];
}
export function auto(st) {
  if (st.phase === 'spin') return { delay: 7600, action: { t: 'settle' } };
  if (st.phase === 'result') return { delay: 4200, action: { t: 'newRound' } };
  return null;
}
export function timeoutAction() { return { t: 'ready' }; }
export function view(st, pid) {
  const v = JSON.parse(JSON.stringify(st));
  v.me = pid;
  v.staked = Object.fromEntries(st.players.map((p) => [p.id, staked(p)]));
  return v;
}

export function bot(st, pid, rnd = Math.random) {
  const p = st.players.find((x) => x.id === pid);
  if (!p || st.phase !== 'bet' || p.ready) return null;
  if (p.chips <= 0 && !p.bets.length) return { t: 'rebuy' };
  const target = 1 + ((st.round + st.players.indexOf(p)) % 3);
  if (p.stack.length >= target || p.chips < 5) return { t: 'ready' };
  const amount = Math.max(5, Math.min(p.chips, Math.round((p.chips * (0.02 + rnd() * 0.05)) / 5) * 5));
  const roll = rnd();
  let nums;
  if (roll < 0.45) nums = [...[...SPOTS.values()].filter((s) => s.type === 'even')[Math.floor(rnd() * 6)].nums];
  else if (roll < 0.65) nums = [...[...SPOTS.values()].filter((s) => s.type === 'dozen' || s.type === 'column')[Math.floor(rnd() * 6)].nums];
  else if (roll < 0.8) { const sp = [...SPOTS.values()].filter((s) => s.type === 'split'); nums = sp[Math.floor(rnd() * sp.length)].nums; }
  else nums = [Math.floor(rnd() * 37)];
  return { t: 'bet', nums, amount };
}

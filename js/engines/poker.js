// Техасский холдем: 2–6 игроков, турнирные стеки, растущие блайнды, сайд-поты.
import { newDeck, shuffle, RANKS } from './common.js';

export const meta = {
  id: 'poker', name: 'Покер', min: 2, max: 6,
  desc: 'Техасский холдем: блайнды, олл-ин, сайд-поты.',
};
const START = 1500;
// блайнды в «юнитах» стола (unit = 1 ставка-фишка); BB стартует с 2 юнитов
const LEVELS = [[1, 2], [2, 4], [3, 6], [5, 10], [8, 16], [10, 20], [15, 30], [20, 40], [30, 60], [50, 100]];
const RAKE_PCT = 0.05, RAKE_CAP_BB = 3; // как в казино: 5% с банка, не больше 3 BB, и только если был флоп
const HANDS_PER_LEVEL = 6;
const rv = (r) => (r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : +r);
export const HAND_NAMES = ['Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш'];

// ---- оценка рук ----
function score5(c) {
  const v = c.map((x) => rv(x.r)).sort((a, b) => b - a);
  const flush = c.every((x) => x.s === c[0].s);
  const uniq = [...new Set(v)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (v[0] - v[4] === 4) straightHigh = v[0];
    else if (v[0] === 14 && v[1] === 5 && v[4] === 2) straightHigh = 5;
  }
  const cnt = {};
  for (const x of v) cnt[x] = (cnt[x] || 0) + 1;
  const groups = Object.entries(cnt).map(([k, n]) => [n, +k]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const g = groups.map((x) => x[1]);
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][0] === 4) return [7, ...g];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...g];
  if (flush) return [5, ...v];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, ...g];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...g];
  if (groups[0][0] === 2) return [1, ...g];
  return [0, ...v];
}
export function cmp(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}
export function bestOf(cards) {
  let best = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++) for (let b = a + 1; b < n - 3; b++) for (let c = b + 1; c < n - 2; c++)
    for (let d = c + 1; d < n - 1; d++) for (let e = d + 1; e < n; e++) {
      const s = score5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
      if (!best || cmp(s, best) > 0) best = s;
    }
  return best;
}

// ---- состояние ----
function blinds(st) {
  const lvl = Math.min(LEVELS.length - 1, Math.floor(Math.max(0, st.hands - 1) / HANDS_PER_LEVEL));
  return LEVELS[lvl].map((x) => x * st.unit);
}
const alive = (st) => st.players.filter((p) => p.chips > 0 || p.total > 0 || !p.out);
const canAct = (p) => !p.folded && !p.allin && !p.out;

export function init(players, opts = {}, rnd = Math.random) {
  const styles = [0.85, 1, 1.2, 0.95, 1.1, 0.9];
  const st = {
    game: 'poker', unit: opts.unit || 10, rake: 0, rakeTotal: 0, phase: 'preflop', hands: 0, seq: 0, deck: [], board: [], dealer: -1, current: -1,
    currentBet: 0, lastRaise: 0, sb: 10, bb: 20, result: null, winner: null, reveal: false, lastAction: null,
    players: players.map((p, i) => ({
      id: p.id, name: p.name, bot: !!p.bot, chips: p.chips ?? opts.buyIn ?? START, start: p.chips ?? opts.buyIn ?? START, bet: 0, total: 0, folded: false, allin: false,
      acted: false, out: false, hole: [], act: null, style: styles[i % styles.length],
    })),
  };
  startHand(st, rnd);
  return st;
}

const nextIdx = (st, from, pred) => {
  const n = st.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(st.players[i])) return i;
  }
  return -1;
};

function startHand(st, rnd) {
  const live = st.players.filter((p) => p.chips > 0);
  if (live.length < 2) {
    st.phase = 'game_over';
    st.winner = live[0] ? live[0].id : null;
    st.current = -1;
    for (const p of st.players) { p.total = 0; p.bet = 0; }
    return;
  }
  st.hands++;
  [st.sb, st.bb] = blinds(st);
  st.deck = shuffle(newDeck(1), rnd);
  st.board = [];
  st.result = null; st.reveal = false; st.lastAction = null;
  for (const p of st.players) {
    p.bet = 0; p.total = 0; p.folded = p.chips <= 0; p.out = p.chips <= 0; p.allin = false;
    p.acted = false; p.hole = []; p.act = null;
  }
  st.dealer = nextIdx(st, st.dealer, (p) => p.chips > 0);
  const headsUp = live.length === 2;
  const sbI = headsUp ? st.dealer : nextIdx(st, st.dealer, (p) => p.chips > 0);
  const bbI = nextIdx(st, sbI, (p) => p.chips > 0);
  const post = (i, amt) => {
    const p = st.players[i];
    const a = Math.min(amt, p.chips);
    p.chips -= a; p.bet += a; p.total += a;
    if (p.chips === 0) p.allin = true;
  };
  post(sbI, st.sb); post(bbI, st.bb);
  st.sbIdx = sbI; st.bbIdx = bbI;
  st.currentBet = Math.max(st.players[sbI].bet, st.players[bbI].bet);
  st.lastRaise = st.bb;
  for (let r = 0; r < 2; r++) for (let k = 0; k < st.players.length; k++) {
    const i = (st.dealer + 1 + k) % st.players.length;
    const p = st.players[i];
    if (!p.out) p.hole.push({ ...st.deck.pop(), i: st.seq++ });
  }
  st.phase = 'preflop';
  st.current = headsUp ? st.dealer : nextIdx(st, bbI, canAct);
  if (st.current >= 0 && !canAct(st.players[st.current])) st.current = nextIdx(st, st.current, canAct); // короткий стек уже в олл-ине
  if (st.current === -1 || st.players.filter(canAct).length < 2 && st.players[st.current] && st.players[st.current].bet >= st.currentBet) st.current = -1;
}

const potTotal = (st) => st.players.reduce((a, p) => a + p.total, 0);

function roundComplete(st) {
  const act = st.players.filter(canAct);
  return act.every((p) => p.acted && p.bet === st.currentBet) || act.length === 0 ||
    (act.length === 1 && act[0].bet >= st.currentBet && st.players.filter((p) => !p.folded).every((p) => p.allin || p === act[0]));
}

function afterAction(st) {
  const left = st.players.filter((p) => !p.folded);
  if (left.length === 1) { award(st, false); return; }
  if (roundComplete(st)) { st.current = -1; return; }
  st.current = nextIdx(st, st.current, (p) => canAct(p) && !(p.acted && p.bet === st.currentBet));
}

function street(st) {
  for (const p of st.players) { p.bet = 0; p.acted = false; }
  st.currentBet = 0; st.lastRaise = st.bb;
  const deal = (n) => { for (let k = 0; k < n; k++) st.board.push({ ...st.deck.pop(), i: st.seq++ }); };
  if (st.phase === 'preflop') { st.phase = 'flop'; deal(3); }
  else if (st.phase === 'flop') { st.phase = 'turn'; deal(1); }
  else if (st.phase === 'turn') { st.phase = 'river'; deal(1); }
  else if (st.phase === 'river') { award(st, true); return; }
  st.current = st.players.filter(canAct).length >= 2 ? nextIdx(st, st.dealer, canAct) : -1;
}

function award(st, showdown) {
  const contenders = st.players.filter((p) => !p.folded);
  const pots = [];
  const names = {};
  const scores = {};
  if (showdown) {
    for (const p of contenders) { scores[p.id] = bestOf([...p.hole, ...st.board]); names[p.id] = HAND_NAMES[scores[p.id][0]]; }
    st.reveal = true;
  }
  const levels = [...new Set(contenders.map((p) => p.total))].sort((a, b) => a - b);
  // рейк: только если флоп был сдан; берём с основного банка
  let rake = 0;
  if (st.board.length >= 3) rake = Math.min(Math.floor(st.players.reduce((a, p) => a + p.total, 0) * RAKE_PCT), st.bb * RAKE_CAP_BB);
  st.rake = rake; st.rakeTotal += rake;
  let rakeLeft = rake;
  let prev = 0;
  levels.forEach((L, idx) => {
    let amount = 0;
    for (const p of st.players) amount += Math.min(Math.max(p.total - prev, 0), L - prev);
    if (idx === levels.length - 1) for (const p of st.players) amount += Math.max(p.total - L, 0);
    if (rakeLeft > 0) { const cut = Math.min(rakeLeft, amount); amount -= cut; rakeLeft -= cut; }
    const el = contenders.filter((p) => p.total >= L);
    let winners = el;
    if (showdown && el.length > 1) {
      let best = null;
      for (const p of el) if (!best || cmp(scores[p.id], best) > 0) best = scores[p.id];
      winners = el.filter((p) => cmp(scores[p.id], best) === 0);
    }
    const share = Math.floor(amount / winners.length);
    let rest = amount - share * winners.length;
    // остаток — ближайшему по часовой от дилера
    const order = [...winners].sort((a, b) => ((st.players.indexOf(a) - st.dealer + 99) % st.players.length) - ((st.players.indexOf(b) - st.dealer + 99) % st.players.length));
    order.forEach((w) => { w.chips += share + (rest > 0 ? 1 : 0); if (rest > 0) rest--; });
    pots.push({ amount, winners: winners.map((w) => w.id), hand: showdown ? names[winners[0].id] : null });
    prev = L;
  });
  st.result = { pots, showdown, names };
  st.phase = 'hand_over';
  st.current = -1;
  for (const p of st.players) { p.bet = 0; if (p.chips <= 0) p.out = true; }
}

export function act(st, pid, a, rnd = Math.random) {
  if (pid === 'sys') {
    if (a.t === 'street' && ['preflop', 'flop', 'turn', 'river'].includes(st.phase) && st.current === -1) { street(st); return null; }
    if (a.t === 'nextHand' && st.phase === 'hand_over') { startHand(st, rnd); return null; }
    return 'bad-sys';
  }
  if (a.t === 'next' && st.phase === 'hand_over') { startHand(st, rnd); return null; }
  if (a.t === 'restart' && st.phase === 'game_over') {
    for (const p of st.players) { p.chips = p.start; p.out = false; }
    st.hands = 0; st.dealer = -1; startHand(st, rnd); return null;
  }
  const idx = st.players.findIndex((p) => p.id === pid);
  if (idx < 0) return 'no-player';
  if (st.current !== idx) return 'not-your-turn';
  const p = st.players[idx];
  const toCall = st.currentBet - p.bet;
  const label = (t, amt) => { p.act = { t, amt }; st.lastAction = { pid, t, amt }; };
  switch (a.t) {
    case 'fold': p.folded = true; label('fold'); break;
    case 'check':
      if (toCall > 0) return 'cannot-check';
      label('check'); break;
    case 'call': {
      if (toCall <= 0) return 'nothing-to-call';
      const amt = Math.min(toCall, p.chips);
      p.chips -= amt; p.bet += amt; p.total += amt;
      if (p.chips === 0) p.allin = true;
      label(p.allin ? 'allin' : 'call', p.bet);
      break;
    }
    case 'raise': case 'allin': {
      let to = a.t === 'allin' ? p.bet + p.chips : Math.floor(+a.to);
      const max = p.bet + p.chips;
      if (!(to > st.currentBet)) { if (a.t === 'allin') { to = max; } else return 'bad-raise'; }
      if (to > max) to = max;
      const minTo = st.currentBet + st.lastRaise;
      if (to < minTo && to < max) return 'below-min';
      const add = to - p.bet;
      p.chips -= add; p.bet = to; p.total += add;
      if (p.chips === 0) p.allin = true;
      const size = to - st.currentBet;
      if (to > st.currentBet) {
        if (size >= st.lastRaise) st.lastRaise = size;
        st.currentBet = to;
        for (const q of st.players) if (q !== p && canAct(q)) q.acted = false;
      }
      label(p.allin ? 'allin' : st.currentBet === to && toCall === 0 && st.phase !== 'preflop' && size === to ? 'bet' : 'raise', to);
      break;
    }
    default: return 'unknown';
  }
  p.acted = true;
  afterAction(st);
  return null;
}

export function limits(st, pid) {
  const p = st.players.find((x) => x.id === pid);
  if (!p) return null;
  const toCall = Math.min(st.currentBet - p.bet, p.chips);
  const max = p.bet + p.chips;
  const minTo = Math.min(max, st.currentBet + st.lastRaise);
  return { toCall, minTo, maxTo: max, pot: potTotal(st), canRaise: p.chips > toCall && max > st.currentBet };
}

export function pending(st) {
  return st.current >= 0 ? [st.players[st.current].id] : [];
}
export function auto(st) {
  if (['preflop', 'flop', 'turn', 'river'].includes(st.phase) && st.current === -1) {
    const runout = st.players.filter(canAct).length < 2;
    return { delay: runout ? 1100 : 700, action: { t: 'street' } };
  }
  if (st.phase === 'hand_over') return { delay: 5200, action: { t: 'nextHand' } };
  return null;
}
export function timeoutAction(st, pid) {
  const p = st.players.find((x) => x.id === pid);
  return st.currentBet - p.bet > 0 ? { t: 'fold' } : { t: 'check' };
}

export function view(st, pid) {
  const v = JSON.parse(JSON.stringify({ ...st, deck: undefined }));
  v.players.forEach((p, i) => {
    const show = p.id === pid || (st.reveal && !st.players[i].folded);
    if (!show) p.hole = p.hole.map((c) => ({ i: c.i, h: 1 }));
  });
  v.pot = potTotal(st);
  v.me = pid;
  v.limits = st.current >= 0 && st.players[st.current].id === pid ? limits(st, pid) : null;
  return v;
}

// ---- бот: equity по Монте-Карло ----
function equity(st, p, sims, rnd) {
  const known = [...p.hole, ...st.board];
  const used = new Set(known.map((c) => c.r + c.s));
  const rest = newDeck(1).filter((c) => !used.has(c.r + c.s));
  const opps = st.players.filter((q) => q !== p && !q.folded).length;
  let win = 0;
  for (let s = 0; s < sims; s++) {
    const d = shuffle(rest.slice(), rnd);
    let k = 0;
    const board = st.board.slice();
    while (board.length < 5) board.push(d[k++]);
    const mine = bestOf([...p.hole, ...board]);
    let best = true, tie = 0;
    for (let o = 0; o < opps; o++) {
      const sc = bestOf([d[k++], d[k++], ...board]);
      const c = cmp(sc, mine);
      if (c > 0) { best = false; break; }
      if (c === 0) tie++;
    }
    if (best) win += tie ? 1 / (tie + 1) : 1;
  }
  return win / sims;
}

export function bot(st, pid, rnd = Math.random) {
  const idx = st.players.findIndex((p) => p.id === pid);
  if (idx < 0 || st.current !== idx) return null;
  const p = st.players[idx];
  const L = limits(st, pid);
  const toCall = L.toCall;
  const pot = L.pot;
  const eq = equity(st, p, 110, rnd);
  const potOdds = toCall / (pot + toCall || 1);
  const aggr = p.style;
  const raiseTo = (frac) => {
    let to = st.currentBet + Math.max(st.lastRaise, Math.round((pot * frac) / 5) * 5);
    to = Math.max(L.minTo, Math.min(to, L.maxTo));
    return to >= L.maxTo - st.bb ? { t: 'allin' } : { t: 'raise', to };
  };
  if (toCall === 0) {
    if (eq > 0.66 / aggr && L.canRaise && rnd() < 0.8) return raiseTo(0.45 + rnd() * 0.4);
    if (eq > 0.5 && L.canRaise && rnd() < 0.3 * aggr) return raiseTo(0.4);
    if (L.canRaise && rnd() < 0.06 * aggr) return raiseTo(0.5);
    return { t: 'check' };
  }
  if (eq > 0.78 && L.canRaise && rnd() < 0.7) return raiseTo(0.6 + rnd() * 0.5);
  if (eq > potOdds + 0.06 / aggr) {
    if (eq > 0.62 && L.canRaise && rnd() < 0.25 * aggr) return raiseTo(0.5);
    return { t: 'call' };
  }
  if (rnd() < 0.04 * aggr && toCall <= st.bb * 2) return { t: 'call' };
  return { t: 'fold' };
}

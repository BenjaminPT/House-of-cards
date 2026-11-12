// Косынка (Klondike). У каждого игрока своё поле; в онлайне — дуэль на одной раздаче.
import { newDeck, shuffle, mulberry32, SUITS, isRed } from './common.js';

export const meta = {
  id: 'solitaire', name: 'Пасьянс', min: 1, max: 4,
  desc: 'Косынка: перетаскивание, отмена, подсказки, дуэль онлайн.',
};
const RV = { A: 1, J: 11, Q: 12, K: 13 };
export const rankVal = (r) => RV[r] || +r;

function newBoard(seed, draw) {
  const rnd = mulberry32(seed);
  const deck = shuffle(newDeck(1), rnd).map((c, i) => ({ ...c, i }));
  const tab = [];
  for (let c = 0; c < 7; c++) {
    const pile = [];
    for (let k = 0; k <= c; k++) pile.push({ ...deck.pop(), up: k === c });
    tab.push(pile);
  }
  return { stock: deck.map((c) => ({ ...c, up: false })), waste: [], found: [[], [], [], []], tab, moves: 0, score: 0, draw, history: [], won: false, recycles: 0 };
}

export function init(players, opts = {}) {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const draw = opts.draw === 3 ? 3 : 1;
  return {
    game: 'solitaire', seed, draw, winner: null,
    players: players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot, board: newBoard(seed, draw) })),
  };
}

const snap = (b) => JSON.stringify({ stock: b.stock, waste: b.waste, found: b.found, tab: b.tab, moves: b.moves, score: b.score, recycles: b.recycles });
function pushHistory(b) { b.history.push(snap(b)); if (b.history.length > 300) b.history.shift(); }

export function canTab(card, top) {
  if (!top) return card.r === 'K';
  return top.up && isRed(card.s) !== isRed(top.s) && rankVal(card.r) === rankVal(top.r) - 1;
}
export function canFound(card, pile, suitIdx) {
  return SUITS[suitIdx] === card.s && rankVal(card.r) === pile.length + 1;
}

function getSource(b, from) {
  if (from.k === 'waste') { const c = b.waste[b.waste.length - 1]; return c ? [c] : null; }
  if (from.k === 'found') { const c = b.found[from.s][b.found[from.s].length - 1]; return c ? [c] : null; }
  if (from.k === 'tab') {
    const pile = b.tab[from.col];
    if (!pile || from.idx < 0 || from.idx >= pile.length) return null;
    const seq = pile.slice(from.idx);
    if (!seq.every((c) => c.up)) return null;
    for (let i = 1; i < seq.length; i++) if (!canTab(seq[i], seq[i - 1])) return null;
    return seq;
  }
  return null;
}

export function tryMove(b, from, to) {
  const seq = getSource(b, from);
  if (!seq) return null;
  const lead = seq[0];
  let gain = 0;
  if (to.k === 'found') {
    if (seq.length !== 1 || !canFound(lead, b.found[to.s], to.s)) return null;
    gain = from.k === 'found' ? 0 : 10;
  } else if (to.k === 'tab') {
    if (from.k === 'tab' && from.col === to.col) return null;
    const top = b.tab[to.col][b.tab[to.col].length - 1];
    if (!canTab(lead, top)) return null;
    gain = from.k === 'waste' ? 5 : from.k === 'found' ? -15 : 0;
  } else return null;
  return { seq, gain };
}

function applyMove(b, from, to, seq, gain) {
  pushHistory(b);
  if (from.k === 'waste') b.waste.pop();
  else if (from.k === 'found') b.found[from.s].pop();
  else b.tab[from.col].splice(from.idx);
  if (to.k === 'found') b.found[to.s].push({ ...seq[0], up: true });
  else b.tab[to.col].push(...seq.map((c) => ({ ...c, up: true })));
  if (from.k === 'tab') {
    const pile = b.tab[from.col];
    const top = pile[pile.length - 1];
    if (top && !top.up) { top.up = true; gain += 5; }
  }
  b.moves++;
  b.score = Math.max(0, b.score + gain);
  if (b.found.every((f) => f.length === 13)) b.won = true;
}

export function hints(b) {
  const out = [];
  const tops = [];
  if (b.waste.length) tops.push({ k: 'waste' });
  b.tab.forEach((pile, col) => pile.forEach((c, idx) => { if (c.up) tops.push({ k: 'tab', col, idx }); }));
  for (const from of tops) {
    for (let s = 0; s < 4; s++) { const to = { k: 'found', s }; if (tryMove(b, from, to)) out.push({ from, to, p: 3 }); }
    for (let col = 0; col < 7; col++) {
      const to = { k: 'tab', col };
      const m = tryMove(b, from, to);
      if (!m) continue;
      // бессмысленно: двигать короля с самого низа на пустую колонку
      if (from.k === 'tab' && from.idx === 0 && b.tab[col].length === 0) continue;
      const reveals = from.k === 'tab' && from.idx > 0 && !b.tab[from.col][from.idx - 1].up;
      out.push({ from, to, p: reveals ? 2 : from.k === 'waste' ? 1.5 : 0.5 });
    }
  }
  out.sort((a, c) => c.p - a.p);
  return out;
}
export const hasDraw = (b) => b.stock.length > 0 || b.waste.length > 1;
export const stuck = (b) => !b.won && hints(b).length === 0 && !hasDraw(b);
export const canFinish = (b) => b.stock.length === 0 && b.waste.length === 0 && b.tab.every((p) => p.every((c) => c.up));

export function act(st, pid, a) {
  const pl = st.players.find((p) => p.id === pid);
  if (!pl) return 'no-player';
  if (st.winner) return 'over';
  const b = pl.board;
  if (b.won) return 'over';
  switch (a.t) {
    case 'draw': {
      pushHistory(b);
      if (b.stock.length) {
        for (let k = 0; k < b.draw && b.stock.length; k++) b.waste.push({ ...b.stock.pop(), up: true });
      } else if (b.waste.length) {
        b.stock = b.waste.reverse().map((c) => ({ ...c, up: false }));
        b.waste = []; b.recycles++;
        b.score = Math.max(0, b.score - (b.draw === 1 ? 100 : 20));
      } else { b.history.pop(); return 'empty'; }
      b.moves++;
      return null;
    }
    case 'move': {
      const m = tryMove(b, a.from, a.to);
      if (!m) return 'illegal';
      applyMove(b, a.from, a.to, m.seq, m.gain);
      if (b.won) st.winner = pid;
      return null;
    }
    case 'auto': { // один шаг автосбора на фундамент
      const cands = [];
      if (b.waste.length) cands.push({ k: 'waste' });
      b.tab.forEach((p, col) => { if (p.length) cands.push({ k: 'tab', col, idx: p.length - 1 }); });
      for (const from of cands) for (let s = 0; s < 4; s++) {
        const m = tryMove(b, from, { k: 'found', s });
        if (m) { applyMove(b, from, { k: 'found', s }, m.seq, m.gain); if (b.won) st.winner = pid; return null; }
      }
      return 'none';
    }
    case 'undo': {
      const h = b.history.pop();
      if (!h) return 'empty';
      const s = JSON.parse(h);
      Object.assign(b, s);
      return null;
    }
    case 'restart': {
      if (st.players.length > 1) return 'cannot';
      pl.board = newBoard(st.seed, st.draw); return null;
    }
    case 'newgame': {
      if (st.players.length > 1) return 'cannot';
      st.seed = Math.floor(Math.random() * 2 ** 31);
      if (a.draw === 1 || a.draw === 3) st.draw = a.draw;
      pl.board = newBoard(st.seed, st.draw); st.winner = null; return null;
    }
    default: return 'unknown';
  }
}

export function pending(st) { return st.winner ? [] : st.players.filter((p) => !p.bot).map((p) => p.id); }
export function auto() { return null; }
export function timeoutAction() { return null; }
export function bot() { return null; }

export function view(st, pid) {
  const me = st.players.find((p) => p.id === pid);
  const v = { game: 'solitaire', me: pid, seed: st.seed, draw: st.draw, winner: st.winner, board: null, others: [] };
  if (me) { v.board = JSON.parse(JSON.stringify({ ...me.board, history: undefined })); v.board.canUndo = me.board.history.length > 0; }
  v.others = st.players.filter((p) => p.id !== pid).map((p) => ({
    id: p.id, name: p.name, found: p.board.found.reduce((a, f) => a + f.length, 0), moves: p.board.moves, score: p.board.score, won: p.board.won,
  }));
  v.players = st.players.map((p) => ({ id: p.id, name: p.name }));
  return v;
}

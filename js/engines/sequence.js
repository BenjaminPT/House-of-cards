// Sequence: 2–4 игрока, 2 колоды, поле 10×10, команды.
import { newDeck, shuffle } from './common.js';

export const meta = {
  id: 'sequence', name: 'Сиквенс', min: 2, max: 4,
  desc: 'Собери линию из пяти фишек. Валеты — особые карты.',
};

const LAYOUT = ["F 2S 3S 4S 5S 6S 7S 8S 9S F","9C 5H 9S 2H 8D 8H 10D 6C 7H 10S","8C 7H KC 3H QD 6H 4C 9D QH QS","7C 4D QH KS 7D 6D 7C 9H 5H KS","6C 9H 10C 2D 10S KD 9C KH 3C AS","5C AH QC QS 3D 6S 8C 10H AC 2D","4C 10H 2S 5D 5S 4S 2C AH 10C 3D","3C KH AC AS 8H 3S 5C 4H QC 4D","2C 4H KC 8S 3H 7S 6H AD 2H 5D","F AD KD QD 10D 9D 8D 7D 6D F"];
export const BOARD = LAYOUT.map((row) => row.split(' ').map((x) => (x === 'F' ? 'F' : { r: x.slice(0, -1), s: x.slice(-1) })));

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
export const isJack = (c) => c.r === 'J';
export const twoEyed = (c) => c.r === 'J' && (c.s === 'C' || c.s === 'D');
export const oneEyed = (c) => c.r === 'J' && (c.s === 'S' || c.s === 'H');
const inb = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 10;

export function teamOf(n, seat) { return n === 4 ? seat % 2 : seat; }

export function init(players, opts = {}, rnd = Math.random) {
  const n = players.length;
  const teams = n === 4 ? 2 : n;
  const st = {
    game: 'sequence', n, teams, need: teams === 2 ? 2 : 1, seq: 0, turn: 0, phase: 'play',
    deck: [], discard: [], deadUsed: false, deadOwed: false, handSize: 0, last: null, winner: null, seqs: [],
    board: BOARD.map((row) => row.map((c) => (c === 'F' ? { corner: true, chip: -1 } : { chip: -1, locked: false }))),
    players: players.map((p, i) => ({ id: p.id, name: p.name, bot: !!p.bot, team: teamOf(n, i), hand: [], owes: 0 })),
  };
  st.deck = shuffle(newDeck(2), rnd).map((c) => ({ ...c, i: st.seq++ }));
  const hs = n === 2 ? 7 : 6;
  st.handSize = hs;
  for (let k = 0; k < hs; k++) for (const p of st.players) p.hand.push(st.deck.pop());
  return st;
}

export function targets(board, team, card) {
  const out = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    const cell = board[r][c];
    if (cell.corner) continue;
    if (twoEyed(card)) { if (cell.chip === -1) out.push([r, c]); }
    else if (oneEyed(card)) { if (cell.chip !== -1 && cell.chip !== team && !cell.locked) out.push([r, c]); }
    else {
      const b = BOARD[r][c];
      if (cell.chip === -1 && b.r === card.r && b.s === card.s) out.push([r, c]);
    }
  }
  return out;
}

export function isDead(board, card) {
  if (isJack(card)) return false;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    const b = BOARD[r][c];
    if (b !== 'F' && b.r === card.r && b.s === card.s && board[r][c].chip === -1) return false;
  }
  return true;
}

function drawCard(st, rnd) {
  if (!st.deck.length) { st.deck = shuffle(st.discard.splice(0), rnd); }
  return st.deck.pop() || null;
}

function windowsAt(board, team, r, c) {
  const res = [];
  for (const [dr, dc] of DIRS) for (let k = -4; k <= 0; k++) {
    const cells = [];
    let ok = true;
    for (let j = 0; j < 5; j++) {
      const rr = r + dr * (k + j), cc = c + dc * (k + j);
      if (!inb(rr, cc)) { ok = false; break; }
      const cell = board[rr][cc];
      if (!(cell.corner || cell.chip === team)) { ok = false; break; }
      cells.push([rr, cc]);
    }
    if (ok) res.push(cells);
  }
  return res;
}

function detect(st, team, r, c) {
  const mine = st.seqs.filter((s) => s.team === team);
  let added = 0;
  for (const w of windowsAt(st.board, team, r, c)) {
    const overlap = (s) => w.filter(([a, b]) => s.cells.some(([x, y]) => x === a && y === b)).length;
    if (mine.every((s) => overlap(s) <= 1)) {
      const s = { team, cells: w };
      mine.push(s); st.seqs.push(s); added++;
      for (const [a, b] of w) if (!st.board[a][b].corner) st.board[a][b].locked = true;
    }
  }
  return added;
}

function endTurn(st) {
  st.turn = (st.turn + 1) % st.players.length;
  st.deadUsed = false;
  st.deadOwed = false;
}

// Реальные правила: карту из колоды берут САМИ и до хода следующего игрока.
// Не успел — право пропало, дальше играешь с меньшим числом карт. Боты берут сразу.
function takeCard(st, p, rnd) {
  const nc = drawCard(st, rnd);
  if (nc) p.hand.push(nc);
}
function owe(st, p, rnd) {
  if (p.bot) takeCard(st, p, rnd); else p.owes++;
}
function expireOthers(st, keep) {
  for (const q of st.players) if (q !== keep) q.owes = 0;
}

export function legalMoves(st, pid) {
  const p = st.players.find((x) => x.id === pid);
  const out = [];
  for (const card of p.hand) for (const [r, c] of targets(st.board, p.team, card)) out.push({ t: 'play', card: card.i, r, c });
  return out;
}

export function act(st, pid, a, rnd = Math.random) {
  if (st.phase !== 'play') return 'over';
  if (a.t === 'draw') { // взять карту из колоды — можно в любой момент, пока право не истекло
    const q = st.players.find((x) => x.id === pid);
    if (!q) return 'no-player';
    if (q.owes <= 0) return 'nothing-to-draw';
    q.owes--;
    takeCard(st, q, rnd);
    if (st.players[st.turn] === q && q.owes === 0) st.deadOwed = false;
    return null;
  }
  const p = st.players[st.turn];
  if (p.id !== pid) return 'not-your-turn';
  if (a.t === 'pass') {
    if (legalMoves(st, pid).length || p.hand.some((c) => isDead(st.board, c) && !st.deadUsed)) return 'has-moves';
    expireOthers(st, p);
    endTurn(st); return null;
  }
  const idx = p.hand.findIndex((c) => c.i === a.card);
  if (idx < 0) return 'no-card';
  const card = p.hand[idx];
  if (a.t === 'dead') {
    if (st.deadUsed || !isDead(st.board, card)) return 'not-dead';
    p.hand.splice(idx, 1); st.discard.push(card);
    owe(st, p, rnd);
    if (!p.bot) st.deadOwed = true; // замену нужно взять до хода
    st.deadUsed = true;
    return null;
  }
  if (a.t !== 'play') return 'unknown';
  if (st.deadOwed) return 'draw-first';
  if (!targets(st.board, p.team, card).some(([r, c]) => r === a.r && c === a.c)) return 'bad-target';
  const cell = st.board[a.r][a.c];
  let kind = 'place';
  if (oneEyed(card)) { cell.chip = -1; kind = 'remove'; }
  else cell.chip = p.team;
  p.hand.splice(idx, 1); st.discard.push(card);
  st.last = { r: a.r, c: a.c, team: p.team, kind, by: pid, card: { r: card.r, s: card.s } };
  if (kind === 'place') {
    detect(st, p.team, a.r, a.c);
    const count = st.seqs.filter((s) => s.team === p.team).length;
    if (count >= st.need) { st.phase = 'over'; st.winner = p.team; }
  }
  expireOthers(st, p);
  owe(st, p, rnd);
  if (st.phase === 'play') endTurn(st);
  return null;
}

export function pending(st) { return st.phase === 'play' ? [st.players[st.turn].id] : []; }
export function auto() { return null; }
export function timeoutAction(st, pid) {
  const me = st.players.find((x) => x.id === pid);
  if (st.deadOwed && me && me.owes > 0) return { t: 'draw' };
  const mv = legalMoves(st, pid);
  if (mv.length) return mv[Math.floor(Math.random() * mv.length)];
  const p = st.players.find((x) => x.id === pid);
  const dead = p.hand.find((c) => isDead(st.board, c));
  if (dead && !st.deadUsed) return { t: 'dead', card: dead.i };
  return { t: 'pass' };
}

export function view(st, pid) {
  const v = JSON.parse(JSON.stringify({ ...st, deck: undefined, discard: undefined }));
  v.players.forEach((p) => { if (p.id !== pid) p.hand = p.hand.map((c) => ({ i: c.i, h: 1 })); });
  v.deckLeft = st.deck.length;
  v.me = pid;
  return v;
}

// ---- бот ----
const WV = [0, 1, 3, 10, 70, 2000];
function cellScore(board, team, r, c, teams) {
  let own = 0, block = 0;
  for (const [dr, dc] of DIRS) for (let k = -4; k <= 0; k++) {
    let mine = 0, opp = 0, oppTeam = -1, ok = true, mixed = false;
    for (let j = 0; j < 5; j++) {
      const rr = r + dr * (k + j), cc = c + dc * (k + j);
      if (!inb(rr, cc)) { ok = false; break; }
      if (rr === r && cc === c) continue;
      const cell = board[rr][cc];
      if (cell.corner || cell.chip === team) mine++;
      else if (cell.chip !== -1) { if (oppTeam !== -1 && oppTeam !== cell.chip) mixed = true; oppTeam = cell.chip; opp++; }
    }
    if (!ok) continue;
    if (opp === 0) own += WV[Math.min(5, mine + 1)];
    if (mine === 0 && !mixed && opp > 0) block += WV[Math.min(5, opp + 1)] * 0.9;
  }
  const centre = 4.5 - Math.max(Math.abs(r - 4.5), Math.abs(c - 4.5));
  return own + block + centre * 0.2;
}

export function bot(st, pid, rnd = Math.random) {
  if (st.phase !== 'play' || st.players[st.turn].id !== pid) return null;
  const p = st.players[st.turn];
  let best = null, bestScore = -Infinity;
  const mine = [];
  for (const card of p.hand) {
    const ts = targets(st.board, p.team, card);
    for (const [r, c] of ts) {
      let s;
      if (oneEyed(card)) {
        // оценка: насколько цель ценна для соперника
        const owner = st.board[r][c].chip;
        s = cellScore(st.board, owner, r, c, st.teams) * 0.55 - 6;
      } else {
        s = cellScore(st.board, p.team, r, c, st.teams);
        if (twoEyed(card)) s = s * 0.9 - 12;
      }
      s += rnd() * 0.5;
      mine.push({ a: { t: 'play', card: card.i, r, c }, s });
      if (s > bestScore) { bestScore = s; best = { t: 'play', card: card.i, r, c }; }
    }
  }
  const dead = p.hand.find((c) => isDead(st.board, c));
  if (dead && !st.deadUsed) return { t: 'dead', card: dead.i };
  if (best) return best;
  return { t: 'pass' };
}

import assert from 'node:assert/strict';
import * as sq from '../js/engines/sequence.js';
import { mulberry32 } from '../js/engines/common.js';

// структура поля: каждая не-валетная карта ровно дважды, 4 угла
const cnt = {};
let corners = 0;
for (const row of sq.BOARD) for (const c of row) { if (c === 'F') corners++; else cnt[c.r + c.s] = (cnt[c.r + c.s] || 0) + 1; }
assert.equal(corners, 4);
assert.equal(Object.keys(cnt).length, 48);
assert.ok(Object.values(cnt).every((v) => v === 2));

function sim(seed, n) {
  const rnd = mulberry32(seed);
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, bot: true }));
  const st = sq.init(players, {}, rnd);
  let guard = 0;
  while (st.phase === 'play' && guard++ < 3000) {
    const pid = sq.pending(st)[0];
    const a = sq.bot(st, pid, rnd);
    const e = sq.act(st, pid, a, rnd);
    assert.equal(e, null, JSON.stringify(a) + ' ' + e);
    // руки всегда полные
    const hs = n === 2 ? 7 : 6;
    for (const p of st.players) assert.equal(p.hand.length, hs); // боты берут карту сразу
  }
  return st;
}
let wins = 0;
for (let s = 1; s <= 40; s++) { const st = sim(s, 2 + (s % 3)); if (st.phase === 'over') { wins++; assert.ok(st.seqs.filter((q) => q.team === st.winner).length >= st.need); } }
console.log('sequence OK, finished', wins, '/ 40');

// детект последовательности вручную
const st = sq.init([{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }], {}, mulberry32(5));
for (let c = 1; c <= 4; c++) st.board[0][c].chip = 0; // 4 фишки + угол => 5 в ряд
const cell = st.board[0][5]; cell.chip = 0;
const before = st.seqs.length;
// подставим карту в руку: 7♠ на (0,6)? используем двуглазого валета
st.players[0].hand[0] = { r: 'J', s: 'D', i: 999 };
assert.equal(sq.act(st, 'a', { t: 'play', card: 999, r: 0, c: 6 }), null);
assert.ok(st.seqs.length > before, 'sequence detected');
console.log('sequence detect OK');

// ---- ручной добор: реальные правила ----
{
  const rnd2 = mulberry32(11);
  const st2 = sq.init([{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }], {}, rnd2);
  const A = st2.players[0], B = st2.players[1];
  const mv = sq.legalMoves(st2, 'a')[0];
  assert.equal(sq.act(st2, 'a', mv, rnd2), null);
  assert.equal(A.hand.length, 6, 'после хода карты не прибавляется сама');
  assert.equal(A.owes, 1);
  assert.equal(sq.act(st2, 'a', { t: 'draw' }, rnd2), null);
  assert.equal(A.hand.length, 7); assert.equal(A.owes, 0);
  assert.equal(sq.act(st2, 'a', { t: 'draw' }, rnd2), 'nothing-to-draw', 'второй раз брать нельзя');
  // B ходит и тоже не берёт; A успел взять -> 7; потом A играет и забывает
  const mvB = sq.legalMoves(st2, 'b')[0];
  assert.equal(sq.act(st2, 'b', mvB, rnd2), null);
  assert.equal(B.owes, 1);
  const mvA = sq.legalMoves(st2, 'a')[0];
  assert.equal(sq.act(st2, 'a', mvA, rnd2), null); // A ходит, пока B ещё не взял -> право B сгорает
  assert.equal(B.owes, 0, 'право добора сгорело после хода следующего');
  assert.equal(B.hand.length, 6);
  assert.equal(sq.act(st2, 'b', { t: 'draw' }, rnd2), 'nothing-to-draw');
  // A забыл взять: после хода B право A тоже сгорает
  const mvB2 = sq.legalMoves(st2, 'b')[0];
  assert.equal(sq.act(st2, 'b', mvB2, rnd2), null);
  assert.equal(A.owes, 0); assert.equal(A.hand.length, 6);
  console.log('sequence manual draw OK');
}

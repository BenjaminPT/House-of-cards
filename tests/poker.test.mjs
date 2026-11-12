import assert from 'node:assert/strict';
import * as pk from '../js/engines/poker.js';
import { mulberry32 } from '../js/engines/common.js';

const C = (s) => s.split(' ').map((x) => ({ r: x.slice(0, -1), s: x.slice(-1) }));
const rank = (s) => pk.bestOf(C(s));
// категории
assert.equal(rank('A S K S Q S J S 10 S 2 D 3 C'.replace(/ (?=[SDHC])/g, '')) [0], 8);
assert.equal(rank('9H 9D 9S 9C 2D 3C 4H')[0], 7);
assert.equal(rank('KH KD KS 2C 2D 3C 4H')[0], 6);
assert.equal(rank('2H 6H 9H JH KH 3C 4D')[0], 5);
assert.equal(rank('AH 2D 3S 4C 5D 9C KH')[0], 4);   // колесо
assert.equal(rank('7H 7D 7S 2C 9D 3C KH')[0], 3);
assert.equal(rank('7H 7D 2S 2C 9D 3C KH')[0], 2);
assert.equal(rank('7H 7D 2S 5C 9D 3C KH')[0], 1);
assert.equal(rank('7H 8D 2S 5C 9D 3C KH')[0], 0);
assert.ok(pk.cmp(rank('AH AD 2S 5C 9D 3C KH'), rank('KH KD 2S 5C 9D 3C AH')) > 0);
assert.ok(pk.cmp(rank('2H 3H 4H 5H 6H 9C KD'), rank('AH 2D 3S 4C 5D 9C KH')) > 0); // стрит-флеш > колесо

function sim(seed, n, maxHands) {
  const rnd = mulberry32(seed);
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, bot: true }));
  const st = pk.init(players, {}, rnd);
  const startTotal = st.players.reduce((a, p) => a + p.chips + p.total, 0);
  let guard = 0;
  while (st.phase !== 'game_over' && st.hands <= maxHands && guard++ < 100000) {
    const sys = pk.auto(st);
    const pend = pk.pending(st);
    if (pend.length) {
      const a = pk.bot(st, pend[0], rnd);
      const e = pk.act(st, pend[0], a, rnd);
      assert.equal(e, null, `${JSON.stringify(a)} ${e} phase=${st.phase}`);
    } else if (sys) {
      assert.equal(pk.act(st, 'sys', sys.action, rnd), null);
    } else break;
    const tot = st.players.reduce((a, p) => a + p.chips + p.total * (st.phase === 'hand_over' ? 0 : 1), 0);
    if (st.phase !== 'hand_over') assert.equal(tot, startTotal, 'chips conservation, phase ' + st.phase);
    else assert.equal(st.players.reduce((a, p) => a + p.chips, 0), startTotal, 'chips conservation at showdown');
    for (const p of st.players) assert.ok(p.chips >= 0);
  }
  assert.ok(guard < 100000, 'loop');
  return st;
}
let finished = 0;
for (let s = 1; s <= 12; s++) { const st = sim(s, 2 + (s % 5), 80); if (st.phase === 'game_over') finished++; }
console.log('poker OK, finished games:', finished);

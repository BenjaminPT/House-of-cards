import assert from 'node:assert/strict';
import * as bj from '../js/engines/blackjack.js';
import { mulberry32 } from '../js/engines/common.js';

function run(seed, nPlayers, rounds) {
  const rnd = mulberry32(seed);
  const players = Array.from({ length: nPlayers }, (_, i) => ({ id: 'p' + i, name: 'P' + i, bot: true }));
  const st = bj.init(players, {}, rnd);
  let guard = 0, roundsDone = 0, lastRound = 0;
  while (roundsDone < rounds && guard++ < 200000) {
    const sys = bj.auto(st);
    if (sys) { assert.equal(bj.act(st, 'sys', sys.action, rnd), null); continue; }
    let moved = false;
    for (const pid of bj.pending(st)) {
      const a = bj.bot(st, pid, rnd);
      if (a) { const e = bj.act(st, pid, a, rnd); assert.equal(e, null, `${JSON.stringify(a)} -> ${e} (phase ${st.phase})`); moved = true; break; }
    }
    if (st.phase === 'done') {
      // chips conservation: после settle никто не уходит в минус
      for (const p of st.players) assert.ok(p.chips >= 0, 'negative chips');
    }
    if (st.round !== lastRound && st.phase === 'bet') { lastRound = st.round; roundsDone++; }
    if (!moved && !sys) assert.fail('stuck in phase ' + st.phase);
  }
  assert.ok(roundsDone >= rounds, 'did not finish rounds: ' + roundsDone);
  return st;
}
for (let s = 1; s <= 30; s++) run(s, 1 + (s % 5), 40);

// фиксированные сценарии
assert.equal(bj.total([{ r: 'A' }, { r: 'K' }]).t, 21);
assert.equal(bj.total([{ r: 'A' }, { r: 'A' }, { r: '9' }]).t, 21);
assert.equal(bj.total([{ r: 'K' }, { r: 'Q' }, { r: '5' }]).t, 25);
const st = bj.init([{ id: 'a', name: 'A' }], {}, mulberry32(1));
assert.equal(bj.act(st, 'a', { t: 'ready' }), null);
assert.equal(st.phase, 'deal');
const v = bj.view(st, 'a');
assert.ok(!('shoe' in v));
console.log('blackjack OK');

import assert from 'node:assert/strict';
import * as ro from '../js/engines/roulette.js';
import * as so from '../js/engines/solitaire.js';
import { mulberry32 } from '../js/engines/common.js';

// ---- рулетка ----
assert.equal(ro.WHEEL_ORDER.length, 37);
assert.equal(new Set(ro.WHEEL_ORDER).size, 37);
assert.equal(ro.colorOf(0), 'green'); assert.equal(ro.colorOf(1), 'red'); assert.equal(ro.colorOf(2), 'black');
assert.equal(ro.spotInfo([17, 20]).type, 'split'); assert.equal(ro.spotInfo([1, 2, 4, 5]).type, 'corner');
assert.equal(ro.spotInfo([0, 1, 2, 3]).type, 'basket'); assert.equal(ro.spotInfo([1, 2, 3, 4, 5, 6]).payout, 5);
assert.equal(ro.spotInfo([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).type, 'dozen');
assert.equal(ro.spotInfo([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]).type, 'column');
assert.equal(ro.spotInfo([1, 6]), null);

(function () {
  const rnd = mulberry32(7);
  const players = [{ id: 'h', name: 'H' }, { id: 'b1', name: 'B1', bot: true }, { id: 'b2', name: 'B2', bot: true }];
  const st = ro.init(players, {}, rnd);
  assert.equal(ro.act(st, 'h', { t: 'bet', nums: [17], amount: 100 }), null);
  assert.equal(st.players[0].chips, 900);
  assert.equal(ro.act(st, 'h', { t: 'undo' }), null);
  assert.equal(st.players[0].chips, 1000);
  assert.equal(ro.act(st, 'h', { t: 'bet', nums: [17], amount: 100 }), null);
  assert.equal(ro.act(st, 'h', { t: 'bet', nums: [1, 6], amount: 1 }), 'bad-bet');
  for (let round = 0; round < 60; round++) {
    for (const b of ['b1', 'b2']) { let g = 0; for (;;) { const a = ro.bot(st, b, rnd); if (!a) break; assert.equal(ro.act(st, b, a, rnd), null); if (a.t === 'ready') break; if (g++ > 10) assert.fail('bot loop'); } }
    assert.equal(ro.act(st, 'h', { t: 'ready' }, rnd), null);
    assert.equal(st.phase, 'spin');
    const n = st.result.n;
    const before = st.players.map((p) => p.chips);
    assert.equal(ro.act(st, 'sys', { t: 'settle' }), null);
    // ставка на n должна выплатиться 35:1
    const h = st.players[0];
    const won = h.bets.filter((x) => x.nums.includes(n)).reduce((a, x) => a + x.amount * (x.payout + 1), 0);
    assert.equal(h.chips, before[0] + won);
    assert.equal(ro.act(st, 'sys', { t: 'newRound' }), null);
    assert.equal(ro.act(st, 'h', { t: 'bet', nums: [17], amount: Math.max(1, Math.min(5, st.players[0].chips)) }) === null || st.players[0].chips <= 0, true);
    if (st.players[0].chips <= 0) ro.act(st, 'h', { t: 'rebuy' });
  }
  // распределение результатов
  const cnt = new Array(37).fill(0);
  for (let i = 0; i < 37000; i++) cnt[Math.floor(rnd() * 37)]++;
  assert.ok(cnt.every((c) => c > 800 && c < 1200));
  console.log('roulette OK');
})();

// ---- пасьянс ----
(function () {
  const st = so.init([{ id: 'a', name: 'A' }], { seed: 42, draw: 1 });
  const b = st.players[0].board;
  assert.equal(b.tab.map((p) => p.length).join(), '1,2,3,4,5,6,7');
  assert.equal(b.stock.length, 24);
  assert.ok(b.tab.every((p) => p.slice(0, -1).every((c) => !c.up) && p[p.length - 1].up));
  const ids = new Set([...b.stock, ...b.tab.flat()].map((c) => c.i));
  assert.equal(ids.size, 52);
  // одна и та же раздача по seed
  const st2 = so.init([{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }], { seed: 42, draw: 1 });
  assert.equal(JSON.stringify(st2.players[0].board.tab), JSON.stringify(st2.players[1].board.tab));
  assert.equal(JSON.stringify(st2.players[0].board.tab), JSON.stringify(b.tab));

  // случайная игра по подсказкам: нет нарушений, undo работает
  let wins = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = so.init([{ id: 'a', name: 'A' }], { seed, draw: seed % 2 ? 1 : 3 });
    const bd = s.players[0].board;
    let steps = 0, idle = 0;
    while (!bd.won && steps++ < 4000 && idle < 80) {
      const hs = so.hints(bd);
      let e;
      if (hs.length) { const h = hs[0]; e = so.act(s, 'a', { t: 'move', from: h.from, to: h.to }); idle = 0; assert.equal(e, null); }
      else { e = so.act(s, 'a', { t: 'draw' }); idle++; }
      const cards = bd.stock.length + bd.waste.length + bd.found.reduce((a, f) => a + f.length, 0) + bd.tab.reduce((a, t) => a + t.length, 0);
      assert.equal(cards, 52, 'card conservation');
    }
    if (bd.won) wins++;
  }
  // undo
  const s = so.init([{ id: 'a', name: 'A' }], { seed: 3, draw: 1 });
  const before = JSON.stringify(s.players[0].board.stock);
  so.act(s, 'a', { t: 'draw' });
  assert.notEqual(JSON.stringify(s.players[0].board.stock), before);
  so.act(s, 'a', { t: 'undo' });
  assert.equal(JSON.stringify(s.players[0].board.stock), before);
  // дуэль: победитель определяется
  console.log('solitaire OK, greedy wins:', wins, '/ 60');
})();

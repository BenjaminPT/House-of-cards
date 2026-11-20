import assert from 'node:assert/strict';
import * as sh from '../js/engines/shell.js';
import { mulberry32 } from '../js/engines/common.js';

const P = [{ id: 'me', name: 'Я' }];
const fresh = (seed, mode = 'classic') => { const rnd = mulberry32(seed); return { rnd, st: sh.init(P, { mode }, rnd) }; };

// ---- структура раундов ----
{
  const { st } = fresh(1);
  assert.equal(st.round, 1); assert.equal(st.maxHp, 2); assert.deepEqual(st.hp, { p: 2, d: 2 });
  assert.deepEqual(st.items, { p: [], d: [] }, 'в 1-м раунде предметов нет');
  assert.ok(st.shells.length >= 2 && st.shells.length <= 8);
  assert.equal(st.announced.live + st.announced.blank, st.shells.length);
  assert.ok(st.announced.live >= 1 && st.announced.blank >= 1);
  assert.equal(st.shells.filter((s) => s === 'live').length, st.announced.live);
}

// ---- выстрелы: холостой в себя даёт ещё ход, остальное передаёт ход ----
function forceShells(st, arr) { st.shells = arr.slice(); st.kn = { p: arr.map(() => null), d: arr.map(() => null) }; st.remaining = { live: arr.filter((x) => x === 'live').length, blank: arr.filter((x) => x === 'blank').length }; st.announced = { ...st.remaining }; st.spent = []; }
{
  const { st, rnd } = fresh(2); forceShells(st, ['blank', 'live', 'blank']);
  assert.equal(sh.act(st, 'me', { t: 'shoot', target: 'p' }, rnd), null);
  assert.equal(st.turn, 'p', 'холостой в себя — ход остаётся'); assert.equal(st.hp.p, 2);
  assert.equal(sh.act(st, 'me', { t: 'shoot', target: 'p' }, rnd), null);
  assert.equal(st.hp.p, 1, 'боевой в себя отнимает заряд'); assert.equal(st.turn, 'd', 'после боевого ход переходит');
  assert.equal(sh.act(st, 'me', { t: 'shoot', target: 'd' }, rnd), 'not-your-turn');
}
{
  const { st, rnd } = fresh(3); forceShells(st, ['blank', 'live']);
  sh.act(st, 'me', { t: 'shoot', target: 'd' }, rnd);
  assert.equal(st.turn, 'd', 'холостой в крупье — ход переходит');
}

// ---- ножовка, наручники, пиво, лупа, сигареты ----
{
  const { st, rnd } = fresh(4); st.round = 2; st.maxHp = 4; st.hp = { p: 4, d: 4 };
  forceShells(st, ['live', 'blank', 'live']); st.items.p = ['saw', 'cuffs', 'magnifier', 'beer', 'cigarettes'];
  assert.equal(sh.act(st, 'me', { t: 'item', idx: 0 }, rnd), null); assert.equal(st.sawed, true);
  assert.equal(sh.act(st, 'me', { t: 'item', idx: 0 }, rnd), null); assert.equal(st.cuffed.d, true);
  assert.equal(sh.act(st, 'me', { t: 'item', idx: 0 }, rnd), null); assert.equal(st.kn.p[0], 'live');
  sh.act(st, 'me', { t: 'shoot', target: 'd' }, rnd);
  assert.equal(st.hp.d, 2, 'ножовка: урон 2'); assert.equal(st.sawed, false, 'ножовка сбрасывается после выстрела');
  assert.equal(st.turn, 'p', 'наручники: крупье пропустил ход'); assert.equal(st.cuffed.d, false);
  const n = st.shells.length; assert.equal(sh.act(st, 'me', { t: 'item', idx: 0 }, rnd), null); // пиво
  assert.equal(st.shells.length, n - 1); assert.equal(st.spent.at(-1), 'blank');
  st.hp.p = 3; assert.equal(sh.act(st, 'me', { t: 'item', idx: 0 }, rnd), null); assert.equal(st.hp.p, 4);
}
{ // повторные ножовка и наручники запрещены
  const { st, rnd } = fresh(5); st.round = 2; st.items.p = ['saw', 'saw', 'cuffs', 'cuffs'];
  assert.equal(sh.act(st, 'me', { t: 'item', idx: 0 }, rnd), null);
  assert.equal(sh.act(st, 'me', { t: 'item', idx: 0 }, rnd), 'unusable');
  assert.equal(sh.act(st, 'me', { t: 'item', idx: 1 }, rnd), null);
  assert.equal(sh.act(st, 'me', { t: 'item', idx: 1 }, rnd), 'unusable');
}

// ---- расширенные предметы ----
{
  const { st, rnd } = fresh(6, 'extended'); st.round = 2; forceShells(st, ['live', 'blank', 'blank']);
  st.items.p = ['inverter', 'phone']; st.kn.p[0] = 'live';
  sh.act(st, 'me', { t: 'item', idx: 0 }, rnd);
  assert.equal(st.shells[0], 'blank'); assert.equal(st.kn.p[0], 'blank'); assert.equal(st.uncertain, true);
  sh.act(st, 'me', { t: 'item', idx: 0 }, rnd); // телефон
  const known = st.kn.p.findIndex((x, i) => i > 0 && x); assert.ok(known >= 1, 'телефон показывает один из следующих патронов');
  assert.equal(st.kn.p[known], st.shells[known]);
}
{ // адреналин: нельзя красть адреналин, украденное применяется сразу
  const { st, rnd } = fresh(7, 'extended'); st.round = 2; st.maxHp = 4; st.hp = { p: 2, d: 4 }; forceShells(st, ['live', 'blank']);
  st.items.p = ['adrenaline']; st.items.d = ['adrenaline', 'cigarettes'];
  assert.equal(sh.act(st, 'me', { t: 'item', idx: 0, stealIdx: 0 }, rnd), 'steal');
  assert.equal(sh.act(st, 'me', { t: 'item', idx: 0, stealIdx: 1 }, rnd), null);
  assert.equal(st.hp.p, 3); assert.deepEqual(st.items.d, ['adrenaline']); assert.deepEqual(st.items.p, []);
}

// ---- перезарядка и раздача предметов ----
{
  const { st, rnd } = fresh(8); st.round = 2; st.maxHp = 4; st.hp = { p: 4, d: 4 }; st.items = { p: [], d: [] };
  forceShells(st, ['blank']);
  sh.act(st, 'me', { t: 'shoot', target: 'p' }, rnd);
  assert.ok(st.shells.length >= 2, 'после последнего патрона ствол перезаряжается');
  assert.ok(st.items.p.length >= 1 && st.items.d.length >= 1, 'со 2-го раунда на каждую зарядку выдаются предметы');
  assert.equal(st.events.at(-1).k, 'load');
}

// ---- конец раунда и игры ----
{
  const { st, rnd } = fresh(9); forceShells(st, ['live', 'live']); st.hp.d = 1;
  sh.act(st, 'me', { t: 'shoot', target: 'd' }, rnd);
  assert.equal(st.phase, 'roundEnd'); assert.equal(st.hp.d, 0);
  assert.equal(sh.act(st, 'me', { t: 'shoot', target: 'd' }, rnd), 'locked');
  assert.equal(sh.act(st, 'me', { t: 'next' }, rnd), null);
  assert.equal(st.round, 2); assert.equal(st.maxHp, 4); assert.deepEqual(st.hp, { p: 4, d: 4 });
}
{
  const { st, rnd } = fresh(10); forceShells(st, ['live', 'blank']); st.hp.p = 1;
  sh.act(st, 'me', { t: 'shoot', target: 'p' }, rnd);
  assert.equal(st.phase, 'over'); assert.equal(st.over, 'lose');
}
{ // таймаут и pending
  const { st } = fresh(11);
  assert.deepEqual(sh.pending(st), ['me']); assert.equal(sh.auto(st), null);
  st.turn = 'd'; assert.deepEqual(sh.pending(st), []); assert.equal(sh.auto(st).action.t, 'dealer');
  assert.equal(sh.act(st, 'sys', { t: 'nope' }), 'bad-sys');
}

// ---- view не раскрывает порядок патронов и знания крупье ----
{
  const { st, rnd } = fresh(12, 'extended'); st.round = 2; forceShells(st, ['live', 'blank', 'live']);
  st.turn = 'd'; st.items.d = ['magnifier']; st.kn.d[0] = 'live';
  const before = JSON.stringify(sh.view(st, 'me'));
  assert.ok(!('shells' in sh.view(st, 'me')) && !('kn' in sh.view(st, 'me')) && !('remaining' in sh.view(st, 'me')));
  sh.act(st, 'sys', { t: 'dealer' }, rnd);
  const ev = sh.view(st, 'me').events.filter((e) => e.k === 'item' && e.who === 'd');
  for (const e of ev) assert.ok(!('shell' in e) && !('pos' in e), 'результат лупы/телефона крупье скрыт');
  assert.notEqual(before, JSON.stringify(sh.view(st, 'me')));
  assert.equal(sh.view(st, 'me').known.length, st.shells.length);
}

// ---- массовая симуляция: ИИ против ИИ (человек играет тем же ИИ) ----
function simulate(seed, mode) {
  const { st, rnd } = fresh(seed, mode);
  let guard = 0;
  while (st.phase !== 'over' && guard++ < 6000) {
    if (st.phase === 'roundEnd') { assert.equal(sh.act(st, 'me', { t: 'next' }, rnd), null); continue; }
    const who = st.turn;
    const a = sh.plan(st, who, rnd);
    const err = who === 'p' ? sh.act(st, 'me', a, rnd) : sh.act(st, 'sys', { t: 'dealer' }, rnd);
    assert.equal(err, null, JSON.stringify(a) + ' ' + err);
    assert.ok(st.hp.p >= 0 && st.hp.d >= 0 && st.hp.p <= st.maxHp && st.hp.d <= st.maxHp, 'заряды в пределах');
    assert.ok(st.items.p.length <= sh.MAX_ITEMS && st.items.d.length <= sh.MAX_ITEMS, 'не больше 8 предметов');
    assert.ok(st.shells.length > 0 || st.phase !== 'play', 'ствол не бывает пустым посреди раунда');
    assert.equal(st.kn.p.length, st.shells.length); assert.equal(st.kn.d.length, st.shells.length);
    assert.equal(st.remaining.live + st.remaining.blank >= 0, true);
    if (st.round === 1) assert.deepEqual(st.items, { p: [], d: [] });
  }
  assert.ok(guard < 6000, 'партия завершается');
  return st;
}
const res = { win: 0, lose: 0 };
for (const mode of ['classic', 'extended']) for (let s = 1; s <= 600; s++) { const st = simulate(s * 7919, mode); res[st.over]++; assert.ok(st.score >= 0); }
assert.equal(res.win + res.lose, 1200);
console.log('shell: ok', res);

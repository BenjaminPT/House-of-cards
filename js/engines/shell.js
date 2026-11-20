// «Последний патрон»: дробовик, боевые и холостые патроны, три раунда против крупье.
// Чистая логика без DOM. Человек — один игрок (стороны 'p'), крупье играет внутри движка через auto().
export const meta = {
  id: 'shell', name: 'Последний патрон', min: 1, max: 1,
  desc: 'Дробовик, боевые и холостые патроны. Три раунда против крупье.',
};

export const ITEMS = {
  magnifier: { name: 'Лупа', desc: 'Показывает патрон в стволе.' },
  beer: { name: 'Пиво', desc: 'Выбрасывает патрон из ствола, не стреляя.' },
  cigarettes: { name: 'Сигареты', desc: 'Восстанавливают 1 заряд.' },
  saw: { name: 'Ножовка', desc: 'Следующий боевой выстрел наносит 2 урона.' },
  cuffs: { name: 'Наручники', desc: 'Противник пропустит свой следующий ход.' },
  phone: { name: 'Телефон', desc: 'Сообщает тип одного из следующих патронов.' },
  inverter: { name: 'Инвертор', desc: 'Меняет патрон в стволе: боевой ↔ холостой.' },
  adrenaline: { name: 'Адреналин', desc: 'Украдите предмет противника и сразу используйте его.' },
  medicine: { name: 'Просрочка', desc: '40%: +2 заряда. Иначе −1 заряд.' },
};
export const BASIC = ['magnifier', 'beer', 'cigarettes', 'saw', 'cuffs'];
export const EXTRA = ['phone', 'inverter', 'adrenaline', 'medicine'];
export const HP_BY_ROUND = [0, 2, 4, 5];
export const MAX_ITEMS = 8;

const other = (w) => (w === 'p' ? 'd' : 'p');
const ri = (rnd, n) => Math.floor(rnd() * n);

function emit(st, ev) {
  st.seq++;
  st.events.push({ n: st.seq, hp: { p: st.hp.p, d: st.hp.d }, left: st.shells.length, ...ev });
  if (st.events.length > 60) st.events.splice(0, st.events.length - 60);
}

export function init(players, opts = {}, rnd = Math.random) {
  const st = {
    game: 'shell', pid: players[0].id, mode: opts.mode === 'extended' ? 'extended' : 'classic',
    round: 0, maxHp: 0, hp: { p: 0, d: 0 }, items: { p: [], d: [] },
    shells: [], kn: { p: [], d: [] }, announced: { live: 0, blank: 0 }, remaining: { live: 0, blank: 0 },
    uncertain: false, spent: [], turn: 'p', sawed: false, cuffed: { p: false, d: false },
    phase: 'play', over: null, score: 0, roundsWon: 0, seq: 0, events: [],
  };
  startRound(st, rnd);
  return st;
}

function reload(st, rnd, isRound) {
  const total = 2 + ri(rnd, 7); // 2..8 патронов
  let live = Math.round(total / 2 + (rnd() - 0.5) * 2);
  live = Math.max(1, Math.min(total - 1, live));
  const blank = total - live;
  const arr = [];
  for (let i = 0; i < live; i++) arr.push('live');
  for (let i = 0; i < blank; i++) arr.push('blank');
  for (let i = arr.length - 1; i > 0; i--) { const j = ri(rnd, i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  st.shells = arr;
  st.kn = { p: arr.map(() => null), d: arr.map(() => null) };
  st.announced = { live, blank };
  st.remaining = { live, blank };
  st.uncertain = false; st.sawed = false; st.spent = [];
  st.cuffed = { p: false, d: false };
  const pool = st.mode === 'extended' ? BASIC.concat(EXTRA) : BASIC;
  const given = { p: [], d: [] };
  if (st.round >= 2) {
    for (const w of ['p', 'd']) {
      const n = 1 + ri(rnd, 4);
      for (let i = 0; i < n && st.items[w].length < MAX_ITEMS; i++) {
        const id = pool[ri(rnd, pool.length)];
        st.items[w].push(id); given[w].push(id);
      }
    }
  }
  emit(st, { k: 'load', live, blank, given, round: isRound ? st.round : 0 });
}

function startRound(st, rnd) {
  st.round += 1;
  st.maxHp = HP_BY_ROUND[st.round];
  st.hp = { p: st.maxHp, d: st.maxHp };
  st.items = { p: [], d: [] };
  st.turn = 'p'; st.phase = 'play';
  emit(st, { k: 'round', round: st.round, maxHp: st.maxHp });
  reload(st, rnd, true);
}

function fired(st, sh) {
  st.shells.shift(); st.kn.p.shift(); st.kn.d.shift();
  st.spent.push(sh);
  st.remaining[sh] = Math.max(0, st.remaining[sh] - 1);
}

export function canUse(st, who, id) {
  switch (id) {
    case 'saw': return !st.sawed;
    case 'cuffs': return !st.cuffed[other(who)];
    case 'phone': return st.shells.length >= 2;
    default: return true;
  }
}
export function stealable(st, who) {
  const op = other(who); const out = [];
  st.items[op].forEach((id, i) => { if (id !== 'adrenaline' && canUse(st, who, id)) out.push(i); });
  return out;
}

function applyItem(st, who, id, rnd) {
  const op = other(who); const r = {};
  switch (id) {
    case 'magnifier': r.shell = st.shells[0]; st.kn[who][0] = st.shells[0]; break;
    case 'beer': { const sh = st.shells[0]; fired(st, sh); r.ejected = sh; break; }
    case 'cigarettes': { const b = st.hp[who]; st.hp[who] = Math.min(st.maxHp, b + 1); r.gained = st.hp[who] - b; break; }
    case 'saw': st.sawed = true; break;
    case 'cuffs': st.cuffed[op] = true; break;
    case 'phone': {
      const idx = 1 + ri(rnd, st.shells.length - 1);
      st.kn[who][idx] = st.shells[idx]; r.pos = idx + 1; r.shell = st.shells[idx]; break;
    }
    case 'inverter': {
      st.shells[0] = st.shells[0] === 'live' ? 'blank' : 'live';
      for (const w of ['p', 'd']) { const k = st.kn[w][0]; if (k) st.kn[w][0] = k === 'live' ? 'blank' : 'live'; }
      st.uncertain = true; break;
    }
    case 'medicine': {
      if (rnd() < 0.4) { const b = st.hp[who]; st.hp[who] = Math.min(st.maxHp, b + 2); r.success = true; r.delta = st.hp[who] - b; }
      else { st.hp[who] = Math.max(0, st.hp[who] - 1); r.success = false; r.delta = -1; }
      break;
    }
    default: break;
  }
  return r;
}

// Проверка смерти и перезарядка. Вызывается после каждого действия.
function settle(st, rnd) {
  if (st.hp.d <= 0) {
    st.score += 50 * st.round; st.roundsWon++;
    if (st.round >= 3) { st.phase = 'over'; st.over = 'win'; st.score += 100; emit(st, { k: 'over', result: 'win', score: st.score }); }
    else { st.phase = 'roundEnd'; emit(st, { k: 'roundEnd', round: st.round, score: st.score }); }
    return;
  }
  if (st.hp.p <= 0) { st.phase = 'over'; st.over = 'lose'; emit(st, { k: 'over', result: 'lose', score: st.score }); return; }
  if (st.shells.length === 0) reload(st, rnd, false);
}

function endTurn(st) {
  const next = other(st.turn);
  if (st.cuffed[next]) { st.cuffed[next] = false; emit(st, { k: 'skip', who: next }); return; }
  st.turn = next;
}

function doAction(st, who, a, rnd) {
  const op = other(who);
  if (a.t === 'shoot') {
    if (a.target !== 'p' && a.target !== 'd') return 'target';
    const sh = st.shells[0]; const sawed = st.sawed; const dmg = sawed ? 2 : 1;
    fired(st, sh); st.sawed = false;
    if (sh === 'live') st.hp[a.target] = Math.max(0, st.hp[a.target] - dmg);
    emit(st, { k: 'shot', who, target: a.target, shell: sh, dmg: sh === 'live' ? dmg : 0, sawed });
    if (st.hp.p > 0 && st.hp.d > 0) {
      if (sh === 'blank' && a.target === who) emit(st, { k: 'extra', who });
      else endTurn(st);
    }
    settle(st, rnd);
    return null;
  }
  if (a.t === 'item') {
    const id = st.items[who][a.idx];
    if (!id) return 'idx';
    if (id === 'adrenaline') {
      const sid = st.items[op][a.stealIdx];
      if (!sid || sid === 'adrenaline' || !canUse(st, who, sid)) return 'steal';
      st.items[who].splice(a.idx, 1); st.items[op].splice(a.stealIdx, 1);
      const info = applyItem(st, who, sid, rnd);
      emit(st, { k: 'item', who, item: 'adrenaline', idx: a.idx, stolen: sid, stealIdx: a.stealIdx, ...info });
    } else {
      if (!canUse(st, who, id)) return 'unusable';
      st.items[who].splice(a.idx, 1);
      const info = applyItem(st, who, id, rnd);
      emit(st, { k: 'item', who, item: id, idx: a.idx, ...info });
    }
    settle(st, rnd);
    return null;
  }
  return 'type';
}

export function act(st, pid, a, rnd = Math.random) {
  if (pid === 'sys') {
    if (a.t === 'dealer' && st.phase === 'play' && st.turn === 'd') return doAction(st, 'd', plan(st, 'd', rnd), rnd);
    return 'bad-sys';
  }
  if (pid !== st.pid) return 'no-player';
  if (a.t === 'next') { if (st.phase !== 'roundEnd') return 'cannot'; startRound(st, rnd); return null; }
  if (st.phase !== 'play') return 'locked';
  if (st.turn !== 'p') return 'not-your-turn';
  return doAction(st, 'p', a, rnd);
}

export function pending(st) {
  if (st.phase === 'roundEnd' || (st.phase === 'play' && st.turn === 'p')) return [st.pid];
  return [];
}
export function auto(st) {
  if (st.phase === 'play' && st.turn === 'd') return { delay: 1400, action: { t: 'dealer' } };
  return null;
}
export function timeoutAction(st) {
  if (st.phase === 'roundEnd') return { t: 'next' };
  return { t: 'shoot', target: 'd' };
}
export function bot() { return null; }

// ---------- ИИ крупье: знает только публичный счёт и то, что подсмотрел сам ----------
export function plan(st, me, rnd = Math.random) {
  const op = other(me); const items = st.items[me];
  const idxOf = (id) => items.indexOf(id);
  const use = (id) => ({ t: 'item', idx: idxOf(id) });
  const k = st.kn[me][0]; const len = st.shells.length;
  let pLive;
  if (k) pLive = k === 'live' ? 1 : 0;
  else if (st.uncertain) pLive = 0.5;
  else if (len === 1) pLive = st.remaining.live >= 1 ? 1 : 0;
  else { const t = st.remaining.live + st.remaining.blank; pLive = t > 0 ? st.remaining.live / t : 0.5; }

  if (idxOf('cigarettes') >= 0 && st.hp[me] < st.maxHp) return use('cigarettes');
  if (idxOf('medicine') >= 0 && st.hp[me] >= 3 && st.hp[me] < st.maxHp && rnd() < 0.5) return use('medicine');
  if (!k && pLive > 0 && pLive < 1) {
    if (idxOf('magnifier') >= 0) return use('magnifier');
    if (idxOf('phone') >= 0 && len >= 2) return use('phone');
  }
  if (idxOf('adrenaline') >= 0) {
    const cand = stealable(st, me);
    if (cand.length) {
      const prio = ['magnifier', 'cuffs', 'saw', 'cigarettes', 'inverter', 'beer', 'phone', 'medicine'];
      let best = -1, bestScore = 99;
      for (const i of cand) {
        const id = st.items[op][i]; let sc = prio.indexOf(id);
        if (id === 'magnifier' && k) sc = 50;
        if (id === 'cigarettes' && st.hp[me] >= st.maxHp) sc = 60;
        if (sc >= 0 && sc < bestScore) { bestScore = sc; best = i; }
      }
      if (best >= 0 && bestScore < 50) return { t: 'item', idx: idxOf('adrenaline'), stealIdx: best };
    }
  }
  if (idxOf('inverter') >= 0 && (k === 'blank' || (!k && pLive <= 0.34))) return use('inverter');
  if (idxOf('cuffs') >= 0 && canUse(st, me, 'cuffs') && (k === 'live' || pLive >= 0.5)) return use('cuffs');
  if (idxOf('beer') >= 0 && !k && len > 1 && pLive > 0.4 && pLive < 0.6) return use('beer');
  if (idxOf('saw') >= 0 && !st.sawed && st.hp[op] >= 2 && (k === 'live' || pLive >= 0.67)) return use('saw');
  let target;
  if (k === 'live' || pLive > 0.5) target = op;
  else if (k === 'blank' || pLive < 0.5) target = me;
  else target = st.hp[me] > st.hp[op] ? me : op;
  return { t: 'shoot', target };
}

// ---------- вид для UI: порядок патронов и знания крупье скрыты ----------
export function view(st, pid) {
  const hidden = (e) => {
    if (e.k === 'item' && e.who === 'd' && (e.item === 'magnifier' || e.item === 'phone' || e.stolen === 'magnifier' || e.stolen === 'phone')) {
      const { shell, pos, ...rest } = e; return rest;
    }
    return e;
  };
  const steal = stealable(st, 'p');
  return {
    game: 'shell', me: pid, mode: st.mode, round: st.round, maxHp: st.maxHp, hp: { ...st.hp },
    items: { p: st.items.p.slice(), d: st.items.d.slice() },
    usable: st.items.p.map((id) => (id === 'adrenaline' ? steal.length > 0 : canUse(st, 'p', id))),
    stealable: steal,
    left: st.shells.length, announced: { ...st.announced }, spent: st.spent.slice(), known: st.kn.p.slice(),
    turn: st.turn, sawed: st.sawed, cuffed: { ...st.cuffed }, phase: st.phase, over: st.over,
    score: st.score, roundsWon: st.roundsWon, seq: st.seq, events: st.events.map(hidden),
  };
}

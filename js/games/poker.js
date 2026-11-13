// UI покера (Техасский холдем)
import * as pk from '../engines/poker.js';
import { h, btn, fmt, hotkeys, avatar } from '../core/ui.js';
import { Stage, backURL } from '../core/cards.js';
import { countTo, floatText, pop } from '../core/anim.js';
import { sfx } from '../core/sfx.js';
import * as store from '../core/store.js';
import * as stats from '../core/stats.js';

const assistOn = () => store.get().assist !== false;
const ACT = { fold: 'Фолд', check: 'Чек', call: 'Колл', raise: 'Рейз', bet: 'Бет', allin: 'Олл-ин' };

export function mount(root, handle, ctx) {
  const me = handle.me;
  let table, boardEl, potEl, infoEl, ctrl, deck, hint;
  const seats = new Map();
  let built = 0, prev = null, prevCur = null, raiseTo = 0, raiseOpen = false, finished = false, startChips = 0, inHand = false;

  root.append(h('div', { class: 'pk' },
    (table = h('div', { class: 'ptable' },
      h('div', { class: 'rail' }),
      h('div', { class: 'pcenter' },
        (potEl = h('div', { class: 'pot' }, 'Банк ', h('b', null, '0'))),
        (boardEl = h('div', { class: 'cards board hand-row' })),
        (infoEl = h('div', { class: 'banner' }))),
      (deck = h('div', { class: 'pdeck', 'aria-hidden': 'true' }, h('div', { class: 'card down' }, h('div', { class: 'inner' }, h('div', { class: 'face' }), h('div', { class: 'back' }))))))),
    (hint = h('div', { class: 'myhand' })),
    (ctrl = h('div', { class: 'controls pk-ctrl' }))));
  const stage = new Stage(root, () => { const r = deck.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });

  const pos = (i, n, rx = 41, ry = 38) => {
    const a = (Math.PI / 2) + (i / n) * Math.PI * 2;
    return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) };
  };

  function build(v) {
    table.querySelectorAll('.pseat,.pbet').forEach((e) => e.remove());
    seats.clear();
    const n = v.players.length;
    const myIdx = Math.max(0, v.players.findIndex((p) => p.id === me));
    v.players.forEach((p, idx) => {
      const rel = (idx - myIdx + n) % n;
      const narrow = table.clientWidth < 560;
      const ps = pos(rel, n, narrow ? 31 : 41, 38);
      const back = handle.backs[p.id];
      const r = {};
      const isMe = p.id === me;
      r.el = h('div', { class: 'pseat' + (isMe ? ' me' : ''), 'data-pid': p.id, style: { left: ps.x + '%', top: ps.y + '%', ...(back ? { '--back': backURL(back) } : {}) } },
        (r.cards = h('div', { class: 'cards hand-row hole' })),
        h('div', { class: 'pinfo' }, avatar(p.name), h('div', { class: 'ptxt' }, h('div', { class: 'pname' }, isMe ? 'Вы' : p.name), (r.chips = h('div', { class: 'pchips' }, fmt(p.chips))))),
        (r.act = h('div', { class: 'pact' })),
        (r.btn = h('span', { class: 'dbtn', hidden: true }, 'D')),
        (r.blind = h('span', { class: 'blind', hidden: true })));
      const bx = ps.x + (50 - ps.x) * 0.36, by = ps.y + (50 - ps.y) * 0.36 + (rel === 0 ? -2 : 0);
      r.bet = h('div', { class: 'pbet', style: { left: bx + '%', top: by + '%' }, hidden: true }, h('i'), h('span'));
      table.append(r.el, r.bet);
      seats.set(p.id, r);
    });
    built = n;
  }

  function render(v) {
    if (built !== v.players.length) build(v);
    const myIdx = v.players.findIndex((p) => p.id === me);
    const cur = v.current >= 0 ? v.players[v.current] : null;
    stage.run((s) => {
      s.sync(boardEl, v.board, { prefix: 'b' });
      v.players.forEach((p) => s.sync(seats.get(p.id).cards, p.hole, { prefix: 'h' }));
    });
    // карты: размеры
    table.style.setProperty('--cw-me', 'clamp(38px, min(8vw, 11dvh), 74px)');
    v.players.forEach((p, idx) => {
      const r = seats.get(p.id);
      countTo(r.chips, p.chips, 450);
      r.el.classList.toggle('fold', p.folded && !p.out);
      r.el.classList.toggle('out', p.out);
      r.el.classList.toggle('turn', cur && cur.id === p.id);
      r.btn.hidden = v.dealer !== idx;
      const isSB = v.sbIdx === idx, isBB = v.bbIdx === idx;
      r.blind.hidden = !(isSB || isBB) || v.phase === 'game_over';
      r.blind.textContent = isBB ? 'BB' : 'SB';
      const a = p.act;
      r.act.textContent = p.out ? 'Вылетел' : a ? (ACT[a.t] || '') + (a.t === 'call' || a.t === 'raise' || a.t === 'bet' || a.t === 'allin' ? ' ' + fmt(a.amt) : '') : '';
      r.act.classList.toggle('on', !!(a || p.out));
      const was = prev && prev.players[idx];
      if (p.bet > 0) { r.bet.hidden = false; r.bet.lastChild.textContent = fmt(p.bet); if (!was || was.bet !== p.bet) { pop(r.bet, 0.8); sfx.chip(); } } else r.bet.hidden = true;
    });
    countTo(potEl.lastChild, v.pot, 500);
    // подсветка победителей и баннер
    let text = '';
    const winners = new Map();
    if (v.result) {
      for (const pot of v.result.pots) { const share = Math.floor(pot.amount / pot.winners.length); pot.winners.forEach((w) => winners.set(w, (winners.get(w) || 0) + share)); }
      const names = [...winners.keys()].map((id) => (id === me ? 'Вы' : v.players.find((p) => p.id === id).name));
      const top = v.result.pots[v.result.pots.length - 1];
      const handName = v.result.showdown && top.hand ? ` · ${top.hand}` : '';
      text = `${names.join(', ')} ${names.length > 1 || names[0] === 'Вы' ? 'забираете' : 'забирает'} ${fmt([...winners.values()].reduce((a, b) => a + b, 0))}${handName}`;
      if (names.length > 1 || names[0] === 'Вы') text = `${names.join(', ')} ${names[0] === 'Вы' && names.length === 1 ? 'забираете' : 'делят'} банк${handName}`;
    } else if (v.phase === 'game_over') text = '';
    else if (cur) text = cur.id === me ? 'Ваш ход' : `Ходит ${cur.name}`;
    v.players.forEach((p) => seats.get(p.id).el.classList.toggle('win', winners.has(p.id)));
    if (infoEl.textContent !== text) { infoEl.textContent = text; if (text) pop(infoEl, 0.96); }
    if (v.result && !(prev && prev.result)) {
      const w = winners.get(me);
      if (w) { sfx.win(); floatText(seats.get(me).el, '+' + fmt(w), 'good'); } else sfx.lose();
    }
    if (cur && cur.id === me && prevCur !== me) { sfx.turn(); raiseOpen = false; }
    prevCur = cur ? cur.id : null;
    // статистика: начало раздачи и итог
    const mine = myIdx >= 0 ? v.players[myIdx] : null;
    if (mine && (!prev || prev.hands !== v.hands)) { startChips = mine.chips + mine.total; inHand = !mine.out; }
    if (mine && v.phase === 'hand_over' && (!prev || prev.phase !== 'hand_over') && inHand) {
      const d = mine.chips - startChips;
      stats.rec('poker', { play: 1, win: d > 0 ? 1 : 0, draw: d === 0 ? 1 : 0, points: d, net: d }, { max: { bestPot: Math.max(0, d) } });
      inHand = false;
    }
    // моя комбинация
    if (assistOn() && mine && mine.hole.length === 2 && !mine.hole[0].h && v.board.length >= 3 && !mine.folded) {
      hint.textContent = pk.HAND_NAMES[pk.bestOf([...mine.hole, ...v.board])[0]];
    } else hint.textContent = '';
    renderControls(v, mine, cur);
    if (v.phase === 'game_over' && !finished) {
      finished = true;
      const w = v.players.find((p) => p.id === v.winner);
      stats.rec('poker', { points: w && w.id === me ? 300 : 0 }, { add: { tournaments: 1, tournamentsWon: w && w.id === me ? 1 : 0 } });
      setTimeout(() => ctx.finish({ title: w && w.id === me ? 'Вы победили!' : `Победил ${w ? w.name : '—'}`, sub: w && w.id === me ? 'Все фишки за вашим столом.' : 'Турнир окончен.' }), 900);
    }
    prev = v;
  }

  const keymap = {};
  function renderControls(v, mine, cur) {
    ctrl.replaceChildren();
    for (const k of Object.keys(keymap)) delete keymap[k];
    if (!mine || v.phase === 'game_over') return;
    if (v.phase === 'hand_over') { ctrl.append(btn('Дальше', () => handle.act({ t: 'next' }), 'ghost')); keymap.enter = () => handle.act({ t: 'next' }); return; }
    const L = v.limits;
    if (!L || !cur || cur.id !== me) { if (mine.out) ctrl.append(h('span', { class: 'hint' }, 'Вы вылетели. Наблюдаете за игрой.')); return; }
    const act = (a) => { sfx.click(); raiseOpen = false; handle.act(a); };
    if (raiseOpen && L.canRaise) {
      const lo = L.minTo, hi = L.maxTo;
      if (raiseTo < lo || raiseTo > hi) raiseTo = lo;
      const out = h('b', { class: 'rv' }, fmt(raiseTo));
      const slider = h('input', { type: 'range', min: lo, max: hi, step: Math.max(1, Math.floor(v.unit / 2)), value: raiseTo, 'aria-label': 'Размер рейза', style: { accentColor: 'var(--accent)', flex: 1, minWidth: '140px' } });
      slider.addEventListener('input', () => { raiseTo = +slider.value; out.textContent = fmt(raiseTo); go.firstChild.textContent = raiseTo >= hi ? 'Олл-ин' : 'Рейз до ' + fmt(raiseTo); });
      const q = (label, frac) => btn(label, () => { const t = Math.round((v.currentBet + (L.pot + L.toCall) * frac) / v.unit) * v.unit; raiseTo = Math.max(lo, Math.min(hi, t)); slider.value = raiseTo; slider.dispatchEvent(new Event('input')); }, 'ghost sm');
      const go = btn(raiseTo >= hi ? 'Олл-ин' : 'Рейз до ' + fmt(raiseTo), () => act(raiseTo >= hi ? { t: 'allin' } : { t: 'raise', to: raiseTo }), 'primary');
      ctrl.append(h('div', { class: 'raise-panel' }, h('div', { class: 'row', style: { flexWrap: 'nowrap', width: '100%' } }, slider, out), h('div', { class: 'row' }, q('½ банка', 0.5), q('¾', 0.75), q('Банк', 1), btn('Олл-ин', () => { raiseTo = hi; slider.value = hi; slider.dispatchEvent(new Event('input')); }, 'ghost sm'))), h('div', { class: 'row' }, btn('Назад', () => { raiseOpen = false; renderControls(v, mine, cur); }, 'ghost'), go));
      keymap.enter = () => go.click(); keymap.escape = () => { raiseOpen = false; renderControls(v, mine, cur); };
      return;
    }
    ctrl.append(h('button', { class: 'btn danger', onclick: () => act({ t: 'fold' }) }, 'Фолд', h('kbd', null, 'F')));
    keymap.f = () => act({ t: 'fold' });
    if (L.toCall === 0) { ctrl.append(h('button', { class: 'btn', onclick: () => act({ t: 'check' }) }, 'Чек', h('kbd', null, 'C'))); keymap.c = () => act({ t: 'check' }); }
    else { ctrl.append(h('button', { class: 'btn primary', onclick: () => act({ t: 'call' }) }, L.toCall >= mine.chips ? `Олл-ин ${fmt(mine.chips)}` : `Колл ${fmt(L.toCall)}`, h('kbd', null, 'C'))); keymap.c = () => act({ t: 'call' }); }
    if (L.canRaise) {
      ctrl.append(h('button', { class: 'btn', onclick: () => { raiseOpen = true; raiseTo = L.minTo; renderControls(v, mine, cur); } }, v.currentBet === 0 ? 'Бет…' : 'Рейз…', h('kbd', null, 'R')));
      keymap.r = () => { raiseOpen = true; raiseTo = L.minTo; renderControls(v, mine, cur); };
    }
  }
  const off = hotkeys(new Proxy({}, { get: (_, k) => keymap[k] }));
  const unsub = handle.onView(render);
  return { destroy() { off(); unsub(); stage.clear(); root.innerHTML = ''; } };
}

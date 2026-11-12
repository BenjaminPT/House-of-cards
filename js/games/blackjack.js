// UI «21»
import * as bj from '../engines/blackjack.js';
import { h, btn, fmt, hotkeys, avatar } from '../core/ui.js';
import { Stage } from '../core/cards.js';
import { countTo, floatText, pop, shake } from '../core/anim.js';
import { sfx } from '../core/sfx.js';
import { backURL } from '../core/cards.js';

const CHIPS = [10, 50, 100, 500];
const RES = { win: 'Победа', lose: 'Проигрыш', push: 'Ничья', bust: 'Перебор', blackjack: 'Блэкджек' };

export function mount(root, handle, ctx) {
  const me = handle.me;
  let seatsEl, dealerEl, dealerCards, dealerTotal, ctrl, msg, shoe;
  const seatRefs = new Map();
  let prev = null, built = 0;

  root.append(
    h('div', { class: 'bj' },
      h('div', { class: 'bj-top' },
        (dealerEl = h('div', { class: 'dealer' },
          h('div', { class: 'zone-label' }, 'Дилер ', (dealerTotal = h('span', { class: 'total', hidden: true }))),
          (dealerCards = h('div', { class: 'cards hand-row' })))),
        (shoe = h('div', { class: 'shoe', 'aria-hidden': 'true' }, h('div', { class: 'card down' }, h('div', { class: 'inner' }, h('div', { class: 'face' }), h('div', { class: 'back' })))))),
      (msg = h('div', { class: 'banner', 'aria-live': 'polite' })),
      (seatsEl = h('div', { class: 'seats' })),
      (ctrl = h('div', { class: 'controls' })),
    ),
  );
  const stage = new Stage(root, () => { const r = shoe.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const stageRoot = root.querySelector('.bj');

  function buildSeats(v) {
    seatsEl.innerHTML = ''; seatRefs.clear();
    v.players.forEach((p) => {
      const refs = {};
      const back = handle.backs[p.id];
      const el = h('div', { class: 'seat', 'data-pid': p.id, style: back ? { '--back': backURL(back) } : {} },
        h('div', { class: 'seat-head' }, avatar(p.name), h('div', { class: 'seat-name' }, p.id === me ? 'Вы' : p.name, p.bot ? h('small', null, ' · бот') : null)),
        (refs.hands = h('div', { class: 'hands' })),
        h('div', { class: 'seat-foot' },
          (refs.chips = h('span', { class: 'chips-count', title: 'Фишки' }, fmt(p.chips))),
          (refs.bet = h('span', { class: 'bet-pill' }))),
      );
      refs.el = el; refs.handEls = [];
      seatsEl.append(el); seatRefs.set(p.id, refs);
    });
    stageRoot.style.setProperty('--cw', (v.players.length >= 4 ? 'clamp(40px, 7.4vw, 64px)' : v.players.length === 3 ? 'clamp(46px, 8.4vw, 72px)' : 'clamp(52px, 10vw, 84px)'));
    built = v.players.length;
  }

  function render(v) {
    if (built !== v.players.length) buildSeats(v);
    const turnPid = v.phase === 'play' && v.turn >= 0 ? v.players[v.turn].id : null;
    stage.run((s) => {
      s.sync(dealerCards, v.dealer.cards, { prefix: 'd' });
      v.players.forEach((p) => {
        const r = seatRefs.get(p.id);
        while (r.handEls.length < p.hands.length) { const hd = h('div', { class: 'hand' }, h('div', { class: 'cards hand-row' }), h('div', { class: 'hand-meta' })); r.hands.append(hd); r.handEls.push(hd); }
        while (r.handEls.length > Math.max(p.hands.length, 0)) r.handEls.pop().remove();
        p.hands.forEach((hd, i) => {
          const he = r.handEls[i];
          s.sync(he.firstChild, hd.cards, { prefix: 'p' });
          const t = bj.total(hd.cards).t;
          const meta = he.lastChild;
          const nat = hd.cards.length === 2 && !hd.fromSplit && t === 21;
          meta.innerHTML = '';
          if (hd.cards.length) meta.append(h('span', { class: 'total' + (t > 21 ? ' bad' : '') }, nat ? '21 · BJ' : String(t)));
          if (hd.doubled) meta.append(h('span', { class: 'tag' }, '×2'));
          if (hd.result) meta.append(h('span', { class: 'res ' + hd.result }, RES[hd.result]));
          he.classList.toggle('active', turnPid === p.id && p.active === i);
        });
      });
    });
    // дилер
    const dt = v.dealerTotal;
    dealerTotal.hidden = !v.dealer.cards.length;
    dealerTotal.textContent = v.holeUp || v.phase === 'done' ? String(bj.total(v.dealer.cards).t) : String(dt);
    dealerTotal.classList.toggle('bad', bj.total(v.dealer.cards.filter((c) => !c.h)).t > 21);
    // места
    v.players.forEach((p) => {
      const r = seatRefs.get(p.id);
      countTo(r.chips, p.chips, 500);
      const betNow = p.hands.length ? p.hands.reduce((a, x) => a + x.bet, 0) : p.bet;
      r.bet.textContent = betNow ? `Ставка ${fmt(betNow)}` : '';
      r.bet.classList.toggle('ready', v.phase === 'bet' && p.ready);
      r.el.classList.toggle('active', turnPid === p.id);
      r.el.classList.toggle('me', p.id === me);
    });
    // баннер
    const mine = v.players.find((p) => p.id === me);
    let text = '';
    if (v.phase === 'bet') text = mine && mine.ready ? 'Ждём остальных…' : 'Сделайте ставку';
    else if (v.phase === 'deal') text = '';
    else if (v.phase === 'play') text = turnPid === me ? 'Ваш ход' : turnPid ? `Ходит ${v.players[v.turn].name}` : '';
    else if (v.phase === 'dealer') text = 'Дилер';
    else if (v.phase === 'done') {
      const d = mine ? mine.delta : 0;
      text = d > 0 ? `Вы выиграли ${fmt(d)}` : d < 0 ? `Вы проиграли ${fmt(-d)}` : 'Ничья';
    }
    if (msg.textContent !== text) { msg.textContent = text; if (text) pop(msg, 0.96); }
    // эффекты
    if (prev && prev.phase !== 'done' && v.phase === 'done' && mine) {
      const r = seatRefs.get(me);
      if (mine.delta > 0) { sfx.win(); floatText(r.el, '+' + fmt(mine.delta), 'good'); } else if (mine.delta < 0) { sfx.lose(); floatText(r.el, '−' + fmt(-mine.delta), 'bad'); }
    }
    if (prev && turnPid === me && prevTurn !== me) sfx.turn();
    prevTurn = turnPid;
    renderControls(v, mine, turnPid);
    prev = v;
  }
  let prevTurn = null;

  const keymap = {};
  function renderControls(v, mine, turnPid) {
    ctrl.innerHTML = '';
    for (const k of Object.keys(keymap)) delete keymap[k];
    if (!mine) return;
    if (v.phase === 'bet') {
      if (mine.ready) { ctrl.append(btn('Изменить ставку', () => handle.act({ t: 'unready' }), 'ghost')); return; }
      if (mine.chips < 10 && mine.bet < 10) { ctrl.append(btn('Новый стек · 1000', () => handle.act({ t: 'rebuy' }), 'primary')); return; }
      const row = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Фишки' });
      for (const c of CHIPS) {
        const b = h('button', { class: 'chip c' + c, type: 'button', 'aria-label': `Добавить ${c}`, disabled: mine.chips - 0 < 1 || mine.bet + c > mine.chips, onclick: () => { sfx.chip(); handle.act({ t: 'bet', amount: Math.min(mine.chips, mine.bet + c) }); } }, String(c));
        row.append(b);
      }
      const bar = h('div', { class: 'bet-bar' },
        h('span', { class: 'bet-now' }, 'Ставка ', h('b', null, fmt(mine.bet))),
        btn('Сброс', () => handle.act({ t: 'bet', amount: 0 }), 'ghost sm'),
        btn('Всё', () => { sfx.chip(); handle.act({ t: 'bet', amount: mine.chips }); }, 'ghost sm'));
      ctrl.append(row, bar, btn('Раздать', () => handle.act({ t: 'ready' }), 'primary', { disabled: mine.bet < 10 }));
      keymap.enter = () => mine.bet >= 10 && handle.act({ t: 'ready' });
      return;
    }
    if (v.phase === 'play' && turnPid === me) {
      const hd = mine.hands[mine.active];
      const acts = [
        ['Ещё', 'hit', true, 'h'], ['Хватит', 'stand', true, 's'],
        ['Удвоить', 'double', bj.canDouble(mine, hd), 'd'], ['Сплит', 'split', bj.canSplit(mine, hd), 'p'],
      ];
      for (const [label, t, ok, key] of acts) {
        ctrl.append(h('button', { class: 'btn ' + (t === 'hit' ? 'primary' : ''), disabled: !ok, onclick: () => { sfx.click(); handle.act({ t }); } }, label, h('kbd', null, key.toUpperCase())));
        if (ok) keymap[key] = () => handle.act({ t });
      }
      return;
    }
    if (v.phase === 'done') {
      if (!mine.next) { ctrl.append(btn('Следующая раздача', () => handle.act({ t: 'next' }), 'primary')); keymap.enter = () => handle.act({ t: 'next' }); }
      else ctrl.append(h('span', { class: 'hint' }, 'Ждём остальных…'));
    }
  }
  const off = hotkeys(new Proxy({}, { get: (_, k) => keymap[k] }));
  const unsub = handle.onView(render);
  return { destroy() { off(); unsub(); stage.clear(); root.innerHTML = ''; } };
}

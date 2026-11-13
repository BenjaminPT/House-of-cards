// UI «Сиквенс». Реальные правила: карту из колоды берёте сами и до хода следующего игрока.
import * as sq from '../engines/sequence.js';
import { SUIT_CH } from '../engines/common.js';
import { suitSym } from '../core/suits.js';
import * as store from '../core/store.js';
import * as stats from '../core/stats.js';
import { h, btn, hotkeys, avatar, toast } from '../core/ui.js';
import { Stage } from '../core/cards.js';
import { anim, pop, reduced, EASE, shake } from '../core/anim.js';
import { sfx } from '../core/sfx.js';

const TEAM_COLORS = ['#5aa9ff', '#4fd18b', '#ff8a7a', '#d9a8ff'];
const TEAM_NAMES = ['синие', 'зелёные', 'красные', 'фиолетовые'];
const VS = '︎';
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.4" fill="currentColor"/></svg>';
const ERR = {
  'not-dead': 'Эта карта не мёртвая: для неё есть свободная клетка.',
  'has-moves': 'У вас есть ходы — пропускать нельзя.',
  'draw-first': 'Сначала возьмите замену из колоды.',
  'bad-target': 'Сюда эту карту поставить нельзя.',
  'not-your-turn': 'Сейчас не ваш ход.',
};

export function mount(root, handle, ctx) {
  const me = handle.me;
  let boardEl, handEl, side, ctrl, banner, deckEl;
  const cells = [];
  let selected = null, prev = null, cur = null, finished = false;
  const keymap = {};
  const assist = () => store.get().assist !== false;
  const showErr = (e) => { if (e && ERR[e]) { toast(ERR[e]); sfx.lose(); } };

  root.append(h('div', { class: 'sqx' },
    h('div', { class: 'sq-main' },
      (banner = h('div', { class: 'banner' })),
      (boardEl = h('div', { class: 'sq-board', role: 'grid', 'aria-label': 'Игровое поле' }))),
    h('div', { class: 'sq-side' },
      (side = h('div', { class: 'sq-players' })),
      (deckEl = h('button', { class: 'sq-deck', type: 'button', 'aria-label': 'Колода: взять карту', title: 'Колода', onclick: () => drawCard() }, h('div', { class: 'card down' }, h('div', { class: 'inner' }, h('div', { class: 'face' }), h('div', { class: 'back' }))), h('span', { class: 'cnt' }))),
      (handEl = h('div', { class: 'cards hand-row sq-hand' })),
      (ctrl = h('div', { class: 'controls' })),
      h('div', { class: 'legend' },
        h('div', null, h('span', { class: 'lg two', html: EYE + EYE }), h('span', null, h('b', null, 'Двуглазый валет'), ' ♦ ♣ — фишка на любую свободную клетку')),
        h('div', null, h('span', { class: 'lg one', html: EYE }), h('span', null, h('b', null, 'Одноглазый валет'), ' ♠ ♥ — снять фишку соперника (кроме замкнутых линий)'))))));
  const stage = new Stage(root, () => { const r = deckEl.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });

  // клетки поля (создаются один раз)
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    const b = sq.BOARD[r][c];
    const el = b === 'F'
      ? h('button', { class: 'sc corner', type: 'button', tabindex: -1, 'aria-label': 'Свободный угол', disabled: true }, h('span', { class: 'free' }, '★'))
      : h('button', { class: 'sc s-' + b.s, type: 'button', role: 'gridcell', 'data-r': r, 'data-c': c, 'aria-label': `${b.r} ${b.s}`, onclick: () => onCell(r, c), onpointerenter: () => hoverCard(b), onpointerleave: () => hoverCard(null) },
        h('span', { class: 'r' }, b.r), h('span', { class: 's', html: suitSym(b.s) }));
    el.append(h('i', { class: 'tok' }));
    cells.push(el); boardEl.append(el);
  }

  function hoverCard(b) {
    cells.forEach((el) => el.classList.remove('twin'));
    if (!b || !assist()) return;
    cells.forEach((el, i) => { const bb = sq.BOARD[Math.floor(i / 10)][i % 10]; if (bb !== 'F' && bb.r === b.r && bb.s === b.s) el.classList.add('twin'); });
  }
  const myPlayer = () => cur.players.find((p) => p.id === me);
  const isMyTurn = () => cur.phase === 'play' && cur.players[cur.turn].id === me;
  function targetsOf(card) { return sq.targets(cur.board, myPlayer().team, card); }

  // Взять карту из колоды. Никаких напоминаний: забыли — право сгорает.
  function drawCard() {
    if (!cur || cur.phase !== 'play') return;
    const e = handle.act({ t: 'draw' });
    if (e) { shake(deckEl); return; }
    sfx.deal();
  }

  function onCell(r, c) {
    if (!cur || !isMyTurn()) return;
    const p = myPlayer();
    let card = selected != null ? p.hand.find((x) => x.i === selected) : null;
    if (!card) return; // карту выбирают сами — как за настоящим столом
    const ok = targetsOf(card).some(([rr, cc]) => rr === r && cc === c);
    if (!ok) { sfx.lose(); return; }
    selected = null;
    const e = handle.act({ t: 'play', card: card.i, r, c });
    if (e) { showErr(e); return; }
    sfx.place();
  }

  function selectCard(c) {
    if (!isMyTurn()) return;
    selected = selected === c.i ? null : c.i; sfx.click();
    paintSel();
  }
  function paintSel() {
    const p = myPlayer();
    const card = selected != null ? p.hand.find((x) => x.i === selected) : null;
    const tg = card && assist() ? new Set(targetsOf(card).map(([r, c]) => r * 10 + c)) : null;
    cells.forEach((el, i) => { el.classList.toggle('target', !!tg && tg.has(i)); el.classList.toggle('dim', !!tg && !tg.has(i) && !el.classList.contains('corner')); });
    handEl.querySelectorAll('.card').forEach((el) => { el.classList.toggle('sel', card && +el.dataset.i === card.i); });
    renderControls();
  }

  const jackLabel = (c) => (sq.twoEyed(c) ? 'Двуглазый валет: фишка на любую свободную клетку' : 'Одноглазый валет: снять фишку соперника');
  function decorateJack(el, c) {
    if (c.h || c.r !== 'J') return;
    const face = el.querySelector('.face');
    let jk = face.querySelector('.jk');
    const two = sq.twoEyed(c);
    if (!jk) { jk = h('div', { class: 'jk' }); face.append(jk); }
    if (jk.dataset.t !== (two ? '2' : '1')) { jk.dataset.t = two ? '2' : '1'; jk.className = 'jk ' + (two ? 'two' : 'one'); jk.innerHTML = two ? EYE + EYE : EYE; }
    el.title = jackLabel(c); el.setAttribute('aria-label', jackLabel(c) + ` (${SUIT_CH[c.s]})`);
  }

  function render(v) {
    cur = v;
    const p = v.players.find((x) => x.id === me);
    cells.forEach((el, i) => {
      const r = Math.floor(i / 10), c = i % 10;
      const cell = v.board[r][c]; if (cell.corner) return;
      const tok = el.lastChild;
      const had = tok.dataset.t;
      const now = cell.chip === -1 ? '' : String(cell.chip);
      if (had !== now) {
        tok.dataset.t = now;
        if (now) { tok.style.setProperty('--tc', TEAM_COLORS[cell.chip % 4]); tok.hidden = false; if (prev) { anim(tok, [{ transform: 'scale(1.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: EASE.out }); } }
        else { if (prev && !reduced()) { const ghost = tok.cloneNode(); ghost.style.position = 'absolute'; el.append(ghost); anim(ghost, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.4) rotate(40deg)', opacity: 0 }], { duration: 360 }).then(() => ghost.remove()); } tok.hidden = true; }
      }
      tok.hidden = !now;
      el.classList.toggle('locked', !!cell.locked);
      el.classList.toggle('last', !!v.last && v.last.r === r && v.last.c === c);
    });
    cells.forEach((el) => el.classList.remove('seqcell'));
    v.seqs.forEach((s) => s.cells.forEach(([r, c]) => cells[r * 10 + c].classList.add('seqcell')));
    side.replaceChildren(...v.players.map((pl, i) => h('div', { class: 'sp' + (v.phase === 'play' && v.turn === i ? ' turn' : '') },
      h('i', { class: 'tdot', style: { background: TEAM_COLORS[pl.team % 4] } }), avatar(pl.name), h('span', { class: 'spn' }, pl.id === me ? 'Вы' : pl.name),
      h('small', null, `линий ${v.seqs.filter((s) => s.team === pl.team).length}/${v.need} · карт ${pl.hand.length}`))));
    deckEl.lastChild.textContent = `${v.deckLeft}`;
    stage.run((s) => s.sync(handEl, p.hand, { prefix: 'h', decorate: (el, c) => { el.dataset.i = c.i; el.classList.add('pick'); el.classList.toggle('dead', assist() && !c.h && sq.isDead(v.board, c)); el.onclick = () => selectCard(c); el.tabIndex = 0; el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCard(c); } }; decorateJack(el, c); } }));
    if (selected != null && !p.hand.some((c) => c.i === selected)) selected = null;
    let t = '';
    if (v.phase !== 'over') t = isMyTurn() ? 'Ваш ход' : `Ходит ${v.players[v.turn].name}`;
    if (v.last && prev && (!prev.last || prev.last.r !== v.last.r || prev.last.c !== v.last.c || prev.last.team !== v.last.team || prev.turn !== v.turn)) {
      const by = v.players.find((x) => x.id === v.last.by);
      if (by && by.id !== me) sfx.place();
    }
    if (isMyTurn() && !(prev && prev.phase === 'play' && prev.players[prev.turn].id === me)) sfx.turn();
    if (banner.textContent !== t) { banner.textContent = t; t && pop(banner, 0.96); }
    paintSel();
    if (v.phase === 'over' && !finished) {
      finished = true;
      const wp = v.players.filter((x) => x.team === v.winner);
      const mine = wp.some((x) => x.id === me);
      stats.rec('sequence', { play: 1, win: mine ? 1 : 0, points: mine ? 100 + 50 * v.seqs.filter((s) => s.team === v.winner).length : 0 }, { add: { sequences: v.seqs.filter((s) => s.team === p.team).length } });
      if (mine) sfx.win(); else sfx.lose();
      setTimeout(() => ctx.finish({ title: mine ? 'Победа!' : 'Партия окончена', sub: mine ? 'Ваша линия из пяти замкнулась.' : `Победили ${v.teams === 2 ? TEAM_NAMES[v.winner] : wp[0].name}.` }), 1100);
    }
    prev = v;
  }

  function renderControls() {
    ctrl.replaceChildren();
    for (const k of Object.keys(keymap)) delete keymap[k];
    if (!cur || cur.phase !== 'play' || !isMyTurn()) return;
    const p = myPlayer();
    const sel = selected != null ? p.hand.find((c) => c.i === selected) : null;
    ctrl.append(
      btn('Мёртвая карта', () => { if (!sel) return; const e = handle.act({ t: 'dead', card: sel.i }); if (e) showErr(e); else { selected = null; sfx.flip(); } }, 'ghost sm', { disabled: !sel || sq.isJack(sel), title: 'Заменить выбранную карту, если для неё нет свободных клеток' }),
      btn('Пропустить ход', () => { const e = handle.act({ t: 'pass' }); if (e) showErr(e); }, 'ghost sm'));
    keymap.escape = () => { selected = null; paintSel(); };
    keymap.d = () => drawCard();
  }
  const off = hotkeys(new Proxy({}, { get: (_, k) => keymap[k] }));
  const unsub = handle.onView(render);
  const offRej = handle.onReject ? handle.onReject(showErr) : null;
  return { destroy() { off(); unsub(); offRej && offRej(); stage.clear(); root.innerHTML = ''; } };
}

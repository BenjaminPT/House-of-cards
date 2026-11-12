// UI «Сиквенс»
import * as sq from '../engines/sequence.js';
import { SUIT_CH } from '../engines/common.js';
import { h, btn, hotkeys, avatar } from '../core/ui.js';
import { Stage, backURL } from '../core/cards.js';
import { anim, pop, reduced, EASE } from '../core/anim.js';
import { sfx } from '../core/sfx.js';

const TEAM_COLORS = ['#5aa9ff', '#4fd18b', '#ff8a7a', '#d9a8ff'];
const TEAM_NAMES = ['синие', 'зелёные', 'красные', 'фиолетовые'];
const VS = '︎';

export function mount(root, handle, ctx) {
  const me = handle.me;
  let boardEl, handEl, side, ctrl, banner, deckEl;
  const cells = [];
  let selected = null, prev = null, cur = null, finished = false;
  const keymap = {};

  root.append(h('div', { class: 'sqx' },
    h('div', { class: 'sq-main' },
      (banner = h('div', { class: 'banner' })),
      (boardEl = h('div', { class: 'sq-board', role: 'grid', 'aria-label': 'Игровое поле' }))),
    h('div', { class: 'sq-side' },
      (side = h('div', { class: 'sq-players' })),
      (deckEl = h('div', { class: 'sq-deck' }, h('div', { class: 'card down' }, h('div', { class: 'inner' }, h('div', { class: 'face' }), h('div', { class: 'back' }))), h('span', { class: 'cnt' }))),
      (handEl = h('div', { class: 'cards hand-row sq-hand' })),
      (ctrl = h('div', { class: 'controls' })))));
  const stage = new Stage(root, () => { const r = deckEl.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });

  // клетки поля (создаются один раз)
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    const b = sq.BOARD[r][c];
    const el = b === 'F'
      ? h('button', { class: 'sc corner', type: 'button', tabindex: -1, 'aria-label': 'Свободный угол', disabled: true }, h('span', { class: 'free' }, '★'))
      : h('button', { class: 'sc s-' + b.s, type: 'button', role: 'gridcell', 'data-r': r, 'data-c': c, 'aria-label': `${b.r} ${b.s}`, onclick: () => onCell(r, c), onpointerenter: () => hoverCard(b), onpointerleave: () => hoverCard(null) },
        h('span', { class: 'r' }, b.r), h('span', { class: 's' }, SUIT_CH[b.s] + VS));
    el.append(h('i', { class: 'tok' }));
    cells.push(el); boardEl.append(el);
  }

  function hoverCard(b) {
    cells.forEach((el) => el.classList.remove('twin'));
    if (!b) return;
    cells.forEach((el, i) => { const bb = sq.BOARD[Math.floor(i / 10)][i % 10]; if (bb !== 'F' && bb.r === b.r && bb.s === b.s) el.classList.add('twin'); });
  }
  const myPlayer = () => cur.players.find((p) => p.id === me);
  const isMyTurn = () => cur.phase === 'play' && cur.players[cur.turn].id === me;
  function targetsOf(card) { return sq.targets(cur.board, myPlayer().team, card); }

  function onCell(r, c) {
    if (!cur || !isMyTurn()) return;
    const p = myPlayer();
    let card = selected != null ? p.hand.find((x) => x.i === selected) : null;
    if (!card) { // клик по клетке без выбранной карты — найти подходящую обычную карту
      const b = sq.BOARD[r][c]; if (b === 'F') return;
      card = p.hand.find((x) => x.r === b.r && x.s === b.s && cur.board[r][c].chip === -1);
      if (!card) return;
    }
    const ok = targetsOf(card).some(([rr, cc]) => rr === r && cc === c);
    if (!ok) { sfx.lose(); return; }
    selected = null;
    sfx.place();
    handle.act({ t: 'play', card: card.i, r, c });
  }

  function selectCard(c) {
    if (!isMyTurn()) return;
    selected = selected === c.i ? null : c.i; sfx.click();
    paintSel();
  }
  function paintSel() {
    const p = myPlayer();
    const card = selected != null ? p.hand.find((x) => x.i === selected) : null;
    const tg = card ? new Set(targetsOf(card).map(([r, c]) => r * 10 + c)) : null;
    cells.forEach((el, i) => { el.classList.toggle('target', !!tg && tg.has(i)); el.classList.toggle('dim', !!tg && !tg.has(i) && !el.classList.contains('corner')); });
    [...handEl.children].forEach((el) => el.classList.toggle('sel', card && el.dataset.rs === card.r + card.s && false));
    handEl.querySelectorAll('.card').forEach((el) => { const c = p.hand.find((x) => (el.dataset.rs === x.r + x.s) && x.i === +el.dataset.i); el.classList.toggle('sel', !!c && c.i === selected); });
    renderControls();
  }

  function render(v) {
    cur = v;
    const p = v.players.find((x) => x.id === me);
    // поле
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
    // линии (секвенции)
    cells.forEach((el) => el.classList.remove('seqcell'));
    v.seqs.forEach((s) => s.cells.forEach(([r, c]) => cells[r * 10 + c].classList.add('seqcell')));
    // игроки
    side.replaceChildren(...v.players.map((pl, i) => h('div', { class: 'sp' + (v.phase === 'play' && v.turn === i ? ' turn' : '') },
      h('i', { class: 'tdot', style: { background: TEAM_COLORS[pl.team % 4] } }), avatar(pl.name), h('span', { class: 'spn' }, pl.id === me ? 'Вы' : pl.name), h('small', null, `линий ${v.seqs.filter((s) => s.team === pl.team).length}/${v.need}`))));
    deckEl.lastChild.textContent = `${v.deckLeft}`;
    // рука
    stage.run((s) => s.sync(handEl, p.hand, { prefix: 'h', decorate: (el, c) => { el.dataset.i = c.i; el.classList.add('pick'); el.classList.toggle('dead', !c.h && sq.isDead(v.board, c)); el.onclick = () => selectCard(c); el.tabIndex = 0; el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCard(c); } }; } }));
    if (selected != null && !p.hand.some((c) => c.i === selected)) selected = null;
    // баннер
    let t = '';
    if (v.phase === 'over') t = '';
    else if (isMyTurn()) t = selected != null ? 'Выберите клетку' : 'Ваш ход — выберите карту';
    else t = `Ходит ${v.players[v.turn].name}`;
    if (v.last && prev && (!prev.last || prev.last.r !== v.last.r || prev.last.c !== v.last.c || prev.last.team !== v.last.team || prev.turn !== v.turn)) {
      const by = v.players.find((x) => x.id === v.last.by);
      if (by && by.id !== me) { sfx.place(); }
    }
    if (isMyTurn() && !(prev && prev.phase === 'play' && prev.players[prev.turn].id === me)) sfx.turn();
    if (banner.textContent !== t) { banner.textContent = t; t && pop(banner, 0.96); }
    paintSel();
    if (v.phase === 'over' && !finished) {
      finished = true; sfx.win();
      const wp = v.players.filter((x) => x.team === v.winner);
      const mine = wp.some((x) => x.id === me);
      setTimeout(() => ctx.finish({ title: mine ? 'Победа!' : 'Партия окончена', sub: mine ? 'Ваша линия из пяти замкнулась.' : `Победили ${v.teams === 2 ? TEAM_NAMES[v.winner] : wp[0].name}.` }), 1100);
    }
    prev = v;
  }

  function renderControls() {
    ctrl.replaceChildren();
    for (const k of Object.keys(keymap)) delete keymap[k];
    if (!cur || !isMyTurn()) return;
    const p = myPlayer();
    const dead = p.hand.find((c) => sq.isDead(cur.board, c));
    const moves = sq.legalMoves(cur, me);
    if (dead && !cur.deadUsed) {
      const sel = selected != null ? p.hand.find((c) => c.i === selected) : null;
      const d = sel && sq.isDead(cur.board, sel) ? sel : dead;
      ctrl.append(btn(`Заменить мёртвую ${d.r}${SUIT_CH[d.s]}${VS}`, () => { sfx.flip(); handle.act({ t: 'dead', card: d.i }); selected = null; }, '', { title: 'Эта карта не имеет свободных клеток' }));
    }
    if (!moves.length && !(dead && !cur.deadUsed)) ctrl.append(btn('Пропустить ход', () => handle.act({ t: 'pass' }), 'primary'));
    if (selected != null) ctrl.append(btn('Отмена', () => { selected = null; paintSel(); }, 'ghost sm'));
    keymap.escape = () => { selected = null; paintSel(); };
  }
  const off = hotkeys(new Proxy({}, { get: (_, k) => keymap[k] }));
  const unsub = handle.onView(render);
  return { destroy() { off(); unsub(); stage.clear(); root.innerHTML = ''; } };
}

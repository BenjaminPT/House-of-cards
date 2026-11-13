// UI косынки: перетаскивание (pointer events), тап-для-хода, подсказки, автосбор, отмена.
import * as so from '../engines/solitaire.js';
import { SUITS, RANKS } from '../engines/common.js';
import { suitSym } from '../core/suits.js';
import { h, btn, fmt, hotkeys } from '../core/ui.js';
import { Stage, makeCard } from '../core/cards.js';
import { anim, countTo, pop, reduced, sleep } from '../core/anim.js';
import { sfx } from '../core/sfx.js';
import * as stats from '../core/stats.js';

const VS = '︎';

export function mount(root, handle, ctx) {
  const me = handle.me;
  let view = null, board = null, cw = 70, finished = false, t0 = 0, auto = false;
  let sel = null, lastTap = { id: -1, t: 0 }, hintTimer = null;
  const keymap = {};
  const loc = new Map(); // id → {k,...}
  const pileEls = {};
  const mkPile = (cls, pile, content) => { const e = h('div', { class: 'pile ' + cls, 'data-pile': pile }, content, h('div', { class: 'cards abs' })); pileEls[pile] = e; return e; };

  const bar = h('div', { class: 'sol-bar' });
  const stats = { score: h('b', null, '0'), moves: h('b', null, '0'), time: h('b', null, '0:00') };
  const others = h('div', { class: 'sol-others' });
  bar.append(h('span', null, 'Очки ', stats.score), h('span', null, 'Ходы ', stats.moves), h('span', null, 'Время ', stats.time), others);
  const top = h('div', { class: 'sol-top' },
    h('div', { class: 'sol-left' }, mkPile('stock', 'stock', h('span', { class: 'ph', 'aria-hidden': 'true' }, '↻')), mkPile('waste', 'waste', null)),
    h('div', { class: 'sol-found' }, SUITS.map((s, i) => mkPile('found', 'f' + i, h('span', { class: 'ph s-' + s, 'aria-hidden': 'true', html: suitSym(s) })))));
  const tab = h('div', { class: 'sol-tab' }, [0, 1, 2, 3, 4, 5, 6].map((i) => mkPile('tab', 't' + i, null)));
  const ctrl = h('div', { class: 'controls sol-ctrl' });
  const dragLayer = h('div', { class: 'drag-layer' });
  const sol = h('div', { class: 'sol' }, bar, top, tab, ctrl, dragLayer);
  root.append(sol);
  const stockEl = pileEls.stock;
  const stage = new Stage(root, () => { const r = stockEl.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  stage.stagger = 14;

  /* ---- раскладка ---- */
  function metrics() {
    const W = sol.clientWidth || root.clientWidth || 360;
    const gap = Math.max(5, Math.min(14, W * 0.014));
    cw = Math.max(38, Math.min(96, Math.floor((W - gap * 6 - 4) / 7)));
    const H = sol.clientHeight || root.clientHeight || 0; // низкий экран (ландшафт телефона): карта ≤ ~1/4,7 высоты
    if (H) cw = Math.max(34, Math.min(cw, Math.floor(H / 4.7)));
    sol.style.setProperty('--cw', cw + 'px'); sol.style.setProperty('--gap', gap + 'px');
    return gap;
  }
  const ch = () => cw * 1.4;

  function layoutOffsets() {
    const availH = (sol.clientHeight || 600) - (top.offsetHeight || ch()) - (bar.offsetHeight || 30) - (ctrl.offsetHeight || 64) - 24;
    const maxUp = cw * 0.36, maxDown = cw * 0.14;
    let f = 1;
    for (const pile of board.tab) {
      const up = pile.filter((c) => c.up).length, dn = pile.length - up;
      const need = up * maxUp + dn * maxDown;
      const room = availH - ch();
      if (need > room && need > 0) f = Math.min(f, Math.max(0.45, room / need));
    }
    return { up: maxUp * f, down: maxDown * f };
  }

  function render(v) {
    view = v; board = v.board;
    if (!board) return;
    metrics();
    const off = layoutOffsets();
    loc.clear();
    const S = (c) => ({ ...c, h: !c.up });
    stage.run((s) => {
      s.sync(pileEls.stock.lastChild, board.stock.map(S), { decorate: (el, c, i) => place(el, 0, 0, 1 + i, c) });
      const L = board.waste.length, fan = board.draw === 3 ? 3 : 1;
      s.sync(pileEls.waste.lastChild, board.waste.map(S), { decorate: (el, c, i) => { const k = Math.max(0, i - (L - fan)); place(el, i >= L - fan ? k * cw * 0.28 : 0, 0, 1 + i, c); } });
      board.found.forEach((f, fi) => s.sync(pileEls['f' + fi].lastChild, f.map(S), { decorate: (el, c, i) => place(el, 0, 0, 1 + i, c) }));
      board.tab.forEach((pile, col) => {
        let y = 0; const ys = [];
        pile.forEach((c) => { ys.push(y); y += c.up ? off.up : off.down; });
        s.sync(pileEls['t' + col].lastChild, pile.map(S), { decorate: (el, c, i) => place(el, 0, ys[i], 1 + i, c) });
        pileEls['t' + col].style.height = (pile.length ? ys[ys.length - 1] + ch() : ch()) + 'px';
      });
    });
    // индекс локаций
    board.waste.forEach((c, i) => loc.set(c.i, { k: 'waste', top: i === board.waste.length - 1 }));
    board.found.forEach((f, s) => f.forEach((c, i) => loc.set(c.i, { k: 'found', s, top: i === f.length - 1 })));
    board.tab.forEach((pile, col) => pile.forEach((c, idx) => loc.set(c.i, { k: 'tab', col, idx })));
    pileEls.stock.classList.toggle('empty', !board.stock.length);
    pileEls.stock.classList.toggle('recycle', !board.stock.length && board.waste.length > 0);
    countTo(stats.score, board.score, 400); stats.moves.textContent = board.moves;
    if (board.moves > 0 && !t0) { t0 = Date.now(); stats.rec('solitaire', { play: 1 }); }
    if (board.moves === 0) t0 = 0;
    // соперники
    others.replaceChildren(...v.others.map((o) => h('span', { class: 'oth' + (o.won ? ' won' : '') }, `${o.name}: `, h('b', null, `${o.found}/52`))));
    if (sel) { if (!loc.has(sel.id)) clearSel(); else paintSel(); }
    renderControls();
    if (v.winner && !finished) {
      finished = true; sfx.win(); celebrate();
      const w = v.players.find((p) => p.id === v.winner);
      const mine = v.winner === me;
      if (mine) { const secs = t0 ? Math.floor((Date.now() - t0) / 1000) : 0; stats.rec('solitaire', { win: 1, points: board.score }, { max: { bestScore: board.score }, min: secs ? { bestTime: secs } : {} }); }
      setTimeout(() => ctx.finish({ title: mine ? 'Пасьянс сошёлся!' : `${w ? w.name : 'Соперник'} собрал(а) быстрее`, sub: mine ? `${fmt(board.score)} очков · ${board.moves} ходов · ${stats.time.textContent}` : 'В этот раз не успели.' }), 1600);
    }
    if (!v.winner && !auto && so.canFinish(board) && board.found.some((f) => f.length < 13)) runAuto();
  }
  function place(el, x, y, z, c) {
    el.dataset.i = c.i;
    Object.assign(el.style, { position: 'absolute', left: x + 'px', top: y + 'px', zIndex: z, pointerEvents: '' });
    el.classList.add('pick'); el.classList.remove('dragging');
  }

  const tick = setInterval(() => { if (t0 && !(view && view.winner)) { const s = Math.floor((Date.now() - t0) / 1000); stats.time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } else if (!t0) stats.time.textContent = '0:00'; }, 500);

  /* ---- ходы ---- */
  const act = (a) => handle.act(a);
  function fromOf(id) {
    const l = loc.get(id); if (!l) return null;
    if (l.k === 'waste') return l.top ? { k: 'waste' } : null;
    if (l.k === 'found') return l.top ? { k: 'found', s: l.s } : null;
    const pile = board.tab[l.col]; const seq = pile.slice(l.idx);
    if (!seq.every((c) => c.up)) return null;
    for (let i = 1; i < seq.length; i++) if (!so.canTab(seq[i], seq[i - 1])) return null;
    return { k: 'tab', col: l.col, idx: l.idx };
  }
  const cardOf = (from) => from.k === 'waste' ? board.waste[board.waste.length - 1] : from.k === 'found' ? board.found[from.s][board.found[from.s].length - 1] : board.tab[from.col][from.idx];
  function destsFor(from) {
    const out = [];
    for (let s = 0; s < 4; s++) if (so.tryMove(board, from, { k: 'found', s })) out.push({ k: 'found', s });
    for (let c = 0; c < 7; c++) if (so.tryMove(board, from, { k: 'tab', col: c })) out.push({ k: 'tab', col: c });
    return out;
  }
  const pileName = (to) => (to.k === 'found' ? 'f' + to.s : 't' + to.col);
  function move(from, to) {
    const e = act({ t: 'move', from, to });
    if (!e) { sfx.place(); clearSel(); return true; }
    sfx.lose(); return false;
  }
  function smart(from) {
    const d = destsFor(from);
    if (!d.length) { sfx.lose(); return false; }
    const f = d.find((x) => x.k === 'found');
    let pick = f;
    if (!pick) { // предпочесть непустой столбец, чтобы не тратить пустое место на короля без нужды
      pick = d.find((x) => board.tab[x.col].length > 0) || d[0];
    }
    return move(from, pick);
  }

  /* ---- выбор / подсветка ---- */
  function clearSel() { sel = null; sol.querySelectorAll('.sel,.ok').forEach((e) => e.classList.remove('sel', 'ok')); }
  function paintSel() {
    sol.querySelectorAll('.sel,.ok').forEach((e) => e.classList.remove('sel', 'ok'));
    if (!sel) return;
    const from = fromOf(sel.id); if (!from) { sel = null; return; }
    const seqIds = from.k === 'tab' ? board.tab[from.col].slice(from.idx).map((c) => c.i) : [sel.id];
    stage.map.forEach((el, key) => { if (seqIds.includes(+el.dataset.i)) el.classList.add('sel'); });
    destsFor(from).forEach((d) => pileEls[pileName(d)].classList.add('ok'));
  }

  /* ---- ввод: drag + tap ---- */
  let drag = null;
  sol.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || view.winner) return;
    const cardEl = e.target.closest('.card');
    if (!cardEl || !cardEl.dataset.i) return;
    const id = +cardEl.dataset.i;
    const from = fromOf(id); if (!from) return;
    const l = loc.get(id);
    const seqEls = [];
    const ids = from.k === 'tab' ? board.tab[from.col].slice(from.idx).map((c) => c.i) : [id];
    ids.forEach((i) => { for (const el of stage.map.values()) if (+el.dataset.i === i) seqEls.push(el); });
    const r = cardEl.getBoundingClientRect();
    drag = { id, from, seqEls, x0: e.clientX, y0: e.clientY, gx: e.clientX - r.left, gy: e.clientY - r.top, on: false, pid: e.pointerId, rects: seqEls.map((el) => el.getBoundingClientRect()) };
  });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.on = true; clearSel(); sfx.click();
      drag.seqEls.forEach((el, i) => { dragLayer.append(el); el.classList.add('dragging'); el.style.position = 'fixed'; el.style.zIndex = 100 + i; el.style.pointerEvents = 'none'; });
    }
    const off = layoutOffsets();
    drag.seqEls.forEach((el, i) => { el.style.left = e.clientX - drag.gx + 'px'; el.style.top = e.clientY - drag.gy + i * off.up + 'px'; });
    const t = dropTarget(e.clientX, e.clientY, drag);
    sol.querySelectorAll('.ok').forEach((p) => p.classList.remove('ok'));
    if (t) pileEls[pileName(t)].classList.add('ok');
  }
  function dropTarget(x, y, drag) {
    // центр верхней карты
    const first = drag.seqEls[0].getBoundingClientRect();
    const cx = first.left + first.width / 2, cy = first.top + first.height / 3;
    const cands = [document.elementsFromPoint(cx, cy), document.elementsFromPoint(x, y)];
    for (const list of cands) for (const el of list) {
      const p = el.closest && el.closest('.pile'); if (!p || !p.dataset.pile) continue;
      const k = p.dataset.pile;
      let to = null;
      if (k[0] === 't') to = { k: 'tab', col: +k.slice(1) };
      else if (k[0] === 'f') { const c = cardOf(drag.from); to = { k: 'found', s: drag.from.k === 'tab' && drag.seqEls.length > 1 ? +k.slice(1) : Math.max(0, SUITS.indexOf(c.s)) }; }
      if (to && so.tryMove(board, drag.from, to)) return to;
    }
    return null;
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag; drag = null;
    sol.querySelectorAll('.ok').forEach((p) => p.classList.remove('ok'));
    if (d.on) {
      const to = dropTarget(e.clientX, e.clientY, d);
      if (to) { if (!move(d.from, to)) render(view); }
      else { sfx.lose(); render(view); } // вернуть на место анимацией FLIP
      return;
    }
    // тап
    const now = performance.now();
    if (lastTap.id === d.id && now - lastTap.t < 380) { lastTap = { id: -1, t: 0 }; clearSel(); smart(d.from); return; }
    lastTap = { id: d.id, t: now };
    if (sel && sel.id === d.id) { clearSel(); smart(d.from); return; }
    sel = { id: d.id }; sfx.click(); paintSel();
  }
  function onCancel() { if (drag && drag.on) { drag = null; render(view); } drag = null; }

  // тап по стопкам: ход выбранной картой / добор
  sol.addEventListener('click', (e) => {
    if (view.winner) return;
    const pile = e.target.closest('.pile'); if (!pile) { if (!e.target.closest('.card') && !e.target.closest('button')) clearSel(); return; }
    const k = pile.dataset.pile;
    if (k === 'stock') { if (!e.target.closest('.card') && !pile.classList.contains('empty')) return; const err = act({ t: 'draw' }); if (!err) sfx.flip(); clearSel(); return; }
    if (sel && (k[0] === 't' || k[0] === 'f') && !(e.target.closest('.card') && +e.target.closest('.card').dataset.i === sel.id)) {
      const from = fromOf(sel.id); if (!from) return;
      const to = k[0] === 't' ? { k: 'tab', col: +k.slice(1) } : { k: 'found', s: Math.max(0, SUITS.indexOf(cardOf(from).s)) };
      if (so.tryMove(board, from, to)) move(from, to); else { sfx.lose(); }
    }
  });

  /* ---- кнопки ---- */
  function hint() {
    const hs = so.hints(board);
    sol.querySelectorAll('.hint-pulse').forEach((e) => e.classList.remove('hint-pulse'));
    clearTimeout(hintTimer);
    if (!hs.length) { if (so.hasDraw(board)) { pop(stockEl, 0.9); stockEl.classList.add('hint-pulse'); hintTimer = setTimeout(() => stockEl.classList.remove('hint-pulse'), 1600); } else sfx.lose(); return; }
    const hn = hs[0];
    const src = hn.from.k === 'waste' ? board.waste[board.waste.length - 1].i : board.tab[hn.from.col][hn.from.idx].i;
    const els = [];
    for (const el of stage.map.values()) if (+el.dataset.i === src) els.push(el);
    els.forEach((el) => el.classList.add('hint-pulse')); pileEls[pileName(hn.to)].classList.add('hint-pulse');
    hintTimer = setTimeout(() => sol.querySelectorAll('.hint-pulse').forEach((e) => e.classList.remove('hint-pulse')), 1800);
  }
  async function runAuto() {
    if (auto) return; auto = true;
    for (let i = 0; i < 60 && view && !view.winner; i++) { const e = act({ t: 'auto' }); if (e) break; sfx.place(); await sleep(reduced() ? 40 : 110); }
    auto = false;
  }
  function renderControls() {
    ctrl.replaceChildren();
    for (const k of Object.keys(keymap)) delete keymap[k];
    if (view.winner) return;
    const solo = view.players.length === 1;
    ctrl.append(
      h('button', { class: 'btn', disabled: !board.canUndo, onclick: () => { sfx.click(); act({ t: 'undo' }); clearSel(); } }, 'Отмена', h('kbd', null, 'U')),
      h('button', { class: 'btn', onclick: hint }, 'Подсказка', h('kbd', null, 'H')),
      h('button', { class: 'btn', onclick: runAuto }, 'Автосбор', h('kbd', null, 'A')));
    if (solo) ctrl.append(btn('Заново', () => { t0 = 0; finished = false; act({ t: 'restart' }); }, 'ghost sm'), btn('Новая раздача', () => { t0 = 0; finished = false; act({ t: 'newgame' }); }, 'ghost sm'));
    keymap.u = () => { act({ t: 'undo' }); clearSel(); }; keymap.h = hint; keymap.a = runAuto; keymap.d = () => act({ t: 'draw' });
  }

  function celebrate() {
    if (reduced()) return;
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < 44; i++) {
      const c = makeCard({ r: RANKS[i % 13], s: SUITS[i % 4] });
      Object.assign(c.style, { position: 'fixed', left: Math.random() * (W - cw) + 'px', top: '-140px', zIndex: 70, pointerEvents: 'none', '--cw': cw + 'px' });
      document.body.append(c);
      anim(c, [{ transform: 'translateY(0) rotate(0deg)', opacity: 1 }, { transform: `translateY(${H + 200}px) rotate(${(Math.random() - 0.5) * 720}deg)`, opacity: 1 }], { duration: 1800 + Math.random() * 1600, delay: i * 55, easing: 'cubic-bezier(.4,.05,.7,.6)', fill: 'backwards' }).then(() => c.remove());
    }
  }

  const ro = new ResizeObserver(() => { if (view && view.board) render(view); });
  ro.observe(sol);
  const off = hotkeys(new Proxy({}, { get: (_, k) => keymap[k] }));
  const unsub = handle.onView(render);
  return { destroy() { clearInterval(tick); ro.disconnect(); off(); unsub(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel); stage.clear(); root.innerHTML = ''; } };
}

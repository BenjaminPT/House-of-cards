// UI рулетки: анимированное колесо + стол со всеми видами ставок
import * as ro from '../engines/roulette.js';
import { h, btn, fmt, fmtShort, hotkeys, avatar } from '../core/ui.js';
import { anim, countTo, floatText, pop, reduced, sleep } from '../core/anim.js';
import { sfx } from '../core/sfx.js';
import * as stats from '../core/stats.js';

const STEP = 360 / 37;
const CHIP_MUL = [1, 2, 5, 20, 100];
const polar = (r, deg) => [r * Math.sin((deg * Math.PI) / 180), -r * Math.cos((deg * Math.PI) / 180)];
const num = (c, r) => 3 * c + (3 - r);
const COLOR = { red: '#b8323a', black: '#17191e', green: '#26774a' };

function wheelSVG() {
  let sectors = '', labels = '';
  ro.WHEEL_ORDER.forEach((n, k) => {
    const a0 = (k - 0.5) * STEP, a1 = (k + 0.5) * STEP;
    const [x0, y0] = polar(132, a0), [x1, y1] = polar(132, a1), [x2, y2] = polar(100, a1), [x3, y3] = polar(100, a0);
    sectors += `<path d="M${x0} ${y0}A132 132 0 0 1 ${x1} ${y1}L${x2} ${y2}A100 100 0 0 0 ${x3} ${y3}Z" fill="${COLOR[ro.colorOf(n)]}" stroke="#c9a14a" stroke-width=".6" data-n="${n}"/>`;
    labels += `<text transform="rotate(${k * STEP}) translate(0 -112)" text-anchor="middle" dominant-baseline="central" font-size="9.5" font-weight="700" fill="#f3efe4" font-family="system-ui,sans-serif">${n}</text>`;
  });
  return `<svg viewBox="-150 -150 300 300" class="wheel-svg" aria-hidden="true">
    <circle r="148" fill="#2a2418"/><circle r="140" fill="#14110a" stroke="#c9a14a" stroke-width="1.2"/>
    <g class="wheel-rot">${sectors}${labels}
      <circle r="98" fill="#1f1a10" stroke="#c9a14a" stroke-width="1"/>
      <circle r="70" fill="url(#cone)"/>
      <g stroke="#c9a14a" stroke-width="2.4" stroke-linecap="round"><path d="M0-62V62M-62 0H62"/></g><circle r="12" fill="#c9a14a"/><circle r="5" fill="#14110a"/></g>
    <defs><radialGradient id="cone"><stop offset="0" stop-color="#3a3120"/><stop offset="1" stop-color="#17130b"/></radialGradient></defs></svg>`;
}

export function mount(root, handle, ctx) {
  const me = handle.me;
  let selChip = 0, CHIP_VALUES = CHIP_MUL.slice(), prev = null, spinning = false, wheelAngle = 0;
  const bettable = new Map(); // key → element
  const keymap = {};

  const wheel = h('div', { class: 'wheel' }, h('div', { class: 'wheel-box', html: wheelSVG() }), h('div', { class: 'orbit' }, h('i', { class: 'ball' })), h('div', { class: 'wheel-result', 'aria-live': 'polite' }));
  const history = h('div', { class: 'r-history', 'aria-label': 'Последние числа' });
  const banner = h('div', { class: 'banner' });
  const who = h('div', { class: 'r-players' });
  const tableWrap = h('div', { class: 'r-table-wrap' });
  const ctrl = h('div', { class: 'controls r-ctrl' });
  const myChips = h('span', { class: 'chips-count' }, '0');
  const myStake = h('span', { class: 'bet-pill' });

  root.append(h('div', { class: 'ro' },
    h('div', { class: 'r-left' }, wheel, history, banner),
    h('div', { class: 'r-right' }, who, tableWrap, h('div', { class: 'r-status' }, h('span', null, 'Фишки ', myChips), myStake), ctrl)));

  /* ---- стол ---- */
  const place = (nums) => { if (cur && cur.phase === 'bet') { const e = handle.act({ t: 'bet', nums, amount: Math.min(selChip, mine().chips) }); if (!e) sfx.chip(); else if (e === 'bad-bet') sfx.lose(); } };
  const mk = (cls, label, nums, extra = {}) => {
    const k = ro.spotKey(nums);
    const b = h('button', { class: 'rc ' + cls, type: 'button', 'data-k': k, 'aria-label': `${extra.aria || label}`, onclick: () => place(nums), ...(extra.attrs || {}) }, label);
    if (!bettable.has(k)) bettable.set(k, b); else bettable.set(k + '#', b);
    return b;
  };
  function buildTable() {
    const g = h('div', { class: 'r-grid' });
    const zero = mk('n green', '0', [0], { aria: 'Ноль' }); zero.style.gridRow = '1 / span 3'; zero.style.gridColumn = '1'; g.append(zero);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) {
      const n = num(c, r);
      const b = mk('n ' + ro.colorOf(n), String(n), [n], { aria: `Число ${n}` });
      b.style.gridRow = String(r + 1); b.style.gridColumn = String(c + 2); g.append(b);
    }
    for (let r = 0; r < 3; r++) {
      const nums = []; for (let n = 1; n <= 36; n++) if (n % 3 === (r === 0 ? 0 : r === 1 ? 2 : 1)) nums.push(n);
      const b = mk('o col', '2:1', nums, { aria: `Колонка ${3 - r}` }); b.style.gridRow = String(r + 1); b.style.gridColumn = '14'; g.append(b);
    }
    const dz = [[1, 12, '1-я 12'], [13, 24, '2-я 12'], [25, 36, '3-я 12']];
    dz.forEach(([a, z, t], i) => { const nums = []; for (let n = a; n <= z; n++) nums.push(n); const b = mk('o', t, nums); b.style.gridRow = '4'; b.style.gridColumn = `${2 + i * 4} / span 4`; g.append(b); });
    const all = Array.from({ length: 36 }, (_, i) => i + 1);
    const ev = [
      ['1–18', all.filter((n) => n <= 18), ''], ['Чёт', all.filter((n) => n % 2 === 0), ''], ['Красное', all.filter((n) => ro.colorOf(n) === 'red'), 'red'],
      ['Чёрное', all.filter((n) => ro.colorOf(n) === 'black'), 'black'], ['Нечет', all.filter((n) => n % 2 === 1), ''], ['19–36', all.filter((n) => n >= 19), ''],
    ];
    ev.forEach(([t, nums, col], i) => { const b = mk('o ' + col, t, nums); b.style.gridRow = '5'; b.style.gridColumn = `${2 + i * 2} / span 2`; g.append(b); });
    // «горячие точки»: сплиты, углы, стриты, шестёрки
    const hs = h('div', { class: 'hot', 'aria-hidden': 'false' });
    const hot = (x, y, nums, label) => {
      if (!ro.spotInfo(nums)) return;
      const b = h('button', { class: 'hs', type: 'button', 'aria-label': label, tabindex: -1, style: { left: x + '%', top: y + '%' }, 'data-k': ro.spotKey(nums), onclick: (e) => { e.stopPropagation(); place(nums); } });
      bettable.set(ro.spotKey(nums), b); hs.append(b);
    };
    const cw = 100 / 12, rh = 100 / 3;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) {
      if (c < 11) hot((c + 1) * cw, (r + 0.5) * rh, [num(c, r), num(c + 1, r)], `Сплит ${num(c, r)}/${num(c + 1, r)}`);
      if (r < 2) hot((c + 0.5) * cw, (r + 1) * rh, [num(c, r), num(c, r + 1)], `Сплит ${num(c, r)}/${num(c, r + 1)}`);
      if (c < 11 && r < 2) hot((c + 1) * cw, (r + 1) * rh, [num(c, r), num(c + 1, r), num(c, r + 1), num(c + 1, r + 1)], 'Угол');
    }
    for (let c = 0; c < 12; c++) hot((c + 0.5) * cw, 100, [3 * c + 1, 3 * c + 2, 3 * c + 3], `Стрит ${3 * c + 1}-${3 * c + 3}`);
    for (let c = 0; c < 11; c++) hot((c + 1) * cw, 100, Array.from({ length: 6 }, (_, i) => 3 * c + 1 + i), 'Шестёрка');
    const wrapHot = h('div', { class: 'hot-wrap' }, hs);
    const outer = h('div', { class: 'r-felt' }, g, wrapHot);
    tableWrap.replaceChildren(outer);
    // «горячие точки» лежат над сеткой чисел (колонки 2..13, строки 1..3)
    function sync() {
      const first = g.querySelector('.n:not(.green)'), last = g.querySelector('.n:last-of-type');
      const gr = g.getBoundingClientRect();
      const a = g.children[1].getBoundingClientRect();
      const lastNum = [...g.querySelectorAll('.n')].pop().getBoundingClientRect();
      Object.assign(wrapHot.style, { left: a.left - gr.left + 'px', top: a.top - gr.top + 'px', width: lastNum.right - a.left + 'px', height: lastNum.bottom - a.top + 'px' });
    }
    requestAnimationFrame(sync); new ResizeObserver(sync).observe(g);
  }
  buildTable();

  /* ---- вспомогательное ---- */
  let cur = null;
  const mine = () => cur.players.find((p) => p.id === me);

  function renderBets(v) {
    document.querySelectorAll('.r-felt .stack').forEach((e) => e.remove());
    const m = v.players.find((p) => p.id === me);
    if (!m) return;
    for (const b of m.bets) {
      const el = bettable.get(b.key); if (!el) continue;
      const s = h('span', { class: 'stack', 'aria-hidden': 'true' }, h('i'), h('em', null, fmt(b.amount)));
      el.append(s);
    }
    tableWrap.querySelectorAll('.win').forEach((e) => e.classList.remove('win'));
    if (v.phase === 'result' && v.result) {
      tableWrap.querySelectorAll('.n').forEach((e) => { if (e.textContent === String(v.result.n)) e.classList.add('win'); });
    }
  }

  async function spinTo(n) {
    spinning = true;
    const k = ro.WHEEL_ORDER.indexOf(n);
    const rot = wheel.querySelector('.wheel-rot'), orbit = wheel.querySelector('.orbit'), ball = wheel.querySelector('.ball');
    const resEl = wheel.querySelector('.wheel-result'); resEl.textContent = '';
    const S = wheel.clientWidth;
    const final = wheelAngle + 360 * 4 + ((360 - (wheelAngle % 360)) % 360) + 140;
    const ballEnd = final + k * STEP - 360 * 7;
    const drop = (S * (35 - 10)) / 300;
    if (reduced()) {
      rot.style.transform = `rotate(${final}deg)`; orbit.style.transform = `rotate(${ballEnd}deg)`; ball.style.transform = `translateY(${drop}px)`;
    } else {
      sfx.click();
      const T = 7000;
      anim(rot, [{ transform: `rotate(${wheelAngle}deg)` }, { transform: `rotate(${final}deg)` }], { duration: T, easing: 'cubic-bezier(0.12, 0.6, 0.18, 1)', fill: 'forwards' });
      anim(orbit, [{ transform: `rotate(${(wheelAngle * -1) - 20}deg)` }, { transform: `rotate(${ballEnd}deg)` }], { duration: T - 300, easing: 'cubic-bezier(0.16, 0.55, 0.25, 1)', fill: 'forwards' });
      anim(ball, [{ transform: 'translateY(0)' }, { transform: 'translateY(0)', offset: 0.7 }, { transform: `translateY(${drop * 1.1}px)`, offset: 0.86 }, { transform: `translateY(${drop * 0.94}px)`, offset: 0.93 }, { transform: `translateY(${drop}px)` }], { duration: T - 300, easing: 'ease-in', fill: 'forwards' });
      // тики при прохождении карманов
      const t0 = performance.now(); let last = 0;
      const tick = (t) => { const p = (t - t0) / T; if (p >= 1 || !spinning) return; const pace = Math.pow(1 - p, 2.2); if (t - last > 70 + (1 - pace) * 380) { sfx.tick(); last = t; } requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      await sleep(T + 40);
    }
    // зафиксировать
    rot.getAnimations && rot.getAnimations().forEach((a) => a.finish());
    rot.style.transform = `rotate(${final}deg)`; orbit.style.transform = `rotate(${ballEnd}deg)`; ball.style.transform = `translateY(${drop}px)`;
    wheelAngle = final % 360;
    rot.style.transform = `rotate(${wheelAngle}deg)`; orbit.style.transform = `rotate(${(ballEnd % 360)}deg)`;
    spinning = false;
    resEl.textContent = String(n); resEl.className = 'wheel-result ' + ro.colorOf(n); pop(resEl, 0.7);
  }

  function renderHistory(v) {
    history.replaceChildren(...(v.phase === 'spin' ? v.history.slice(1) : v.history).map((n) => h('span', { class: 'hn ' + ro.colorOf(n) }, String(n))));
  }

  function render(v) {
    const first = !prev;
    cur = v;
    const m = v.players.find((p) => p.id === me);
    countTo(myChips, m.chips, 450);
    const staked = v.staked[me] || 0;
    myStake.textContent = staked ? `В игре ${fmt(staked)}` : '';
    who.replaceChildren(...v.players.map((p) => h('div', { class: 'rp' + (p.ready ? ' ready' : '') }, avatar(p.name), h('span', null, p.id === me ? 'Вы' : p.name), h('small', null, v.phase === 'bet' ? (p.ready ? 'готов' : 'ставит…') : v.phase === 'result' ? (p.delta > 0 ? '+' + fmt(p.delta) : p.delta < 0 ? '−' + fmt(-p.delta) : '±0') : ''))));
    renderBets(v);
    renderHistory(v);
    // эффекты фаз
    if (v.phase === 'spin' && (!prev || prev.spinId !== v.spinId) && !spinning) { banner.textContent = 'Ставок больше нет'; spinTo(v.result.n); }
    else if (first && v.phase !== 'bet' && v.result) { const k = ro.WHEEL_ORDER.indexOf(v.result.n); const resEl = wheel.querySelector('.wheel-result'); resEl.textContent = v.result.n; resEl.className = 'wheel-result ' + v.result.color; }
    if (v.phase === 'bet') {
      banner.textContent = m.ready ? 'Ждём остальных…' : 'Делайте ставки';
      if (prev && prev.phase === 'result') { const r = wheel.querySelector('.wheel-result'); r.textContent = ''; r.className = 'wheel-result'; }
    } else if (v.phase === 'result') {
      const d = m.delta; banner.textContent = `Выпало ${v.result.n} · ${v.result.color === 'red' ? 'красное' : v.result.color === 'black' ? 'чёрное' : 'зеро'}` + (staked ? (d > 0 ? ` · +${fmt(d)}` : d < 0 ? ` · −${fmt(-d)}` : '') : '');
      if (prev && prev.phase !== 'result' && staked) { stats.rec('roulette', { play: 1, win: d > 0 ? 1 : 0, draw: d === 0 ? 1 : 0, points: d, net: d }, { max: { bestWin: Math.max(0, d) } }); if (d > 0) { sfx.win(); floatText(myChips, '+' + fmt(d), 'good'); } else if (d < 0) sfx.lose(); }
    }
    renderControls(v, m);
    prev = v;
  }

  function renderControls(v, m) {
    ctrl.replaceChildren();
    CHIP_VALUES = CHIP_MUL.map((x) => x * v.unit); if (!CHIP_VALUES.includes(selChip)) selChip = CHIP_VALUES[2];
    for (const k of Object.keys(keymap)) delete keymap[k];
    const chips = h('div', { class: 'chip-row', role: 'radiogroup', 'aria-label': 'Номинал фишки' }, CHIP_VALUES.map((c, ci) => h('button', { class: 'chip k' + ci + (selChip === c ? ' sel' : ''), type: 'button', role: 'radio', 'aria-checked': String(selChip === c), 'aria-label': 'Фишка ' + c, onclick: () => { selChip = c; sfx.click(); renderControls(v, m); } }, fmtShort(c))));
    if (v.phase !== 'bet') { ctrl.append(h('span', { class: 'hint' }, v.phase === 'spin' ? 'Колесо вращается…' : 'Новый раунд через мгновение')); return; }
    if (m.chips <= 0 && !m.bets.length) { ctrl.append(btn(`Докупить · ${fmt(m.start)}`, () => handle.act({ t: 'rebuy' }), 'primary')); return; }
    if (m.ready) { ctrl.append(btn('Изменить ставки', () => handle.act({ t: 'unready' }), 'ghost')); return; }
    ctrl.append(chips,
      h('div', { class: 'row' },
        btn('Отмена', () => { sfx.click(); handle.act({ t: 'undo' }); }, 'ghost sm', { disabled: !m.stack.length }),
        btn('Очистить', () => handle.act({ t: 'clear' }), 'ghost sm', { disabled: !m.bets.length }),
        btn('Повторить', () => { sfx.chip(); handle.act({ t: 'repeat' }); }, 'ghost sm', { disabled: !!m.bets.length || !m.last.length }),
        btn(m.bets.length ? 'Крутить' : 'Пропустить', () => handle.act({ t: 'ready' }), 'primary')));
    keymap.enter = () => handle.act({ t: 'ready' }); keymap.z = () => handle.act({ t: 'undo' });
    ['1', '2', '3', '4', '5'].forEach((k, i) => { keymap[k] = () => { selChip = CHIP_VALUES[i]; renderControls(v, m); }; });
  }

  const off = hotkeys(new Proxy({}, { get: (_, k) => keymap[k] }));
  const unsub = handle.onView(render);
  return { destroy() { spinning = false; off(); unsub(); root.innerHTML = ''; } };
}

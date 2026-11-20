// UI «Последний патрон»: события движка проигрываются по очереди (выстрелы, предметы, перезарядка).
import * as sh from '../engines/shell.js';
import { h, btn, hotkeys } from '../core/ui.js';
import { anim, floatText, shake, reduced, sleep } from '../core/anim.js';
import { sfx } from '../core/sfx.js';
import * as stats from '../core/stats.js';

const ICON = {
  magnifier: '<circle cx="14" cy="14" r="8"/><path d="M20 20l9 9"/>',
  beer: '<path d="M9 8h14l-1.5 20h-11z"/><path d="M9 14h14"/><path d="M12 5h8"/>',
  cigarettes: '<rect x="4" y="19" width="19" height="5" rx="1"/><path d="M23 19v5M27 19v5"/><path d="M13 14c0-3 3-3 3-6"/>',
  saw: '<path d="M3 22l20-14 6 9-20 11z"/><path d="M8 23l2 3M12 21l2 3M16 19l2 3M20 16l2 3"/>',
  cuffs: '<circle cx="9" cy="20" r="6"/><circle cx="23" cy="20" r="6"/><path d="M13 15c2-5 4-5 6 0"/>',
  phone: '<rect x="9" y="3" width="14" height="26" rx="3"/><path d="M14 25h4"/>',
  inverter: '<path d="M6 12h18l-5-5M26 20H8l5 5"/>',
  adrenaline: '<path d="M6 26l9-9"/><path d="M13 14l5 5 8-8-5-5z"/><path d="M26 6l-2 2"/>',
  medicine: '<rect x="6" y="12" width="20" height="9" rx="4.5"/><path d="M16 12v9"/>',
};
const icon = (id) => `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[id] || ''}</svg>`;
const shellEl = (t, cls = '') => h('span', { class: `shell ${t} ${cls}`, role: 'img', 'aria-label': t === 'live' ? 'боевой' : 'холостой' });
const typeName = (t) => (t === 'live' ? 'боевой' : 'холостой');
const name = (id) => sh.ITEMS[id].name;

const FIGURE = `<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M60 8c-22 0-34 18-34 40v26c0 12-14 18-14 34h96c0-16-14-22-14-34V48C94 26 82 8 60 8z" fill="currentColor" opacity=".35"/><path d="M40 56c0-14 9-24 20-24s20 10 20 24v14c0 6-9 12-20 12S40 76 40 70z" fill="#0b0908"/><circle class="sh-eye" cx="60" cy="56" r="3.6" fill="var(--accent)"/><path d="M32 98l28 10 28-10" fill="none" stroke="var(--bad)" stroke-width="3"/></svg>`;
const GUN = `<svg viewBox="0 0 120 420" aria-hidden="true"><rect x="52" y="6" width="16" height="250" rx="4" fill="#2b2e33" stroke="#4d525a" stroke-width="2"/><rect x="56" y="6" width="8" height="250" fill="#3c4046"/><rect x="46" y="180" width="28" height="70" rx="6" fill="#4a3322" stroke="#2c1e14" stroke-width="2"/><rect x="40" y="250" width="40" height="110" rx="10" fill="#5b3d28" stroke="#2c1e14" stroke-width="2"/><rect x="44" y="360" width="32" height="40" rx="8" fill="#3a2819"/></svg>`;

export function mount(root, handle, ctx) {
  let cur = null, lastSeq = 0, dead = false, playing = false, selecting = null, recorded = false, card = null;
  const queue = [];
  const disp = { round: 0, maxHp: 0, hp: { p: 0, d: 0 }, items: { p: [], d: [] }, left: 0, announced: { live: 0, blank: 0 }, spent: [], known: [], sawed: false, cuffed: { p: false, d: false } };
  const wait = (ms) => sleep(reduced() ? Math.min(ms, 120) : ms);
  const who = (w) => (w === 'p' ? 'Вы' : 'Крупье');

  const dHp = h('div', { class: 'sh-hp', role: 'img' });
  const pHp = h('div', { class: 'sh-hp', role: 'img' });
  const dItems = h('div', { class: 'sh-items', role: 'group', 'aria-label': 'Предметы крупье' });
  const pItems = h('div', { class: 'sh-items', role: 'group', 'aria-label': 'Ваши предметы' });
  const gun = h('div', { class: 'sh-gun', 'data-aim': 'idle', html: GUN });
  const peek = h('div', { class: 'sh-peek', 'aria-hidden': 'true' });
  const msgEl = h('div', { class: 'sh-msg', role: 'status', 'aria-live': 'polite' });
  const flashEl = h('div', { class: 'sh-flash', 'aria-hidden': 'true' });
  const roundEl = h('span', { class: 'sh-round' });
  const leftEl = h('span', { class: 'sh-left' });
  const loadEl = h('span', { class: 'sh-pills' });
  const spentEl = h('div', { class: 'sh-spent', 'aria-label': 'Выпавшие патроны' });
  const knownEl = h('div', { class: 'sh-known', 'aria-live': 'polite' });
  const badgesEl = h('div', { class: 'sh-badges' });
  const turnEl = h('div', { class: 'banner' });
  const btnD = btn(['Выстрелить в крупье', h('kbd', null, '1')], () => shoot('d'), 'primary');
  const btnP = btn(['Выстрелить в себя', h('kbd', null, '2')], () => shoot('p'), '');

  const el = h('div', { class: 'sh' },
    h('div', { class: 'sh-side' },
      h('div', { class: 'sh-who' }, h('div', { class: 'sh-fig', html: FIGURE }), h('div', null, h('div', { class: 'sh-name' }, 'Крупье'), dHp)),
      dItems),
    h('div', { class: 'sh-mid' },
      h('div', { class: 'sh-hud' }, roundEl, leftEl, loadEl, spentEl),
      h('div', { class: 'sh-stage' }, gun, peek, msgEl),
      h('div', { class: 'sh-hud' }, knownEl, badgesEl)),
    turnEl,
    h('div', { class: 'sh-side me' },
      h('div', { class: 'sh-who' }, h('div', null, h('div', { class: 'sh-name' }, 'Вы'), pHp)),
      pItems),
    h('div', { class: 'sh-ctrl' }, btnD, btnP),
    flashEl);
  root.append(el);

  // ---------- отрисовка ----------
  const canAct = () => !!cur && !playing && queue.length === 0 && cur.phase === 'play' && cur.turn === 'p';

  function renderHp(popWho) {
    for (const [w, box] of [['d', dHp], ['p', pHp]]) {
      box.setAttribute('aria-label', `${who(w)}: зарядов ${disp.hp[w]} из ${disp.maxHp}`);
      box.replaceChildren(...Array.from({ length: disp.maxHp }, (_, i) => h('span', { class: 'sh-pip' + (i >= disp.hp[w] ? ' off' : '') + (popWho === w && i === disp.hp[w] ? ' pop' : '') })));
    }
  }
  function renderHud() {
    roundEl.textContent = disp.round ? `Раунд ${disp.round} из 3` : '';
    leftEl.replaceChildren('В стволе ', h('b', { class: 'num' }, String(disp.left)));
    loadEl.replaceChildren(h('span', { class: 'pl live' }, h('i'), `${disp.announced.live} боевых`), h('span', { class: 'pl blank' }, h('i'), `${disp.announced.blank} холостых`));
    spentEl.replaceChildren(...disp.spent.map((t) => shellEl(t, 'sm')));
    knownEl.replaceChildren(...disp.known.map((t, i) => (t ? h('span', { class: 'kn' }, i === 0 ? 'Ствол' : `№${i + 1}`, shellEl(t, 'sm')) : null)).filter(Boolean));
    badgesEl.replaceChildren(...[
      disp.sawed ? h('span', { class: 'sh-badge warn' }, 'Обрез · урон ×2') : null,
      disp.cuffed.d ? h('span', { class: 'sh-badge' }, 'Крупье в наручниках') : null,
      disp.cuffed.p ? h('span', { class: 'sh-badge warn' }, 'Вы в наручниках') : null,
    ].filter(Boolean));
  }
  function renderItems() {
    const idle = canAct();
    pItems.replaceChildren(...disp.items.p.map((id, i) => {
      const ok = idle && selecting === null && cur.usable[i];
      return h('button', { class: 'sh-item', type: 'button', disabled: !ok, 'data-id': id, title: `${name(id)}: ${sh.ITEMS[id].desc}`, 'aria-label': `${name(id)}. ${sh.ITEMS[id].desc}`, onclick: () => onItem(i) },
        h('span', { class: 'ic', html: icon(id) }), h('span', { class: 'nm' }, name(id)));
    }));
    dItems.replaceChildren(...disp.items.d.map((id, i) => {
      const steal = selecting !== null && cur && cur.stealable.includes(i);
      return steal
        ? h('button', { class: 'sh-item steal', type: 'button', title: `Украсть: ${name(id)}`, 'aria-label': `Украсть: ${name(id)}`, onclick: () => stealAt(i) }, h('span', { class: 'ic', html: icon(id) }), h('span', { class: 'nm' }, name(id)))
        : h('div', { class: 'sh-item', title: `${name(id)}: ${sh.ITEMS[id].desc}`, role: 'img', 'aria-label': name(id) }, h('span', { class: 'ic', html: icon(id) }), h('span', { class: 'nm' }, name(id)));
    }));
  }
  function renderControls() {
    const ok = canAct() && selecting === null;
    btnD.disabled = !ok; btnP.disabled = !ok;
    if (!cur || cur.phase === 'over') turnEl.textContent = '';
    else if (playing || queue.length) turnEl.textContent = '';
    else if (selecting !== null) turnEl.textContent = 'Выберите предмет крупье · Esc — отмена';
    else if (cur.phase === 'roundEnd') turnEl.textContent = '';
    else turnEl.textContent = cur.turn === 'p' ? 'Ваш ход' : 'Ход крупье';
  }
  const renderAll = () => { renderHp(); renderHud(); renderItems(); renderControls(); };

  function syncFromView() {
    Object.assign(disp, { round: cur.round, maxHp: cur.maxHp, hp: { ...cur.hp }, items: { p: cur.items.p.slice(), d: cur.items.d.slice() }, left: cur.left, announced: { ...cur.announced }, spent: cur.spent.slice(), known: cur.known.slice(), sawed: cur.sawed, cuffed: { ...cur.cuffed } });
    renderAll();
  }

  // ---------- сообщения и эффекты ----------
  async function say(text, cls = '', ms = 1000) {
    msgEl.textContent = text; msgEl.className = 'sh-msg show ' + cls;
    await wait(ms);
    msgEl.className = 'sh-msg';
  }
  async function peekShell(type, label) {
    peek.replaceChildren(shellEl(type, 'big'), h('small', null, label));
    peek.style.opacity = 1;
    await anim(peek, [{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.15 }, { transform: 'scale(1)', opacity: 1, offset: 0.8 }, { transform: 'scale(1.05)', opacity: 0 }], { duration: reduced() ? 400 : 1700 });
    peek.style.opacity = 0;
  }
  const flash = () => anim(flashEl, [{ opacity: 0.8 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
  const recoil = () => anim(gun.firstChild, [{ transform: 'translateY(0)' }, { transform: 'translateY(12px)', offset: 0.3 }, { transform: 'translateY(0)' }], { duration: 260 });
  const aim = (a) => { gun.dataset.aim = a; };

  async function showCard(build, dismissMs) {
    closeCard();
    const box = h('div', { class: 'box' }, build);
    card = h('div', { class: 'overlay sh-overlay', role: 'dialog', 'aria-label': 'Информация' }, box);
    el.append(card);
    const mine = card;
    if (dismissMs) {
      await new Promise((res) => { const t = setTimeout(res, reduced() ? 400 : dismissMs); mine.addEventListener('pointerdown', () => { clearTimeout(t); res(); }); });
      if (card === mine) closeCard();
    }
  }
  function closeCard() { if (card) { card.remove(); card = null; } }

  // ---------- проигрывание событий ----------
  async function play(ev) {
    switch (ev.k) {
      case 'round':
        Object.assign(disp, { round: ev.round, maxHp: ev.maxHp, hp: { p: ev.maxHp, d: ev.maxHp }, items: { p: [], d: [] }, spent: [], known: [], sawed: false, cuffed: { p: false, d: false } });
        closeCard(); selecting = null; renderAll(); break;
      case 'load': {
        disp.announced = { live: ev.live, blank: ev.blank }; disp.left = ev.live + ev.blank; disp.spent = [];
        disp.known = Array(disp.left).fill(null); disp.sawed = false; disp.cuffed = { p: false, d: false };
        disp.items.p.push(...ev.given.p); disp.items.d.push(...ev.given.d);
        renderAll();
        for (const [w, box, n] of [['p', pItems, ev.given.p.length], ['d', dItems, ev.given.d.length]]) {
          [...box.children].slice(box.children.length - n).forEach((c) => c.classList.add('enter'));
        }
        sfx.rack();
        const total = ev.given.p.length + ev.given.d.length;
        await showCard([
          h('h2', null, ev.round ? `Раунд ${ev.round}` : 'Перезарядка'),
          h('div', { class: 'sh-shells' }, ...Array.from({ length: ev.live }, () => shellEl('live', 'big')), ...Array.from({ length: ev.blank }, () => shellEl('blank', 'big'))),
          h('p', null, `${ev.live} боевых · ${ev.blank} холостых`),
          h('p', { class: 'muted' }, total ? `Выдано предметов: вам ${ev.given.p.length}, крупье ${ev.given.d.length}. Порядок патронов скрыт.` : 'Порядок патронов скрыт. Считайте выстрелы.'),
        ], 3200);
        break;
      }
      case 'shot': {
        const toMe = ev.target === 'p';
        aim(toMe ? 'down' : 'up'); await wait(520);
        if (ev.sawed) await say('Обрез!', 'live', 450);
        if (ev.shell === 'live') {
          sfx.shot(); flash(); shake(el);
          disp.hp = { ...ev.hp }; renderHp(ev.target);
          floatText(toMe ? pHp : dHp, `−${ev.dmg}`, 'bad');
          if (toMe) sfx.hurt();
        } else sfx.dry();
        disp.spent.push(ev.shell); disp.left = ev.left; disp.known.shift(); disp.sawed = false; renderHud();
        recoil();
        await say(ev.shell === 'live' ? `Боевой · −${ev.dmg}` : 'Холостой', ev.shell, 1000);
        aim('idle');
        break;
      }
      case 'extra': await say(ev.who === 'p' ? 'Холостой в себя: ход остаётся у вас' : 'Крупье ходит снова', '', 900); break;
      case 'skip':
        disp.cuffed[ev.who] = false; renderHud();
        await say(ev.who === 'p' ? 'Вы пропускаете ход' : 'Крупье пропускает ход', '', 1000); break;
      case 'item': await playItem(ev); break;
      case 'roundEnd': sfx.win(); await say('Крупье повержен', 'good', 1100); break;
      case 'over': await say(ev.result === 'win' ? 'Вы выжили' : 'Вы погибли', ev.result === 'win' ? 'good' : 'live', 1200); break;
      default: break;
    }
  }

  async function playItem(ev) {
    const w = ev.who, op = w === 'p' ? 'd' : 'p', used = ev.stolen || ev.item;
    sfx.click();
    const box = (x) => (x === 'p' ? pItems : dItems);
    const t1 = box(w).children[ev.idx]; if (t1) t1.classList.add('used');
    if (ev.item === 'adrenaline') { const t2 = box(op).children[ev.stealIdx]; if (t2) t2.classList.add('used'); }
    await wait(460);
    disp.items[w].splice(ev.idx, 1);
    if (ev.item === 'adrenaline') disp.items[op].splice(ev.stealIdx, 1);
    renderItems();
    await say(ev.item === 'adrenaline' ? `${who(w)} крадёт: ${name(ev.stolen)}` : `${who(w)}: ${name(ev.item)}`, '', 900);
    switch (used) {
      case 'magnifier':
        if (w === 'p') { disp.known[0] = ev.shell; renderHud(); await peekShell(ev.shell, 'В стволе'); }
        else await say('Крупье смотрит в ствол', '', 800);
        break;
      case 'phone':
        if (w === 'p') { disp.known[ev.pos - 1] = ev.shell; renderHud(); await peekShell(ev.shell, `Патрон №${ev.pos}`); }
        else await say('Крупье звонит по телефону', '', 800);
        break;
      case 'beer':
        sfx.rack(); disp.spent.push(ev.ejected); disp.left = ev.left; disp.known.shift(); renderHud();
        await say(`Выброшен: ${typeName(ev.ejected)}`, ev.ejected, 1000); break;
      case 'cigarettes':
        sfx.heal(); disp.hp = { ...ev.hp }; renderHp(); await say(ev.gained ? '+1 заряд' : 'Заряды полные', '', 800); break;
      case 'saw': disp.sawed = true; renderHud(); await say('Дробовик обрезан: урон ×2', 'live', 900); break;
      case 'cuffs': disp.cuffed[op] = true; renderHud(); await say(op === 'd' ? 'Крупье в наручниках' : 'Вы в наручниках', '', 900); break;
      case 'inverter':
        if (disp.known[0]) disp.known[0] = disp.known[0] === 'live' ? 'blank' : 'live';
        renderHud(); await say('Патрон инвертирован', '', 900); break;
      case 'medicine':
        disp.hp = { ...ev.hp };
        if (ev.success) { sfx.heal(); renderHp(); await say(`Сработало: +${ev.delta}`, 'good', 900); }
        else { sfx.hurt(); renderHp(w); await say('Просрочено: −1 заряд', 'live', 900); }
        break;
      default: break;
    }
  }

  async function pump() {
    if (playing) return;
    playing = true; renderControls(); renderItems();
    while (queue.length && !dead) {
      const ev = queue.shift();
      try { await play(ev); } catch (e) { console.error(e); }
    }
    playing = false;
    if (!dead) settle();
  }

  function settle() {
    if (!cur || dead) return;
    syncFromView();
    if (cur.phase === 'roundEnd' && !card) {
      showCard([h('h2', null, `Раунд ${cur.round} пройден`), h('p', null, `Очки: ${cur.score}. Дальше больше зарядов и предметов.`), h('div', { class: 'row' }, btn('Следующий раунд', () => { closeCard(); handle.act({ t: 'next' }); }, 'primary'))]);
      const b = card.querySelector('button'); b && b.focus({ preventScroll: true });
    }
    if (cur.phase === 'over' && !recorded) {
      recorded = true;
      const win = cur.over === 'win';
      stats.rec('shell', { play: 1, win: win ? 1 : 0, points: cur.score }, { add: { rounds: cur.roundsWon } });
      if (win) sfx.win(); else sfx.lose();
      ctx.finish({ title: win ? 'Вы выжили' : 'Вы проиграли', sub: win ? `Все три раунда позади · ${cur.score} очков` : `Крупье оказался удачливее · ${cur.score} очков` });
    }
  }

  // ---------- действия игрока ----------
  function shoot(target) { if (!canAct() || selecting !== null) return; sfx.unlock(); handle.act({ t: 'shoot', target }); }
  function onItem(i) {
    if (!canAct() || selecting !== null || !cur.usable[i]) return;
    sfx.unlock();
    if (disp.items.p[i] === 'adrenaline') { selecting = i; renderItems(); renderControls(); return; }
    handle.act({ t: 'item', idx: i });
  }
  function stealAt(j) { if (selecting === null) return; const idx = selecting; selecting = null; handle.act({ t: 'item', idx, stealIdx: j }); }
  function cancel() { if (selecting === null) return; selecting = null; renderItems(); renderControls(); }

  const off = hotkeys({ 1: () => shoot('d'), 2: () => shoot('p'), escape: cancel });
  const unsub = handle.onView((v) => {
    cur = v;
    const fresh = v.events.filter((e) => e.n > lastSeq);
    if (fresh.length) { lastSeq = fresh[fresh.length - 1].n; queue.push(...fresh); pump(); } else if (!playing) settle();
  });
  return { destroy() { dead = true; queue.length = 0; off(); unsub(); root.innerHTML = ''; } };
}

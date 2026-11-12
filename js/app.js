// House of Cards — оболочка: лаунчер, настройки, рубашки, онлайн-лобби, игровой экран.
import * as store from './core/store.js';
import { h, btn, sheet, toast, fmt } from './core/ui.js';
import { applyBackVar, backURL, backSVG, makeCard, flipCard, PRESETS, BACK_DESIGNS, BACK_LABELS, EMBLEMS, FRAMES, fileToDataURL } from './core/cards.js';
import { sfx } from './core/sfx.js';
import { anim, EASE, spring } from './core/anim.js';
import { HostSession, LocalHandle } from './core/session.js';
import { Room, Guest, normCode } from './core/net.js';
import * as poker from './engines/poker.js';
import * as blackjack from './engines/blackjack.js';
import * as solitaire from './engines/solitaire.js';
import * as sequence from './engines/sequence.js';
import * as roulette from './engines/roulette.js';

const REPO = 'https://github.com/BenjaminPT/House-of-cards';
const BOT_NAMES = ['Аврора', 'Макс', 'Ирис', 'Лео', 'Нова', 'Тео'];
const svg = (inner, vb = '0 0 120 80') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${inner}</svg>`;

const GAMES = {
  poker: {
    mod: poker, ui: () => import('./games/poker.js'), bots: [1, 5, 3], botLabel: 'Соперников',
    art: svg('<rect x="14" y="14" width="40" height="56" rx="5" transform="rotate(-12 34 42)"/><rect x="40" y="10" width="40" height="56" rx="5" transform="rotate(8 60 38)"/><circle cx="98" cy="56" r="14"/><circle cx="98" cy="56" r="8" stroke-dasharray="3 3"/>'),
    rules: ['Техасский холдем: у каждого две карты, пять общих на столе.', 'Блайнды растут каждые 6 раздач — турнир идёт до последнего со фишками.', 'Доступны фолд, чек, колл, рейз, олл-ин и сайд-поты. Выигрывает лучшая комбинация из пяти карт.'],
  },
  blackjack: {
    mod: blackjack, ui: () => import('./games/blackjack.js'), bots: [0, 4, 2], botLabel: 'Игроков за столом, кроме вас',
    art: svg('<rect x="22" y="12" width="40" height="56" rx="5" transform="rotate(-8 42 40)"/><rect x="52" y="12" width="40" height="56" rx="5" transform="rotate(7 72 40)"/><path d="M34 30l6-8 6 8M37 28h6" opacity=".6"/>'),
    rules: ['Наберите больше дилера, но не больше 21. Туз — 1 или 11, картинки — 10.', 'Блэкджек платит 3:2. Дилер добирает до 17.', 'Можно удвоить ставку и разделить пару (до 4 рук). Бот-соседи играют по базовой стратегии.'],
  },
  solitaire: {
    mod: solitaire, ui: () => import('./games/solitaire.js'), bots: [0, 0, 0], draw: true, solo: true,
    art: svg('<rect x="10" y="12" width="20" height="28" rx="3"/><rect x="36" y="12" width="20" height="28" rx="3"/><rect x="36" y="24" width="20" height="28" rx="3"/><rect x="62" y="12" width="20" height="28" rx="3"/><rect x="62" y="24" width="20" height="28" rx="3"/><rect x="62" y="36" width="20" height="28" rx="3"/><rect x="88" y="12" width="20" height="28" rx="3" stroke-dasharray="3 3"/>'),
    rules: ['Косынка: соберите четыре стопки от туза до короля по мастям.', 'В столбцах карты кладутся по убыванию, масти чередуются. Перетаскивайте или нажимайте дважды.', 'Есть отмена хода, подсказка и автосбор. Онлайн — дуэль на одной раздаче: кто быстрее соберёт всё.'],
  },
  sequence: {
    mod: sequence, ui: () => import('./games/sequence.js'), bots: [1, 3, 1], botLabel: 'Соперников',
    art: svg('<g stroke-width="1.4"><rect x="12" y="8" width="96" height="64" rx="6" opacity=".4"/></g><circle cx="26" cy="58" r="5" fill="currentColor"/><circle cx="46" cy="46" r="5" fill="currentColor"/><circle cx="66" cy="34" r="5" fill="currentColor"/><circle cx="86" cy="22" r="5" fill="currentColor"/><circle cx="96" cy="58" r="5" opacity=".5"/><circle cx="36" cy="20" r="5" opacity=".5"/>'),
    rules: ['Сыграйте карту из руки и поставьте фишку на её клетку поля.', 'Цель — линия из пяти фишек (угловые клетки — общие). Вдвоём и втроём нужна 1 линия, командой 2×2 — две.', 'Двуглазый валет (♦ ♣) — фишка в любую свободную клетку. Одноглазый (♠ ♥) снимает фишку соперника. Мёртвую карту можно заменить.'],
  },
  roulette: {
    mod: roulette, ui: () => import('./games/roulette.js'), bots: [0, 5, 2], botLabel: 'Игроков за столом, кроме вас',
    art: svg('<circle cx="60" cy="40" r="30"/><circle cx="60" cy="40" r="19"/><circle cx="60" cy="40" r="4" fill="currentColor"/><path d="M60 10v9M60 61v9M30 40h9M81 40h9M39 19l6 6M75 55l6 6M81 19l-6 6M45 55l-6 6" opacity=".6"/><circle cx="84" cy="22" r="3" fill="currentColor"/>'),
    rules: ['Европейская рулетка с одним зеро. Ставки на число, сплит, угол, стрит, дюжину, колонку, цвет, чёт/нечет.', 'Тапните по полю, чтобы поставить выбранную фишку. Ставки можно отменять и повторять.', 'Раунд начинается, когда все нажали «Крутить».'],
  },
};
export const modOf = (id) => GAMES[id].mod;
const ORDER = ['poker', 'blackjack', 'solitaire', 'sequence', 'roulette'];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/* ---------- применение настроек ---------- */
function applySettings() {
  const s = store.get();
  const root = document.documentElement;
  if (s.theme && s.theme !== 'auto') root.dataset.theme = s.theme; else delete root.dataset.theme;
  root.dataset.table = s.table; root.dataset.four = s.fourColor ? '1' : '0';
  applyBackVar();
  const tc = document.querySelector('meta[name=theme-color]');
  if (tc) tc.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#0d0f12';
}
store.subscribe(applyBackVar);
applySettings();

const isDesktop = !!window.hocDesktop;
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; renderTop(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; renderTop(); toast('Установлено'); });
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;

/* ---------- каркас главной ---------- */
const app = document.getElementById('app');
const topbar = h('header', { class: 'topbar' });
const main = h('main', { class: 'home', id: 'main' });
app.append(topbar, main);

const ICON = {
  online: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="11" height="15" rx="2" transform="rotate(-8 9 12)"/><rect x="9" y="4" width="11" height="15" rx="2" transform="rotate(8 14 11)"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  logo: '<svg viewBox="0 0 32 32"><rect x="3" y="6" width="14" height="20" rx="2.5" transform="rotate(-10 10 16)" fill="#1d2f4a" stroke="#d8b36a" stroke-width="1.5"/><rect x="14" y="5" width="14" height="20" rx="2.5" transform="rotate(8 21 15)" fill="#f6f3ec"/><path d="M21 11.5c-1.6-2.2-4.2-.6-3 1.4l3 3.1 3-3.1c1.2-2-1.4-3.6-3-1.4z" fill="#d64545" transform="translate(0 2)"/></svg>',
};
const iconBtn = (name, label, fn) => h('button', { class: 'icon-btn', 'aria-label': label, title: label, html: ICON[name], onclick: fn });

function renderTop() {
  topbar.replaceChildren(...[
    h('div', { class: 'brand', html: ICON.logo + '<span>House of Cards</span>' }),
    (deferredInstall && !standalone() && !isDesktop) ? btn('Установить', async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; renderTop(); }, 'sm ghost') : null,
    iconBtn('online', 'Играть онлайн', () => openOnline()),
    iconBtn('cards', 'Рубашки карт', () => openBacks()),
    iconBtn('gear', 'Настройки', () => openSettings()),
  ].filter(Boolean));
}

function renderHome() {
  const s = store.get();
  const fan = h('div', { class: 'fan', 'aria-hidden': 'true' }, [0, 1, 2].map(() => makeCard({ h: 1 })));
  fan.querySelectorAll('.card').forEach((c, i) => { c.style.zIndex = i; });
  main.replaceChildren(
    h('section', { class: 'hero' },
      h('div', null,
        h('h1', null, 'House of ', h('em', null, 'Cards')),
        h('p', null, 'Пять карточных игр за одним столом. Играйте с ботами или зовите друзей по коду комнаты — без регистрации.'),
        h('div', { class: 'hero-actions' }, btn('Играть онлайн', () => openOnline(), 'primary'), btn('Моя рубашка', () => openBacks(), ''))),
      fan),
    h('div', { class: 'grid', role: 'list' },
      ORDER.map((id) => {
        const g = GAMES[id]; const m = g.mod.meta;
        return h('button', { class: 'tile', role: 'listitem', onclick: () => { sfx.unlock(); sfx.click(); openSetup(id); } },
          h('div', { class: 'art', html: g.art }),
          h('div', null, h('h3', null, m.name), h('p', null, m.desc),
            h('div', { class: 'meta' }, h('span', { class: 'pill' }, m.min === m.max ? `${m.min} игрок` : `${m.min}–${m.max} игроков`), h('span', { class: 'pill' }, 'офлайн + онлайн'))));
      })),
    h('footer', { class: 'foot' }, 'Версия 1.0 · ', h('a', { href: REPO, target: '_blank', rel: 'noopener' }, 'исходный код на GitHub'), ' · фишки виртуальные, играем ради удовольствия'),
  );
}
renderTop(); renderHome();

/* ---------- подтверждение ---------- */
function confirmSheet(title, text, okLabel = 'Да', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (done) return; done = true; sh.close(); resolve(v); };
    const sh = sheet({ title, onClose: () => fin(false), content: h('div', null, h('p', { class: 'rules' }, text), h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '16px' } }, btn('Отмена', () => fin(false), 'ghost'), btn(okLabel, () => fin(true), danger ? 'danger' : 'primary'))) });
  });
}

/* ---------- настройка партии ---------- */
function openSetup(id) {
  const g = GAMES[id], m = g.mod.meta;
  const cfg = { bots: g.bots[2], draw: 1 };
  const seg = (labels, get, set) => {
    const wrap = h('div', { class: 'seg', role: 'group' });
    const upd = () => [...wrap.children].forEach((b, i) => b.setAttribute('aria-pressed', String(labels[i][0] === get())));
    labels.forEach(([v, t]) => wrap.append(h('button', { type: 'button', onclick: () => { set(v); upd(); sfx.click(); } }, t)));
    upd(); return wrap;
  };
  const body = h('div', null,
    h('p', { class: 'muted', style: { margin: '0 0 14px' } }, m.desc),
    g.solo ? null : h('div', { class: 'field' }, h('span', { class: 'lbl' }, g.botLabel), seg(range(g.bots[0], g.bots[1]).map((n) => [n, String(n)]), () => cfg.bots, (v) => { cfg.bots = v; })),
    g.draw ? h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Раздача из колоды'), seg([[1, 'По 1 карте'], [3, 'По 3 карты']], () => cfg.draw, (v) => { cfg.draw = v; })) : null,
    id === 'sequence' ? h('p', { class: 'note' }, 'При 4 игроках играют две команды (1+3 и 2+4).') : null,
    h('details', { class: 'rules' }, h('summary', null, 'Правила'), h('ul', null, g.rules.map((r) => h('li', null, r)))),
    h('div', { class: 'row', style: { marginTop: '18px' } },
      btn(g.solo ? 'Играть' : 'Играть с ботами', () => { sh.close(); startLocal(id, cfg); }, 'primary'),
      btn('Онлайн-комната', () => { sh.close(); openOnline(id, cfg); }, '')));
  const sh = sheet({ title: m.name, content: body });
}

/* ---------- запуск локальной партии ---------- */
let current = null; // { id, handle, ui, el, mode, cfg, room }

function startLocal(id, cfg) {
  const g = GAMES[id], s = store.get();
  const me = s.id;
  const players = [{ id: me, name: s.name, bot: false, back: s.back }];
  const nb = g.solo ? 0 : Math.max(g.bots[0], cfg.bots);
  const mm = g.mod.meta;
  const total = Math.min(mm.max, Math.max(mm.min, 1 + nb));
  for (let i = 0; players.length < total; i++) players.push({ id: 'bot' + i, name: BOT_NAMES[i % BOT_NAMES.length], bot: true });
  const host = new HostSession({ mod: g.mod, players, opts: { draw: cfg.draw, seed: cfg.seed }, online: false, myId: me });
  const handle = new LocalHandle(host, me, false);
  openPlay({ id, handle, mode: 'local', cfg, host });
  host.start();
}

/* ---------- игровой экран ---------- */
async function openPlay({ id, handle, mode, cfg, host, room, guest }) {
  if (current) await closePlay(true);
  const g = GAMES[id];
  const area = h('div', { class: 'table-area' });
  const timer = h('span', { class: 'timer', 'aria-label': 'Время на ход' });
  const snd = h('button', { class: 'icon-btn', 'aria-label': 'Звук', title: 'Звук' });
  const setSnd = () => { snd.innerHTML = store.get().sound ? ICON.sound : ICON.mute; snd.setAttribute('aria-pressed', String(store.get().sound)); };
  snd.onclick = () => { store.set({ sound: !store.get().sound }); setSnd(); sfx.click(); };
  setSnd();
  const el = h('div', { class: 'play', 'data-game': id },
    h('div', { class: 'play-top' },
      h('button', { class: 'icon-btn', 'aria-label': 'Выйти в меню', html: ICON.back, onclick: () => requestExit() }),
      h('h2', null, g.mod.meta.name),
      handle.online ? h('span', { class: 'net' }, h('i'), 'онлайн') : null,
      timer,
      h('button', { class: 'icon-btn', 'aria-label': 'Рубашка карт', html: ICON.cards, onclick: () => openBacks() }), snd),
    area);
  document.body.append(el);
  main.setAttribute('aria-hidden', 'true');
  history.pushState({ play: 1 }, '', '#/play');
  const ctx = {
    me: handle.me, online: !!handle.online, mode,
    finish: (info) => showFinish(info),
    exit: () => requestExit(true),
  };
  const mod = await g.ui();
  const ui = mod.mount(area, handle, ctx);
  current = { id, handle, ui, el, mode, cfg, host, room, guest, timer, deadlineOff: null, overlay: null };
  const tick = setInterval(() => {
    const d = handle.view && handle.view._deadline;
    timer.textContent = d ? String(Math.max(0, Math.ceil((d - Date.now()) / 1000))) : '';
  }, 250);
  current.tick = tick;
}

async function closePlay(silent = false) {
  const c = current; if (!c) return;
  current = null;
  clearInterval(c.tick);
  try { c.ui.destroy(); } catch (e) { console.error(e); }
  c.el.remove();
  main.removeAttribute('aria-hidden');
  if (c.mode === 'local') c.handle.leave();
  else if (c.mode === 'host') { if (!silent && c.room) { c.room.endGame(); } }
  else if (c.mode === 'guest') { if (!silent) { c.guest.leave(); net.guest = null; } }
}

let exiting = false;
async function requestExit(force = false) {
  if (exiting || !current) return;
  exiting = true;
  try {
    const needConfirm = !force && current.handle.online;
    if (needConfirm) {
      const ok = await confirmSheet('Выйти из игры?', current.mode === 'host' ? 'Партия закончится для всех, вы вернётесь в лобби комнаты.' : 'Вместо вас продолжит играть бот.', 'Выйти', true);
      if (!ok) return;
    }
    if (location.hash === '#/play') history.back(); else await closePlay();
  } finally { exiting = false; }
}
window.addEventListener('popstate', () => { if (current && location.hash !== '#/play') { const c = current; closePlay().then(() => { if (c.mode === 'host') showHostLobby(); }); } });

function showFinish({ title, sub }) {
  if (!current || current.overlay) return;
  const c = current;
  const again = c.mode === 'local' ? btn('Играть ещё', async () => { const { id, cfg } = c; await closePlay(); history.replaceState(null, '', '#/'); startLocal(id, cfg); }, 'primary')
    : c.mode === 'host' ? btn('Вернуться в лобби', () => requestExit(true), 'primary') : null;
  const box = h('div', { class: 'overlay', role: 'dialog', 'aria-label': title }, h('div', { class: 'box' }, h('h2', null, title), h('p', null, sub || ''), h('div', { class: 'row' }, again, btn('В меню', () => { if (c.mode === 'guest' || c.mode === 'host') { requestExit(true); } else requestExit(true); }, 'ghost'))));
  current.overlay = box;
  current.el.querySelector('.table-area').append(box);
  const f = box.querySelector('button.primary,button'); f && f.focus({ preventScroll: true });
}

/* ---------- настройки ---------- */
function openSettings() {
  const s = store.get();
  const name = h('input', { class: 'input', value: s.name, maxlength: 18, id: 'nm', autocomplete: 'nickname' });
  name.addEventListener('change', () => store.set({ name: name.value.trim().slice(0, 18) || s.name }));
  const seg = (items, get, set) => {
    const w = h('div', { class: 'seg', role: 'group' });
    const upd = () => [...w.children].forEach((b, i) => b.setAttribute('aria-pressed', String(items[i][0] === get())));
    items.forEach(([v, t]) => w.append(h('button', { type: 'button', onclick: () => { set(v); upd(); } }, t)));
    upd(); return w;
  };
  const sw = (label, key, after) => {
    const i = h('input', { type: 'checkbox', id: 'sw-' + key, role: 'switch' }); i.checked = !!store.get()[key];
    i.addEventListener('change', () => { store.set({ [key]: i.checked }); after && after(); });
    return h('label', { class: 'switch', for: 'sw-' + key }, h('span', null, label), i);
  };
  const tables = [['graphite', 'Графит'], ['felt', 'Сукно'], ['navy', 'Ночь'], ['wine', 'Бордо'], ['sand', 'Песок']];
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.volume, 'aria-label': 'Громкость', style: { width: '100%', accentColor: 'var(--accent)' } });
  vol.addEventListener('input', () => store.set({ volume: +vol.value }));
  vol.addEventListener('change', () => sfx.chip());
  const content = h('div', null,
    h('div', { class: 'field' }, h('label', { for: 'nm' }, 'Ваше имя за столом'), name),
    sw('Звуки', 'sound'), h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Громкость'), vol),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Анимации'), seg([['full', 'Полные'], ['reduced', 'Сдержанные']], () => store.get().motion, (v) => store.set({ motion: v }))),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Тема интерфейса'), seg([['dark', 'Тёмная'], ['light', 'Светлая'], ['auto', 'Системная']], () => store.get().theme || 'dark', (v) => { store.set({ theme: v }); applySettings(); })),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Стол'), seg(tables, () => store.get().table, (v) => { store.set({ table: v }); applySettings(); })),
    sw('Четыре цвета мастей (удобнее различать)', 'fourColor', applySettings),
    (!isDesktop && !standalone()) ? h('p', { class: 'note' }, deferredInstall ? 'Приложение можно установить кнопкой «Установить» вверху.' : 'iPhone/iPad: «Поделиться» → «На экран Домой». Chrome/Edge: значок установки в адресной строке.') : null,
    h('p', { class: 'note' }, `ID игрока: ${store.get().id}`));
  sheet({ title: 'Настройки', content });
}

/* ---------- рубашки ---------- */
function openBacks() {
  const cur = () => store.get().back;
  const prev = h('div', { class: 'preview-card' });
  const card = makeCard({ h: 1 });
  prev.append(card);
  let up = false;
  const demo = { r: 'A', s: 'S' };
  card.classList.add('pick');
  card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', 'Перевернуть карту');
  const toggle = () => {
    up = !up;
    if (up) { const f = makeCard(demo); card.querySelector('.face').innerHTML = f.querySelector('.face').innerHTML; card.className = 'card pick s-S'; }
    flipCard(card, up); if (!up) card.classList.remove('s-S');
  };
  card.addEventListener('click', toggle);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  const wrap = h('div', { class: 'preview-wrap' }, prev, h('p', { class: 'note', style: { textAlign: 'center', margin: 0 } }, 'Нажмите на карту — она перевернётся. Этот дизайн увидят и соперники онлайн.'));
  // наклон за курсором
  prev.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = prev.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    prev.style.transform = `rotateY(${x * 18}deg) rotateX(${-y * 18}deg)`;
  });
  prev.addEventListener('pointerleave', () => { const sp = spring(160, 14); anim(prev, [{ transform: prev.style.transform || 'none' }, { transform: 'none' }], { duration: sp.duration, easing: sp.easing }); prev.style.transform = ''; });

  const designBtns = new Map();
  const mkDesigns = () => {
    const c = cur(); const wrapD = h('div', { class: 'opt-row', role: 'group', 'aria-label': 'Узор' });
    BACK_DESIGNS.forEach((d) => {
      const b = h('button', { class: 'sw', type: 'button', 'aria-label': BACK_LABELS[d], title: BACK_LABELS[d], onclick: async () => {
        if (d === 'photo' && !cur().image) { const f = await pickImage(); if (!f) return; }
        sfx.click(); store.setBack({ design: d }); refresh();
      } });
      designBtns.set(d, b); wrapD.append(b);
    });
    return wrapD;
  };
  async function pickImage() {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept: 'image/*' });
      inp.onchange = async () => {
        const f = inp.files && inp.files[0]; if (!f) return resolve(null);
        try { const url = await fileToDataURL(f); store.setBack({ image: url, design: 'photo' }); refresh(); resolve(url); }
        catch { toast('Не удалось открыть картинку'); resolve(null); }
      };
      inp.click();
    });
  }
  const c1 = h('input', { type: 'color', id: 'c1', 'aria-label': 'Основной цвет', value: cur().c1 });
  const c2 = h('input', { type: 'color', id: 'c2', 'aria-label': 'Цвет узора', value: cur().c2 });
  c1.addEventListener('input', () => { store.setBack({ c1: c1.value }); refresh(true); });
  c2.addEventListener('input', () => { store.setBack({ c2: c2.value }); refresh(true); });
  const segOf = (items, key) => {
    const w = h('div', { class: 'seg', role: 'group', style: { flexWrap: 'wrap' } });
    items.forEach(([v, t]) => w.append(h('button', { type: 'button', 'data-v': v, onclick: () => { sfx.click(); store.setBack({ [key]: v }); refresh(); } }, t)));
    return w;
  };
  const EMB_L = { none: 'Без', spade: '♠', heart: '♥', diamond: '♦', club: '♣', crown: '♛', star: '★', monogram: 'Буква' };
  const FR_L = { thin: 'Тонкая', double: 'Двойная', thick: 'Толстая', none: 'Нет' };
  const emblemSeg = segOf(EMBLEMS.map((e) => [e, EMB_L[e]]), 'emblem');
  const frameSeg = segOf(FRAMES.map((e) => [e, FR_L[e]]), 'frame');
  const mono = h('input', { class: 'input', maxlength: 3, placeholder: 'Буквы (до 3)', 'aria-label': 'Монограмма', style: { maxWidth: '160px' } });
  mono.addEventListener('input', () => { store.setBack({ text: mono.value }); refresh(true); });
  const monoField = h('div', { class: 'field', style: { marginTop: '8px' } }, mono);
  const photoRow = h('div', { class: 'row', style: { marginTop: '8px' } }, btn('Выбрать фото…', () => pickImage(), 'sm'), btn('Убрать фото', () => { store.setBack({ image: null, design: 'diamonds' }); refresh(); }, 'sm ghost'));
  const presets = h('div', { class: 'opt-row' }, PRESETS.map((p) => h('button', { class: 'preset', type: 'button', onclick: () => { sfx.click(); store.setBack({ ...p, image: null, text: p.text || '' }); refresh(); } }, h('i', { style: { backgroundImage: backURL({ ...p }) } }), p.name)));
  const slotsEl = h('div', { class: 'slots' });
  const renderSlots = () => {
    slotsEl.replaceChildren(...[0, 1, 2].map((i) => {
      const s = store.get().slots[i];
      const b = h('button', { class: 'slot' + (s ? ' filled' : ''), type: 'button', 'aria-label': s ? `Слот ${i + 1}: применить` : `Слот ${i + 1}: сохранить текущую`, style: s ? { backgroundImage: backURL(s) } : {}, onclick: () => {
        const slots = store.get().slots.slice();
        if (slots[i]) { store.setBack({ ...slots[i] }); refresh(); } else { slots[i] = { ...cur() }; store.set({ slots }); toast(`Сохранено в слот ${i + 1}`); renderSlots(); }
      } }, s ? '' : '+ слот');
      if (s) b.append(h('span', { role: 'button', tabindex: 0, 'aria-label': 'Очистить слот', title: 'Очистить слот', style: { position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,.6)', color: '#fff', borderRadius: '50%', width: '22px', height: '22px', display: 'grid', placeItems: 'center', fontSize: '12px' }, onclick: (e) => { e.stopPropagation(); const sl = store.get().slots.slice(); sl[i] = null; store.set({ slots: sl }); renderSlots(); } }, '✕'));
      return b;
    }));
  };
  const randomBtn = btn('Случайная', () => {
    const rnd = (a) => a[Math.floor(Math.random() * a.length)];
    const hue = Math.floor(Math.random() * 360);
    const hsl = (hh, s, l) => { const a = s * Math.min(l, 1 - l); const f = (n) => { const k = (n + hh / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0'); }; return `#${f(0)}${f(8)}${f(4)}`; };
    store.setBack({ design: rnd(BACK_DESIGNS.filter((d) => d !== 'photo')), c1: hsl(hue, 0.45, 0.22), c2: hsl((hue + 30 + Math.random() * 40) % 360, 0.6, 0.72), emblem: rnd(EMBLEMS), frame: rnd(FRAMES), text: 'HC', image: null });
    sfx.click(); refresh();
  }, 'sm');

  function refresh(colorOnly) {
    const c = cur();
    prev.style.setProperty('--back', backURL(c));
    if (!colorOnly || true) {
      designBtns.forEach((b, d) => {
        b.innerHTML = backSVG({ ...c, design: d, image: c.image });
        b.setAttribute('aria-pressed', String(c.design === d));
      });
    }
    if (document.activeElement !== c1) c1.value = c.c1;
    if (document.activeElement !== c2) c2.value = c.c2;
    [emblemSeg, frameSeg].forEach((w, k) => [...w.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === (k ? c.frame : c.emblem)))));
    monoField.hidden = c.emblem !== 'monogram';
    if (document.activeElement !== mono) mono.value = c.text || '';
    photoRow.hidden = c.design !== 'photo';
    renderSlots();
  }
  const content = h('div', { class: 'backs-ed' }, wrap,
    h('div', null,
      h('div', { class: 'section-t', style: { marginTop: 0 } }, 'Готовые'), presets,
      h('div', { class: 'section-t' }, 'Узор'), mkDesigns(), photoRow,
      h('div', { class: 'section-t' }, 'Цвета'), h('div', { class: 'colors' }, h('label', null, c1, 'Фон'), h('label', null, c2, 'Узор и рамка'), randomBtn),
      h('div', { class: 'section-t' }, 'Эмблема'), emblemSeg, monoField,
      h('div', { class: 'section-t' }, 'Рамка'), frameSeg,
      h('div', { class: 'section-t' }, 'Мои рубашки'), slotsEl));
  refresh();
  sheet({ title: 'Рубашка карт', content, wide: true });
}

/* ---------- онлайн ---------- */
const net = { room: null, guest: null, sheet: null, bots: 0, game: 'poker', draw: 1 };

function openOnline(gameId, cfg) {
  if (net.room) { showHostLobby(); return; }
  if (net.guest) { showGuestLobby(); return; }
  if (gameId) net.game = gameId;
  if (cfg) { net.bots = cfg.bots || 0; net.draw = cfg.draw || 1; }
  const code = h('input', { class: 'input', placeholder: 'КОД', maxlength: 7, 'aria-label': 'Код комнаты', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', style: { fontSize: '26px', letterSpacing: '.3em', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase' } });
  const status = h('p', { class: 'note', 'aria-live': 'polite', style: { minHeight: '20px' } });
  const join = async () => {
    const c = normCode(code.value); if (c.length !== 5) { status.textContent = 'Код состоит из 5 символов.'; return; }
    status.textContent = 'Подключаемся…'; joinBtn.disabled = true;
    try { await joinRoom(c); sh.close(); } catch (e) { status.textContent = e.message || 'Не получилось'; joinBtn.disabled = false; }
  };
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  const joinBtn = btn('Войти', join, 'primary');
  const createBtn = btn('Создать комнату', async () => {
    createBtn.disabled = true; status.textContent = 'Создаём комнату…';
    try { await createRoom(); sh.close(); } catch (e) { status.textContent = e.message || 'Не получилось'; createBtn.disabled = false; }
  }, 'primary');
  const sh = sheet({
    title: 'Играть онлайн', content: h('div', null,
      h('p', { class: 'muted', style: { margin: '0 0 16px' } }, 'Соединение напрямую между игроками, регистрация не нужна. Создайте комнату и отправьте код друзьям — или введите чужой.'),
      h('div', { class: 'section-t', style: { marginTop: 0 } }, 'Есть код?'), code, h('div', { class: 'row', style: { marginTop: '10px' } }, joinBtn),
      h('div', { class: 'section-t' }, 'Нет кода?'), h('div', { class: 'row' }, createBtn),
      status),
  });
  setTimeout(() => code.focus(), 60);
}

async function createRoom() {
  const room = new Room((id) => GAMES[id].mod);
  await room.open();
  net.room = room; net.guest = null;
  room.setGame(net.game, { draw: net.draw });
  room.on('lobby', () => { if (net.sheet && !current) renderHostLobby(); });
  room.on('left', (pid, name) => toast(`${name} вышел — играет бот`));
  showHostLobby();
}

function showHostLobby() { if (!net.room) return; if (net.sheet) { renderHostLobby(); return; } net.sheet = sheet({ title: 'Комната', closable: true, content: h('div'), onClose: () => { net.sheet = null; if (net.room && !net.room.inGame && !current) leaveRoom(); } }); renderHostLobby(); }

function renderHostLobby() {
  const room = net.room; if (!room || !net.sheet) return;
  const g = GAMES[room.game], m = g.mod.meta;
  const humans = room.roster();
  const link = `${location.origin}${location.pathname}#/join/${room.code}`;
  const gameSeg = h('div', { class: 'seg', role: 'group', style: { flexWrap: 'wrap' } }, ORDER.map((id) => h('button', { type: 'button', 'aria-pressed': String(room.game === id), onclick: () => { net.bots = 0; room.setGame(id, { draw: net.draw }); } }, GAMES[id].mod.meta.name)));
  const maxBots = Math.max(0, m.max - humans.length);
  net.bots = Math.min(net.bots, maxBots);
  const botSeg = h('div', { class: 'seg', role: 'group' }, range(0, Math.min(maxBots, 5)).map((n) => h('button', { type: 'button', 'aria-pressed': String(net.bots === n), onclick: () => { net.bots = n; renderHostLobby(); } }, String(n))));
  const total = humans.length + net.bots;
  const ok = total >= m.min && total <= m.max;
  net.sheet.body.replaceChildren(h('div', null,
    h('div', { class: 'code', 'aria-label': 'Код комнаты ' + room.code.split('').join(' ') }, room.code),
    h('div', { class: 'row', style: { justifyContent: 'center', margin: '12px 0' } },
      btn('Скопировать ссылку', async () => { try { await navigator.clipboard.writeText(link); toast('Ссылка скопирована'); } catch { toast(link, 6000); } }, 'sm'),
      navigator.share ? btn('Поделиться', () => navigator.share({ title: 'House of Cards', text: `Присоединяйся к игре! Код: ${room.code}`, url: link }).catch(() => {}), 'sm ghost') : null),
    h('div', { class: 'roster' }, humans.map((p) => h('div', { class: 'roster-row' }, h('span', { class: 'avatar', style: { '--av': 'oklch(0.72 0.09 ' + ([...p.name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 0)) + ')' } }, p.name.charAt(0).toUpperCase()), p.name, p.host ? h('span', { class: 'tag' }, 'хост') : h('button', { class: 'btn sm ghost', style: { marginLeft: 'auto' }, onclick: () => room.kick(p.id) }, 'Убрать')))),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Игра'), gameSeg),
    room.game === 'solitaire' ? h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Раздача'), h('div', { class: 'seg' }, [[1, 'По 1'], [3, 'По 3']].map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(net.draw === v), onclick: () => { net.draw = v; room.setGame(room.game, { draw: v }); } }, t)))) : null,
    room.game !== 'solitaire' && maxBots > 0 ? h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Добавить ботов'), botSeg) : null,
    h('div', { class: 'row' }, btn(ok ? 'Начать игру' : `Нужно игроков: ${m.min}+`, () => { startHosted(); net.sheet && net.sheet.close(); }, 'primary', { disabled: !ok }), btn('Закрыть комнату', async () => { if (await confirmSheet('Закрыть комнату?', 'Все игроки будут отключены.', 'Закрыть', true)) { net.sheet && net.sheet.close(); } }, 'ghost')),
    h('p', { class: 'note', style: { marginTop: '10px' } }, 'Если друг не может подключиться — у него или у вас строгий NAT/VPN. Попробуйте другую сеть.')));
}

function startHosted() {
  const room = net.room; if (!room) return;
  const handle = room.startGame({ bots: net.bots });
  openPlay({ id: room.game, handle, mode: 'host', room });
}

function leaveRoom() { if (net.room) { try { net.room.close(); } catch { /* */ } net.room = null; } }

async function joinRoom(code) {
  const guest = new Guest();
  guest.on('lobby', (m) => { net.guestMeta = m; guest.playing = false; if (current && current.mode === 'guest') { closePlay(true).then(() => { history.replaceState(null, '', '#/'); showGuestLobby(); }); } else if (net.sheet) renderGuestLobby(); });
  guest.on('start', async (m) => {
    const g = GAMES[m.game]; if (!g) return;
    guest.playing = true;
    net.sheet && net.sheet.close();
    guest.setMod(g.mod);
    openPlay({ id: m.game, handle: guest, mode: 'guest', guest });
  });
  guest.on('closed', () => { if (net.guest !== guest) return; toast('Комната закрыта'); net.guest = null; net.guestMeta = null; if (current && current.mode === 'guest') requestExit(true); net.sheet && net.sheet.close(); });
  guest.on('kicked', () => { toast('Хост убрал вас из комнаты'); net.guest = null; net.sheet && net.sheet.close(); });
  guest.on('error', (msg) => toast(msg));
  await guest.join(code);
  net.guest = guest; net.room = null;
  showGuestLobby();
}
function showGuestLobby() { if (!net.guest) return; if (net.sheet) { renderGuestLobby(); return; } net.sheet = sheet({ title: 'Комната', content: h('div'), onClose: () => { net.sheet = null; if (net.guest && !net.guest.playing && !current) { net.guest.leave(); net.guest = null; } } }); renderGuestLobby(); }
function renderGuestLobby() {
  const g = net.guest, m = net.guestMeta || g.meta; if (!g || !net.sheet || !m) return;
  net.sheet.body.replaceChildren(h('div', null,
    h('div', { class: 'code' }, m.code || g.code),
    h('div', { class: 'roster' }, m.players.map((p) => h('div', { class: 'roster-row' }, h('span', { class: 'avatar', style: { '--av': 'oklch(0.72 0.09 ' + ([...p.name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 0)) + ')' } }, p.name.charAt(0).toUpperCase()), p.name, p.host ? h('span', { class: 'tag' }, 'хост') : null))),
    h('p', { class: 'muted' }, 'Игра: ', h('b', null, GAMES[m.game] ? GAMES[m.game].mod.meta.name : m.game), '. Ждём, пока хост начнёт партию…'),
    h('div', { class: 'row' }, btn('Выйти', () => { net.sheet && net.sheet.close(); }, 'ghost'))));
}

/* ---------- глубокие ссылки и PWA ---------- */
function handleDeepLink() {
  const hsh = location.hash.replace(/^#/, '');
  let m;
  if ((m = hsh.match(/^\/g\/(\w+)/)) && GAMES[m[1]]) { history.replaceState(null, '', '#/'); openSetup(m[1]); }
  else if ((m = hsh.match(/^\/join\/(\w+)/))) {
    history.replaceState(null, '', '#/');
    const code = normCode(m[1]);
    const sh = sheet({ title: 'Присоединиться', content: h('div', null, h('p', { class: 'muted' }, `Комната ${code}. Войти за стол?`), h('div', { class: 'row' }, btn('Войти', async (e) => { e.target.disabled = true; try { await joinRoom(code); sh.close(); } catch (er) { toast(er.message); e.target.disabled = false; } }, 'primary'), btn('Отмена', () => sh.close(), 'ghost'))) });
  } else if (hsh === '/play') history.replaceState(null, '', '#/');
}
handleDeepLink();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.__hoc = { store, GAMES, startLocal, openSetup, cur: () => current };

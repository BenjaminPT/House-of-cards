// Отрисовка карт, рубашки (кастомизация) и Stage — менеджер карт с FLIP-анимациями.
import * as store from './store.js';
import { anim, spring, flipFrom, flyIn, rectOf, reduced } from './anim.js';
import { SUIT_CH } from '../engines/common.js';
import { sfx } from './sfx.js';

const VS = '︎'; // запрет эмодзи-вида у ♥ ♦
const suit = (s) => SUIT_CH[s] + VS;

/* ======================= Рубашки ======================= */
export const BACK_DESIGNS = ['diamonds', 'lines', 'dots', 'waves', 'grid', 'scales', 'stars', 'rings', 'gradient', 'solid', 'photo'];
export const BACK_LABELS = {
  diamonds: 'Ромбы', lines: 'Линии', dots: 'Точки', waves: 'Волны', grid: 'Сетка', scales: 'Чешуя', stars: 'Звёзды',
  rings: 'Кольца', gradient: 'Градиент', solid: 'Однотон', photo: 'Своё фото',
};
export const EMBLEMS = ['none', 'spade', 'heart', 'diamond', 'club', 'crown', 'star', 'monogram'];
export const FRAMES = ['thin', 'double', 'thick', 'none'];

export const PRESETS = [
  { name: 'Полночь', design: 'diamonds', c1: '#1d2f4a', c2: '#d8b36a', emblem: 'spade', frame: 'thin' },
  { name: 'Бордо', design: 'lines', c1: '#5a1722', c2: '#e8c9a0', emblem: 'crown', frame: 'double' },
  { name: 'Лес', design: 'scales', c1: '#12362c', c2: '#9fd0b4', emblem: 'none', frame: 'thin' },
  { name: 'Графит', design: 'grid', c1: '#20242b', c2: '#8b93a1', emblem: 'monogram', text: 'H', frame: 'thin' },
  { name: 'Слоновая кость', design: 'dots', c1: '#efe9dc', c2: '#8a6d3b', emblem: 'star', frame: 'double' },
  { name: 'Индиго', design: 'waves', c1: '#2b2a6f', c2: '#9fa8ff', emblem: 'star', frame: 'thin' },
  { name: 'Закат', design: 'gradient', c1: '#ff7a59', c2: '#6a2c70', emblem: 'diamond', frame: 'thin' },
  { name: 'Чёрное золото', design: 'stars', c1: '#0b0b0d', c2: '#c9a14a', emblem: 'crown', frame: 'double' },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const okColor = (c, d) => (/^#[0-9a-f]{6}$/i.test(c) ? c : d);

function patternDef(design, c2) {
  const st = `stroke="${c2}" fill="none"`;
  switch (design) {
    case 'diamonds': return `<pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M7 0L14 7L7 14L0 7Z" ${st} stroke-width=".7" opacity=".55"/><circle cx="7" cy="7" r=".9" fill="${c2}" opacity=".6"/></pattern>`;
    case 'lines': return `<pattern id="p" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 3H6" ${st} stroke-width=".9" opacity=".45"/></pattern>`;
    case 'dots': return `<pattern id="p" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="1.25" fill="${c2}" opacity=".6"/></pattern>`;
    case 'waves': return `<pattern id="p" width="16" height="8" patternUnits="userSpaceOnUse"><path d="M0 4Q4 0 8 4T16 4" ${st} stroke-width=".8" opacity=".55"/></pattern>`;
    case 'grid': return `<pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" ${st} stroke-width=".6" opacity=".5"/></pattern>`;
    case 'scales': return `<pattern id="p" width="12" height="8" patternUnits="userSpaceOnUse"><path d="M0 8A6 6 0 0 1 12 8M-6 4A6 6 0 0 1 6 4M6 4A6 6 0 0 1 18 4" ${st} stroke-width=".7" opacity=".5"/></pattern>`;
    case 'stars': return `<pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M8 3.5L9.1 6.9L12.5 8L9.1 9.1L8 12.5L6.9 9.1L3.5 8L6.9 6.9Z" fill="${c2}" opacity=".55"/></pattern>`;
    case 'rings': return `<pattern id="p" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="7" ${st} stroke-width=".6" opacity=".45"/><circle cx="9" cy="9" r="3" ${st} stroke-width=".6" opacity=".55"/></pattern>`;
    default: return '';
  }
}

const EMBLEM_GLYPH = { spade: '♠', heart: '♥', diamond: '♦', club: '♣', star: '★' };

export function backSVG(cfg) {
  const c1 = okColor(cfg.c1, '#1d2f4a'), c2 = okColor(cfg.c2, '#d8b36a');
  const d = BACK_DESIGNS.includes(cfg.design) ? cfg.design : 'diamonds';
  const frame = FRAMES.includes(cfg.frame) ? cfg.frame : 'thin';
  let defs = '', body = '';
  if (d === 'gradient') {
    defs += `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
    body += `<rect width="100" height="140" fill="url(#g)"/>`;
  } else {
    body += `<rect width="100" height="140" fill="${c1}"/>`;
    const pd = patternDef(d, c2);
    if (pd) { defs += pd; body += `<rect x="8" y="8" width="84" height="124" fill="url(#p)"/>`; }
  }
  if (d === 'photo' && cfg.image && /^data:image\//.test(cfg.image)) {
    defs += `<clipPath id="cp"><rect x="8" y="8" width="84" height="124" rx="3"/></clipPath>`;
    body += `<image href="${cfg.image}" x="8" y="8" width="84" height="124" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp)"/>`;
  }
  const edge = d === 'gradient' || d === 'photo' ? '#ffffff' : c2;
  if (frame === 'thin') body += `<rect x="5" y="5" width="90" height="130" rx="4" fill="none" stroke="${edge}" stroke-width=".9" opacity=".85"/>`;
  if (frame === 'double') body += `<rect x="4" y="4" width="92" height="132" rx="5" fill="none" stroke="${edge}" stroke-width=".8" opacity=".85"/><rect x="7.5" y="7.5" width="85" height="125" rx="3" fill="none" stroke="${edge}" stroke-width=".5" opacity=".7"/>`;
  if (frame === 'thick') body += `<rect x="4" y="4" width="92" height="132" rx="5" fill="none" stroke="${edge}" stroke-width="2.6" opacity=".9"/>`;
  const em = EMBLEMS.includes(cfg.emblem) ? cfg.emblem : 'none';
  if (em !== 'none') {
    body += `<circle cx="50" cy="70" r="19" fill="${c1}" stroke="${edge}" stroke-width=".9"/>`;
    const gc = d === 'gradient' || d === 'photo' ? '#ffffff' : c2;
    if (EMBLEM_GLYPH[em]) body += `<text x="50" y="71" font-size="24" text-anchor="middle" dominant-baseline="central" fill="${gc}" font-family="Georgia,serif">${EMBLEM_GLYPH[em]}${VS}</text>`;
    else if (em === 'crown') body += `<path d="M38 77V62l7 7 5-11 5 11 7-7v15Z" fill="${gc}"/>`;
    else if (em === 'monogram') {
      const t = esc((cfg.text || 'H').slice(0, 3));
      body += `<text x="50" y="71" font-size="${t.length > 2 ? 14 : t.length > 1 ? 18 : 24}" text-anchor="middle" dominant-baseline="central" fill="${gc}" font-family="Georgia,serif" font-style="italic" font-weight="700">${t}</text>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
}

const urlCache = new Map();
export function backURL(cfg) {
  const key = JSON.stringify(cfg);
  let u = urlCache.get(key);
  if (!u) {
    u = `url("data:image/svg+xml,${encodeURIComponent(backSVG(cfg))}")`;
    if (urlCache.size > 60) urlCache.clear();
    urlCache.set(key, u);
  }
  return u;
}

/** Сжимает загруженную картинку до JPEG ~360px по большей стороне. */
export function fileToDataURL(file, max = 360) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

export function applyBackVar() {
  document.documentElement.style.setProperty('--back', backURL(store.get().back));
}

/* ======================= Лицо карты ======================= */
function faceHTML(c) {
  const s = suit(c.s);
  const face = ['J', 'Q', 'K'].includes(c.r);
  const mid = face
    ? `<div class="mid face-mid"><span>${c.r}</span><i>${s}</i></div>`
    : `<div class="mid"><i>${s}</i></div>`;
  return `<div class="corner tl"><b>${c.r}</b><i>${s}</i></div>${mid}<div class="corner br"><b>${c.r}</b><i>${s}</i></div>`;
}

export function makeCard(c) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = '<div class="inner"><div class="face"></div><div class="back"></div></div>';
  paint(el, c);
  return el;
}
function paint(el, c) {
  const known = !c.h && c.r;
  el.classList.toggle('down', !known);
  if (known) {
    el.dataset.rs = c.r + c.s;
    el.className = el.className.replace(/\bs-[SHDC]\b/g, '').trim() + ' s-' + c.s;
    el.querySelector('.face').innerHTML = faceHTML(c);
    el.setAttribute('aria-label', c.r + ' ' + c.s);
  } else { delete el.dataset.rs; el.setAttribute('aria-label', 'карта рубашкой вверх'); }
}

export function flipCard(el, toUp, delay = 0) {
  const inner = el.querySelector('.inner');
  el.classList.toggle('down', !toUp);
  sfx.flip();
  return anim(inner, [{ transform: toUp ? 'rotateY(180deg)' : 'rotateY(0deg)' }, { transform: toUp ? 'rotateY(0deg)' : 'rotateY(180deg)' }],
    { duration: 380, easing: 'cubic-bezier(0.23,1,0.32,1)', delay });
}

/* ======================= Stage ======================= */
export class Stage {
  /** @param root элемент-владелец, getOrigin() → {x,y} точка, откуда вылетают новые карты */
  constructor(root, getOrigin) {
    this.root = root; this.getOrigin = getOrigin; this.map = new Map(); this.seen = null; this.fresh = []; this.dealIdx = 0;
    this.stagger = 90;
  }
  /** Оборачивает серию sync() — измеряет, меняет DOM, анимирует. */
  run(fn) {
    const old = new Map();
    for (const [k, el] of this.map) if (el.isConnected) old.set(k, rectOf(el));
    this.seen = new Set(); this.fresh = []; this.revealed = [];
    fn(this);
    const gone = [];
    for (const [k, el] of [...this.map]) if (!this.seen.has(k)) { this.map.delete(k); gone.push([el, old.get(k)]); }
    for (const [el, r] of gone) this._out(el, r);
    const origin = this.getOrigin ? this.getOrigin() : null;
    let n = 0;
    for (const el of this.fresh) {
      if (!el.isConnected) continue;
      if (origin && !reduced()) { flyIn(el, origin, { delay: n * this.stagger, duration: 520 }); sfx.deal(); n++; }
      else flyIn(el, { x: rectOf(el).left, y: rectOf(el).top }, { duration: 160 });
    }
    for (const [k, el] of this.map) {
      if (this.fresh.includes(el) || !old.has(k) || !el.isConnected) continue;
      flipFrom(el, old.get(k));
    }
    this.revealed.forEach((el, i) => flipCard(el, true, i * 60));
    this.seen = null;
  }
  /** Размещает cards в container (в нём должны быть только карты). opts.key — функция ключа. */
  sync(container, cards, opts = {}) {
    cards.forEach((c, idx) => {
      const key = (opts.prefix || '') + (opts.key ? opts.key(c) : c.i);
      let el = this.map.get(key);
      if (!el) {
        el = makeCard(c);
        this.map.set(key, el); this.fresh.push(el);
      } else {
        const wasDown = el.classList.contains('down');
        const known = !c.h && c.r;
        if (wasDown && known && !this.fresh.includes(el)) { paint(el, c); el.classList.add('down'); this.revealed.push(el); }
        else if (!wasDown && !known) paint(el, c);
        else if (known && el.dataset.rs !== c.r + c.s) paint(el, c);
      }
      if (opts.decorate) opts.decorate(el, c, idx);
      this.seen.add(key);
      if (container.children[idx] !== el) container.insertBefore(el, container.children[idx] || null);
    });
    // убрать «чужие» (ушедшие в другой контейнер уберёт их sync; неучтённые — _out)
  }
  _out(el, r) {
    if (!el.isConnected || !r || reduced()) { el.remove(); return; }
    Object.assign(el.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: '0', zIndex: 60, pointerEvents: 'none' });
    document.body.appendChild(el);
    anim(el, [{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(-26px) scale(.96)', opacity: 0 }], { duration: 300, easing: 'cubic-bezier(0.23,1,0.32,1)', fill: 'forwards' }).then(() => el.remove());
  }
  clear() { for (const el of this.map.values()) el.remove(); this.map.clear(); }
}

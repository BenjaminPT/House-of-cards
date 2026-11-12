// Анимационные помощники: WAAPI, пружины через CSS linear(), FLIP, твины чисел.
import * as store from './store.js';

export const EASE = {
  out: 'cubic-bezier(0.23, 1, 0.32, 1)',
  inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
  sheet: 'cubic-bezier(0.32, 0.72, 0, 1)',
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const reduced = () =>
  store.get().motion === 'reduced' || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

const springCache = new Map();
/** Пружина как CSS-easing linear(...). Возвращает { easing, duration }. */
export function spring(stiffness = 220, damping = 22, mass = 1) {
  const k = `${stiffness}/${damping}/${mass}`;
  if (springCache.has(k)) return springCache.get(k);
  const pts = [];
  let x = 0, v = 0, t = 0;
  const dt = 1 / 240;
  let settledAt = 0;
  for (let n = 0; n < 240 * 3; n++) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt; x += v * dt; t += dt;
    if (n % 4 === 0) pts.push(+x.toFixed(4));
    if (Math.abs(x - 1) < 0.002 && Math.abs(v) < 0.02) { settledAt = t; break; }
  }
  if (!settledAt) settledAt = 1;
  pts.push(1);
  const res = { easing: `linear(${pts.join(',')})`, duration: Math.round(settledAt * 1000) };
  springCache.set(k, res);
  return res;
}

export function anim(el, keyframes, opts = {}) {
  if (!el || !el.animate) return Promise.resolve();
  if (reduced()) {
    // без движения: оставляем только плавную смену прозрачности
    const last = keyframes[keyframes.length - 1];
    const kf = [{ opacity: keyframes[0].opacity ?? 1 }, { opacity: last.opacity ?? 1 }];
    const a = el.animate(kf, { duration: Math.min(120, opts.duration || 120), fill: opts.fill || 'none' });
    return a.finished.catch(() => {});
  }
  const a = el.animate(keyframes, { duration: 300, easing: EASE.out, fill: 'none', ...opts });
  return a.finished.catch(() => {});
}

export function rectOf(el) { return el.getBoundingClientRect(); }

/** Плавное «влёт» из точки (origin) в текущее положение. */
export function flyIn(el, origin, opts = {}) {
  const r = rectOf(el);
  const dx = origin.x - (r.left + r.width / 2);
  const dy = origin.y - (r.top + r.height / 2);
  const sp = spring(opts.stiffness || 230, opts.damping || 24);
  const rot = opts.rot ?? (Math.random() * 14 - 7);
  return anim(el, [
    { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(.82)`, opacity: 0.0 },
    { opacity: 1, offset: 0.12 },
    { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
  ], { duration: opts.duration || Math.max(380, sp.duration), easing: sp.easing, delay: opts.delay || 0, fill: 'backwards' });
}

/** FLIP: анимирует элемент из прежнего прямоугольника в нынешний. */
export function flipFrom(el, from, opts = {}) {
  const to = rectOf(el);
  const dx = from.left - to.left, dy = from.top - to.top;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return Promise.resolve();
  const sp = spring(opts.stiffness || 260, opts.damping || 26);
  return anim(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0,0)' }],
    { duration: opts.duration || sp.duration, easing: sp.easing, delay: opts.delay || 0 });
}

export function pop(el, from = 0.9) {
  const sp = spring(380, 20);
  return anim(el, [{ transform: `scale(${from})`, opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: sp.duration, easing: sp.easing });
}

export function shake(el) {
  return anim(el, [
    { transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' },
    { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' },
  ], { duration: 320, easing: 'ease-out' });
}

/** Числовой твин для счётчиков. */
export function countTo(el, to, ms = 600, fmt = (n) => Math.round(n).toLocaleString('ru-RU')) {
  const from = +(el.dataset.v ?? to);
  el.dataset.v = to;
  if (from === to || reduced()) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - p, 3);
    if (+el.dataset.v !== to) return;
    el.textContent = fmt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}

/** Плавающая подпись (+150) над элементом. */
export function floatText(anchor, text, cls = '') {
  const r = rectOf(anchor);
  const d = document.createElement('div');
  d.className = 'float-text ' + cls;
  d.textContent = text;
  d.style.left = r.left + r.width / 2 + 'px';
  d.style.top = r.top + 'px';
  document.body.appendChild(d);
  anim(d, [{ transform: 'translate(-50%,0)', opacity: 0 }, { transform: 'translate(-50%,-10px)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,-46px)', opacity: 0 }],
    { duration: 1400, easing: 'cubic-bezier(.2,.7,.2,1)' }).then(() => d.remove());
}

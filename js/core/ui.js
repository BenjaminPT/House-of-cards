// Мелкие помощники для DOM, тосты и «шторки».
import { anim, EASE, reduced } from './anim.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const fmt = (n) => Math.round(n).toLocaleString('ru-RU');

let toastHost = null;
export function toast(msg, ms = 2600) {
  if (!toastHost) { toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastHost); }
  const t = h('div', { class: 'toast' }, msg);
  toastHost.append(t);
  anim(t, [{ transform: 'translateY(12px) scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: EASE.out, fill: 'backwards' });
  setTimeout(() => {
    anim(t, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(6px)' }], { duration: 180, fill: 'forwards' }).then(() => t.remove());
  }, ms);
}

/** Шторка/диалог. Возвращает {el, body, close}. */
export function sheet({ title, content, wide = false, onClose, closable = true, cls = '' }) {
  const prev = document.activeElement;
  const back = h('div', { class: 'scrim' });
  const panel = h('section', { class: 'sheet ' + (wide ? 'wide ' : '') + cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Диалог' });
  const head = h('header', { class: 'sheet-head' }, h('h2', null, title || ''), closable && h('button', { class: 'icon-btn', 'aria-label': 'Закрыть', onclick: () => close() }, '✕'));
  const body = h('div', { class: 'sheet-body' }, content);
  panel.append(head, body);
  back.append(panel);
  document.body.append(back);
  let closed = false;
  const key = (e) => { if (e.key === 'Escape' && closable) close(); };
  document.addEventListener('keydown', key);
  back.addEventListener('pointerdown', (e) => { if (e.target === back && closable) close(); });
  const mobile = matchMedia('(max-width: 640px)').matches;
  anim(back, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  anim(panel, mobile ? [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }] : [{ transform: 'translateY(10px) scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: mobile ? 340 : 240, easing: mobile ? EASE.sheet : EASE.out });
  setTimeout(() => { const f = panel.querySelector('[autofocus],button.primary,input,button'); f && f.focus({ preventScroll: true }); }, 30);
  function close() {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', key);
    const fin = () => { back.remove(); try { prev && prev.focus && prev.focus({ preventScroll: true }); } catch { /* */ } onClose && onClose(); };
    if (reduced()) return fin();
    anim(back, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
    anim(panel, mobile ? [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }] : [{ transform: 'none', opacity: 1 }, { transform: 'scale(.98)', opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' }).then(fin);
  }
  return { el: panel, body, close };
}

export function btn(label, onclick, cls = '', attrs = {}) {
  return h('button', { class: 'btn ' + cls, type: 'button', onclick, ...attrs }, label);
}

/** Глобальные горячие клавиши, возвращает функцию снятия. */
export function hotkeys(map) {
  const f = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const fn = map[e.key.toLowerCase()];
    if (fn) { e.preventDefault(); fn(e); }
  };
  document.addEventListener('keydown', f);
  return () => document.removeEventListener('keydown', f);
}

export function avatar(name, color) {
  const a = h('span', { class: 'avatar', 'aria-hidden': 'true' }, (name || '?').trim().charAt(0).toUpperCase());
  if (color) a.style.setProperty('--av', color);
  else {
    let hh = 0; for (const ch of name || '') hh = (hh * 31 + ch.charCodeAt(0)) % 360;
    a.style.setProperty('--av', `oklch(0.72 0.09 ${hh})`);
  }
  return a;
}

// компактная подпись номинала фишки: 1500 → 1.5K, 2 000 000 → 2M
export const fmtShort = (n) => {
  const t = (x, u) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, '') + u;
  return n >= 1e9 ? t(n / 1e9, 'B') : n >= 1e6 ? t(n / 1e6, 'M') : n >= 1e3 ? t(n / 1e3, 'K') : String(n);
};

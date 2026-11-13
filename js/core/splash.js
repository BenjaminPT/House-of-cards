// Заставка при запуске: логотип собирается из частиц и рассыпается.
// canvas 2D, только fillRect; пропускается по тапу/клавише; при reduced-motion — просто короткое появление.
import * as store from './store.js';

const css = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t;

function drawLogo(ctx, W, H, text, accent) {
  const u = Math.min(W, H) / 100; // условная единица
  const cx = W / 2, cy = H / 2 - u * 8;
  const cw = u * 22, ch = u * 33; // карта 2:3
  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = text; ctx.lineWidth = u * 1.7;
  const r = u * 3;
  ctx.beginPath(); ctx.roundRect(cx - cw / 2, cy - ch / 2, cw, ch, r); ctx.stroke();
  ctx.fillStyle = accent; // ромб-масть строго по центру карты
  const d = u * 6.4;
  ctx.beginPath(); ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d * 0.78, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d * 0.78, cy); ctx.closePath(); ctx.fill();
  ctx.fillStyle = text; // индексы в углах
  const t = u * 1.6, px = cx - cw / 2 + u * 3.4, py = cy - ch / 2 + u * 4;
  for (const [x, y] of [[px, py], [2 * cx - px, 2 * cy - py]]) { ctx.beginPath(); ctx.moveTo(x, y - t); ctx.lineTo(x + t * 0.78, y); ctx.lineTo(x, y + t); ctx.lineTo(x - t * 0.78, y); ctx.closePath(); ctx.fill(); }
  // словесный знак
  ctx.fillStyle = text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${u * 4.2}px Inter, system-ui, sans-serif`;
  try { ctx.letterSpacing = `${u * 1.1}px`; } catch { /* старые браузеры */ }
  ctx.fillText('HOUSE OF CARDS', cx + u * 0.55, cy + ch / 2 + u * 12);
}

export function splash({ force = false } = {}) {
  try { if (!force && sessionStorage.getItem('hoc.splash')) return Promise.resolve(); sessionStorage.setItem('hoc.splash', '1'); } catch { /* */ }
  const reduced = store.get().motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bg = css('--bg', '#0e0f12'), text = css('--text', '#f1efe9'), accent = css('--accent', '#f2c94c');
  const root = document.createElement('div');
  root.setAttribute('aria-hidden', 'true');
  Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '9999', background: bg, display: 'grid', placeItems: 'center', touchAction: 'manipulation' });
  const cv = document.createElement('canvas'); cv.style.cssText = 'width:100%;height:100%;display:block';
  root.append(cv); document.body.append(root);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.floor(innerWidth * dpr), H = Math.floor(innerHeight * dpr);
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const finish = (resolve) => { root.remove(); document.removeEventListener('keydown', skip); resolve(); };
  let skip = () => {};

  return new Promise((resolve) => {
    const run = async () => {
      try { await document.fonts.load('600 20px Inter'); } catch { /* */ }
      drawLogo(ctx, W, H, text, accent);
      if (reduced) { // без движения: показать и плавно убрать
        const a = root.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
        a.onfinish = () => finish(resolve); skip = () => { a.cancel(); finish(resolve); }; root.onclick = skip; return;
      }
      // частицы из пикселей логотипа
      const img = ctx.getImageData(0, 0, W, H).data;
      const step = Math.max(2, Math.round(1.7 * dpr));
      const P = [];
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
        const i = (y * W + x) * 4;
        if (img[i + 3] > 120) P.push({ x, y, c: `rgb(${img[i]},${img[i + 1]},${img[i + 2]})`, ox: 0, oy: 0, vx: 0, vy: 0, d: 0, s: step });
      }
      const rnd = (a, b) => a + Math.random() * (b - a);
      const cxm = W / 2, cym = H / 2;
      for (const p of P) {
        const a = Math.random() * Math.PI * 2, r = rnd(0.35, 0.9) * Math.max(W, H);
        p.ox = cxm + Math.cos(a) * r; p.oy = cym + Math.sin(a) * r; // откуда прилетает
        p.d = Math.random() * 0.22;                                  // задержка сборки
        const a2 = Math.atan2(p.y - cym, p.x - cxm) + rnd(-0.9, 0.9), sp = rnd(0.4, 2.2) * dpr;
        p.vx = Math.cos(a2) * sp; p.vy = Math.sin(a2) * sp - rnd(0.2, 1.2) * dpr; // куда рассыпается
        p.fall = rnd(0.02, 0.06) * dpr;
      }
      const T_IN = 750, T_HOLD = 650, T_OUT = 1000, total = T_IN + T_HOLD + T_OUT;
      let t0 = 0, raf = 0, done = false;
      const end = () => { if (done) return; done = true; cancelAnimationFrame(raf); finish(resolve); };
      skip = () => { // быстрый уход по тапу
        if (done) return; cancelAnimationFrame(raf);
        root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out' }).onfinish = () => { done = true; finish(resolve); };
      };
      root.onpointerdown = skip; document.addEventListener('keydown', skip, { once: true });
      const frame = (now) => {
        if (!t0) t0 = now;
        const t = now - t0;
        ctx.clearRect(0, 0, W, H);
        if (t < T_IN + T_HOLD) {
          for (const p of P) {
            const k = easeOut(Math.min(1, Math.max(0, (t / T_IN - p.d) / (1 - p.d))));
            ctx.fillStyle = p.c; ctx.fillRect(p.ox + (p.x - p.ox) * k, p.oy + (p.y - p.oy) * k, p.s, p.s);
          }
        } else {
          const k = Math.min(1, (t - T_IN - T_HOLD) / T_OUT), e = easeIn(k);
          const dist = 130 * dpr;
          ctx.globalAlpha = 1 - Math.pow(k, 1.6);
          for (const p of P) {
            ctx.fillStyle = p.c;
            ctx.fillRect(p.x + p.vx * e * dist * 0.5, p.y + p.vy * e * dist * 0.5 + p.fall * e * e * dist * 6, p.s * (1 - 0.5 * k), p.s * (1 - 0.5 * k));
          }
          ctx.globalAlpha = 1;
          root.style.background = `color-mix(in srgb, ${bg} ${Math.round((1 - Math.pow(k, 2)) * 100)}%, transparent)`;
        }
        if (t >= total) { end(); return; }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    run();
  });
}

// Генератор раскладки поля Sequence (запускался один раз, результат вставлен в js/engines/sequence.js).
import { mulberry32 } from '../js/engines/common.js';
const rnd = mulberry32(20261111);
const R = ['2','3','4','5','6','7','8','9','10','Q','K','A'];
const grid = Array.from({ length: 10 }, () => Array(10).fill(null));
for (const [r, c] of [[0,0],[0,9],[9,0],[9,9]]) grid[r][c] = 'F';
const ring = [];
for (let c = 1; c <= 8; c++) ring.push([0, c, R[c - 1] + 'S']);              // сверху: 2..9 пики
for (let r = 1; r <= 8; r++) ring.push([r, 9, ['10S','QS','KS','AS','2D','3D','4D','5D'][r - 1]]);
for (let c = 8; c >= 1; c--) ring.push([9, c, ['6D','7D','8D','9D','10D','QD','KD','AD'][8 - c]]);
for (let r = 8; r >= 1; r--) ring.push([r, 0, ['2C','3C','4C','5C','6C','7C','8C','9C'][8 - r]]);
for (const [r, c, v] of ring) grid[r][c] = v;
const all = [];
for (const s of 'SHDC') for (const r of R) all.push(r + s);
const used = {}; ring.forEach(([, , v]) => (used[v] = (used[v] || 0) + 1));
const pool = [];
for (const v of all) { for (let k = used[v] || 0; k < 2; k++) pool.push(v); }
if (pool.length !== 64) throw new Error('pool ' + pool.length);
const cells = [];
for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) cells.push([r, c]);
const shuf = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
shuf(pool);
cells.forEach(([r, c], i) => (grid[r][c] = pool[i]));
const cost = () => {
  let k = 0;
  const pos = {};
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) { const v = grid[r][c]; if (v === 'F') continue; (pos[v] ||= []).push([r, c]); }
  for (const v in pos) {
    const [a, b] = pos[v];
    const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
    k += d <= 2 ? 100 : d <= 4 ? 20 : d <= 5 ? 5 : 0;
  }
  // одинаковая масть подряд — меньше
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    if (grid[r][c] !== 'F' && grid[r][c + 1] !== 'F' && grid[r][c].slice(-1) === grid[r][c + 1].slice(-1)) k += 0.4;
  }
  return k;
};
let cur = cost();
for (let it = 0; it < 200000; it++) {
  const a = cells[Math.floor(rnd() * 64)], b = cells[Math.floor(rnd() * 64)];
  if (a === b) continue;
  [grid[a[0]][a[1]], grid[b[0]][b[1]]] = [grid[b[0]][b[1]], grid[a[0]][a[1]]];
  const n = cost();
  if (n <= cur || rnd() < Math.exp((cur - n) / (2 * (1 - it / 200000) + 0.01))) cur = n;
  else [grid[a[0]][a[1]], grid[b[0]][b[1]]] = [grid[b[0]][b[1]], grid[a[0]][a[1]]];
}
console.error('cost', cur);
console.log(JSON.stringify(grid.map((row) => row.join(' '))));

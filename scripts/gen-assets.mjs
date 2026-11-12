// Генерирует asset-manifest.json — список файлов для офлайн-кеша service worker.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const dirs = ['js', 'css', 'icons'];
const out = ['index.html', 'manifest.webmanifest'];
const walk = (d) => { for (const f of readdirSync(join(root, d))) { const p = join(d, f); if (statSync(join(root, p)).isDirectory()) walk(p); else out.push(p.split('\\').join('/')); } };
dirs.forEach(walk);
const list = out.filter((p) => !/icon-(1024|256)\.png$/.test(p));
writeFileSync(join(root, 'asset-manifest.json'), JSON.stringify(list, null, 1));
console.log('asset-manifest.json:', list.length, 'files');

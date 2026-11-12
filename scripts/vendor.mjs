// Копирует PeerJS из node_modules в js/vendor, чтобы онлайн работал без CDN (и в десктоп-версии).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'peerjs', 'dist', 'peerjs.min.js');
const dst = join(root, 'js', 'vendor', 'peerjs.min.js');
if (!existsSync(src)) { console.warn('[vendor] peerjs не установлен — будет использован CDN.'); process.exit(0); }
mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log('[vendor] peerjs.min.js скопирован');

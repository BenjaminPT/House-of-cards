// Онлайн: прямые WebRTC-соединения через PeerJS. Комнаты по короткому коду.
import { botStacks } from './tables.js';
import { HostSession, LocalHandle } from './session.js';
import * as store from './store.js';

const PEER_SRC = ['./js/vendor/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PREFIX = 'hoc-v1-';
const PEER_OPTS = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
};

let peerLoading = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('load ' + src)); };
    document.head.appendChild(s);
  });
}
export function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!peerLoading) {
    peerLoading = (async () => {
      for (const src of PEER_SRC) { try { await loadScript(src); if (window.Peer) return window.Peer; } catch { /* следующий */ } }
      peerLoading = null;
      throw new Error('Не удалось загрузить сетевой модуль. Проверьте интернет.');
    })();
  }
  return peerLoading;
}

export const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
export const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[ILO01]/g, (c) => ({ I: '1', L: '1', O: '0', 0: '0', 1: '1' }[c] || c)).slice(0, 5);

const safeSend = (conn, msg) => { try { if (conn && conn.open) conn.send(msg); } catch (e) { console.warn('send fail', e); } };
const clampName = (s) => String(s || 'Игрок').replace(/[<>]/g, '').trim().slice(0, 18) || 'Игрок';

/** Хост комнаты (лобби + игра). События: 'lobby', 'game', 'error'. */
export class Room {
  constructor(gamesByIdFn) {
    this.games = gamesByIdFn; this.peer = null; this.code = null; this.clients = new Map(); // pid → {conn,name,back}
    this.listeners = {}; this.game = 'poker'; this.opts = {}; this.host = null; this.handle = null; this.inGame = false;
    this.me = store.get().id; this.meName = store.get().name; this.meBack = store.get().back;
  }
  on(ev, fn) { (this.listeners[ev] ||= new Set()).add(fn); return () => this.listeners[ev].delete(fn); }
  emit(ev, ...a) { (this.listeners[ev] || []).forEach((f) => f(...a)); }

  async open() {
    const Peer = await loadPeer();
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = genCode();
      try {
        await new Promise((resolve, reject) => {
          const p = new Peer(PREFIX + code, PEER_OPTS);
          const t = setTimeout(() => { p.destroy(); reject(new Error('timeout')); }, 9000);
          p.on('open', () => { clearTimeout(t); this.peer = p; this.code = code; resolve(); });
          p.on('error', (e) => { clearTimeout(t); try { p.destroy(); } catch { /* */ } reject(e); });
        });
        break;
      } catch (e) {
        if (attempt === 5) throw new Error('Не удалось создать комнату (сервер сигналов недоступен).');
      }
    }
    this.peer.on('connection', (conn) => this._onConn(conn));
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch { /* */ } });
    this.peer.on('error', (e) => console.warn('peer error', e.type));
    return this.code;
  }

  roster() {
    return [{ id: this.me, name: this.meName, host: true, back: this.meBack },
      ...[...this.clients].map(([id, c]) => ({ id, name: c.name, back: c.back }))];
  }
  lobbyMsg() {
    return { t: 'lobby', game: this.game, opts: this.opts, code: this.code, players: this.roster().map((p) => ({ id: p.id, name: p.name, host: !!p.host })) };
  }
  pushLobby() {
    const m = this.lobbyMsg();
    for (const c of this.clients.values()) safeSend(c.conn, m);
    this.emit('lobby', m);
  }
  setGame(game, opts = {}) { this.game = game; this.opts = opts; this.pushLobby(); }

  _onConn(conn) {
    let pid = null;
    conn.on('data', (m) => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'join') {
        pid = String(m.pid || '').slice(0, 24);
        if (!pid || pid === this.me) { safeSend(conn, { t: 'err', msg: 'bad-id' }); return; }
        const existing = this.clients.get(pid);
        if (existing) { // переподключение
          try { existing.conn.close(); } catch { /* */ }
          existing.conn = conn; existing.name = clampName(m.name);
          if (this.inGame && this.host) {
            this.host.bots.delete(pid);
            const p = this.host.st.players.find((x) => x.id === pid); if (p) p.bot = false;
            this._bind(pid);
            safeSend(conn, { t: 'start', game: this.game, opts: this.opts, pid, backs: this.host.backs, names: this.host.names });
            this.host.attach(pid, (v) => safeSend(conn, { t: 'view', v }));
          } else safeSend(conn, this.lobbyMsg());
          this.pushLobby(); return;
        }
        const max = this.games(this.game).meta.max;
        if (this.inGame) { safeSend(conn, { t: 'err', msg: 'Игра уже идёт' }); return; }
        if (this.clients.size + 1 >= max) { safeSend(conn, { t: 'err', msg: 'Стол заполнен' }); return; }
        this.clients.set(pid, { conn, name: clampName(m.name), back: this._sanBack(m.back) });
        safeSend(conn, this.lobbyMsg());
        this.pushLobby();
      } else if (m.t === 'act' && pid && this.host) {
        const err = this.host.dispatch(pid, m.a || {});
        if (err) safeSend(conn, { t: 'rej', err });
      } else if (m.t === 'ping') safeSend(conn, { t: 'pong' });
      else if (m.t === 'leave' && pid) this._drop(pid);
    });
    conn.on('close', () => { if (pid) this._drop(pid, conn); });
    conn.on('error', () => { if (pid) this._drop(pid, conn); });
  }
  _bind(pid) { /* место для будущих событий */ }
  _sanBack(b) {
    if (!b || typeof b !== 'object') return null;
    const out = { design: String(b.design || 'diamonds').slice(0, 12), c1: String(b.c1 || ''), c2: String(b.c2 || ''), emblem: String(b.emblem || 'none').slice(0, 10), text: String(b.text || '').slice(0, 3), frame: String(b.frame || 'thin').slice(0, 8) };
    if (b.image && typeof b.image === 'string' && b.image.startsWith('data:image/') && b.image.length < 140000) out.image = b.image;
    return out;
  }
  _drop(pid, conn) {
    const c = this.clients.get(pid);
    if (!c || (conn && c.conn !== conn)) return;
    if (this.inGame && this.host) { this.host.replaceWithBot(pid); this.emit('left', pid, c.name); this.clients.get(pid).conn = null; }
    else { this.clients.delete(pid); this.pushLobby(); }
  }
  kick(pid) { const c = this.clients.get(pid); if (!c) return; safeSend(c.conn, { t: 'kicked' }); try { c.conn.close(); } catch { /* */ } this.clients.delete(pid); this.pushLobby(); }

  /** Старт партии. fillBots — добивать ботами до минимума мест. */
  startGame({ bots = 0 } = {}) {
    const mod = this.games(this.game);
    const humans = this.roster();
    const players = humans.map((p) => ({ id: p.id, name: p.name, bot: false, back: p.back }));
    const target = Math.min(mod.meta.max, Math.max(mod.meta.min, humans.length + bots));
    const names = ['Аврора', 'Макс', 'Ирис', 'Лео', 'Нова', 'Тео'];
    const nb = target - players.length, stacks = this.opts.buyIn ? botStacks(this.game, this.opts.buyIn, nb) : [];
    for (let i = 0; players.length < target; i++) players.push({ id: 'bot' + i, name: names[i % names.length], bot: true, back: null, chips: stacks[i] });
    this.host = new HostSession({ mod, players, opts: { ...this.opts, seed: Math.floor(Math.random() * 2 ** 31) }, online: true, myId: this.me });
    this.inGame = true;
    for (const [pid, c] of this.clients) {
      safeSend(c.conn, { t: 'start', game: this.game, opts: this.opts, pid, backs: this.host.backs, names: this.host.names });
      this.host.attach(pid, (v) => safeSend(c.conn, { t: 'view', v }));
    }
    this.handle = new LocalHandle(this.host, this.me, true);
    this.host.start();
    this.emit('game', this.handle);
    return this.handle;
  }
  endGame() {
    if (this.host) this.host.close();
    this.host = null; this.handle = null; this.inGame = false;
    for (const [pid, c] of [...this.clients]) { if (!c.conn || !c.conn.open) this.clients.delete(pid); }
    for (const c of this.clients.values()) safeSend(c.conn, this.lobbyMsg());
    this.emit('lobby', this.lobbyMsg());
  }
  close() {
    for (const c of this.clients.values()) { safeSend(c.conn, { t: 'closed' }); try { c.conn.close(); } catch { /* */ } }
    if (this.host) this.host.close();
    try { this.peer && this.peer.destroy(); } catch { /* */ }
    this.clients.clear(); this.host = null; this.inGame = false;
  }
}

/** Гость: подключается к комнате по коду. */
export class Guest {
  constructor() { this.listeners = {}; this.peer = null; this.conn = null; this.me = store.get().id; this.view = null; this.cbs = new Set(); this.meta = null; this.closedByUs = false; this.backs = {}; this.names = {}; }
  on(ev, fn) { (this.listeners[ev] ||= new Set()).add(fn); return () => this.listeners[ev].delete(fn); }
  emit(ev, ...a) { (this.listeners[ev] || []).forEach((f) => f(...a)); }

  async join(codeRaw) {
    const code = normCode(codeRaw);
    if (code.length !== 5) throw new Error('Код состоит из 5 символов');
    const Peer = await loadPeer();
    this.peer = await new Promise((resolve, reject) => {
      const p = new Peer(undefined, PEER_OPTS);
      const t = setTimeout(() => { try { p.destroy(); } catch { /* */ } reject(new Error('Сервер сигналов недоступен')); }, 9000);
      p.on('open', () => { clearTimeout(t); resolve(p); });
      p.on('error', (e) => { clearTimeout(t); reject(new Error('Сеть: ' + (e.type || e.message))); });
    });
    this.code = code;
    await new Promise((resolve, reject) => {
      const conn = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      this.conn = conn;
      const t = setTimeout(() => reject(new Error('Комната не отвечает. Проверьте код.')), 12000);
      conn.on('open', () => {
        clearTimeout(t);
        const s = store.get();
        conn.send({ t: 'join', pid: this.me, name: s.name, back: s.back });
        resolve();
      });
      conn.on('data', (m) => this._onMsg(m));
      conn.on('close', () => { if (!this.closedByUs) this.emit('closed'); });
      conn.on('error', () => { clearTimeout(t); reject(new Error('Не удалось соединиться')); });
      this.peer.on('error', (e) => { if (e.type === 'peer-unavailable') { clearTimeout(t); reject(new Error('Комната с таким кодом не найдена')); } });
    });
    this.ping = setInterval(() => { try { this.conn.send({ t: 'ping' }); } catch { /* */ } }, 15000);
  }
  _onMsg(m) {
    if (!m) return;
    if (m.t === 'lobby') { this.meta = m; this.emit('lobby', m); }
    else if (m.t === 'start') { this.backs = m.backs || {}; this.names = m.names || {}; this.emit('start', m); }
    else if (m.t === 'view') { this.view = m.v; this.cbs.forEach((f) => f(m.v)); }
    else if (m.t === 'rej') this.emit('rej', m.err);
    else if (m.t === 'err') this.emit('error', m.msg);
    else if (m.t === 'kicked') this.emit('kicked');
    else if (m.t === 'closed') this.emit('closed');
  }
  // интерфейс как у LocalHandle
  onView(f) { this.cbs.add(f); if (this.view) f(this.view); return () => this.cbs.delete(f); }
  act(a) { try { this.conn.send({ t: 'act', a }); } catch { return 'net'; } return null; }
  onReject(f) { return this.on('rej', f); }
  get online() { return true; }
  setMod(mod) { this.mod = mod; }
  leave() {
    this.closedByUs = true; clearInterval(this.ping);
    try { this.conn && this.conn.send({ t: 'leave' }); } catch { /* */ }
    try { this.conn && this.conn.close(); } catch { /* */ }
    try { this.peer && this.peer.destroy(); } catch { /* */ }
  }
}

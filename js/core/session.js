// Сессия игры. Хост хранит состояние и гоняет движок; клиенты шлют действия.
// Один и тот же код работает офлайн (хост = ты + боты) и онлайн (WebRTC).
import { secureRnd } from '../engines/common.js';

const BOT_THINK = { poker: [900, 1700], blackjack: [650, 1100], sequence: [800, 1500], roulette: [500, 1500], solitaire: [0, 0] };
const TURN_LIMIT_MS = 45000;

export class HostSession {
  /**
   * @param mod игровой модуль, players [{id,name,bot,back?}], opts, online — включает таймеры хода
   */
  constructor({ mod, players, opts = {}, online = false, myId = 'me' }) {
    this.mod = mod; this.online = online; this.myId = myId; this.rnd = secureRnd();
    this.players = players;
    this.backs = Object.fromEntries(players.filter((p) => p.back).map((p) => [p.id, p.back]));
    this.names = Object.fromEntries(players.map((p) => [p.id, p.name]));
    this.st = mod.init(players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot, chips: p.chips })), opts, this.rnd);
    this.bots = new Set(players.filter((p) => p.bot).map((p) => p.id));
    this.sinks = new Map(); // pid → (view)=>void
    this.timers = [];
    this.version = 0;
    this.deadline = null;
    this.closed = false;
    this.listeners = new Set();
  }
  attach(pid, sink) { this.sinks.set(pid, sink); sink(this._view(pid)); }
  detach(pid) { this.sinks.delete(pid); }
  start() { this._after(); }
  _view(pid) {
    const v = this.mod.view(this.st, pid);
    v._v = this.version; v._deadline = this.deadline; v._bots = [...this.bots];
    return v;
  }
  broadcast() {
    this.version++;
    for (const [pid, sink] of this.sinks) { try { sink(this._view(pid)); } catch (e) { console.error(e); } }
  }
  /** Действие игрока (человека или бота). Возвращает код ошибки или null. */
  dispatch(pid, action) {
    if (this.closed) return 'closed';
    const err = this.mod.act(this.st, pid, action, this.rnd);
    if (!err) this._after();
    return err;
  }
  _after() {
    this.timers.forEach(clearTimeout); this.timers = [];
    this.deadline = null;
    this.broadcast();
    if (this.closed) return;
    const auto = this.mod.auto(this.st);
    if (auto) { this.timers.push(setTimeout(() => this._tick(() => this.mod.act(this.st, 'sys', auto.action, this.rnd)), auto.delay)); return; }
    const pend = this.mod.pending(this.st);
    const [lo, hi] = BOT_THINK[this.mod.meta.id] || [700, 1300];
    let k = 0;
    for (const pid of pend) {
      if (this.bots.has(pid)) {
        const d = lo + this.rnd() * (hi - lo) + k * 350; k++;
        this.timers.push(setTimeout(() => this._tick(() => {
          const a = this.mod.bot(this.st, pid, this.rnd);
          return a ? this.mod.act(this.st, pid, a, this.rnd) : 'nothing';
        }), d));
      }
    }
    if (this.online && this.mod.meta.id !== 'solitaire') {
      const humans = pend.filter((p) => !this.bots.has(p));
      if (humans.length) {
        this.deadline = Date.now() + TURN_LIMIT_MS;
        for (const pid of humans) this.timers.push(setTimeout(() => this._tick(() => {
          const a = this.mod.timeoutAction(this.st, pid);
          return a ? this.mod.act(this.st, pid, a, this.rnd) : 'nothing';
        }), TURN_LIMIT_MS));
        this.broadcast(); // чтобы клиенты получили дедлайн
      }
    }
  }
  _tick(fn) {
    if (this.closed) return;
    const err = fn();
    if (!err) { this.errs = 0; this._after(); return; }
    // ошибка бота/таймера не должна подвешивать партию: пробуем ещё несколько раз
    this.errs = (this.errs || 0) + 1;
    if (this.errs < 4) this._after();
  }
  /** Игрок вышел: бот занимает место. */
  replaceWithBot(pid) {
    this.bots.add(pid);
    const p = this.st.players.find((x) => x.id === pid);
    if (p) p.bot = true;
    this.detach(pid);
    this._after();
  }
  humanCount() { return this.st.players.filter((p) => !this.bots.has(p.id)).length; }
  close() { this.closed = true; this.timers.forEach(clearTimeout); this.timers = []; this.sinks.clear(); }
}

/** Единый интерфейс для UI-игр. */
export class LocalHandle {
  constructor(host, me, online = false) {
    this.online = online; this.host = host; this.me = me; this.mod = host.mod; this.view = null; this.cbs = new Set();
    this.backs = host.backs; this.names = host.names;
    host.attach(me, (v) => { this.view = v; this.cbs.forEach((f) => f(v)); });
  }
  onView(f) { this.cbs.add(f); if (this.view) f(this.view); return () => this.cbs.delete(f); }
  act(a) { return this.host.dispatch(this.me, a); }
  onReject() { return () => {}; }
  leave() { this.host.close(); }
}

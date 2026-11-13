// Кошелёк игрока: виртуальные монеты. Реальные деньги подключаются позже через payments.js.
import * as store from './store.js';

export const START_BALANCE = 2000; // единственный бесплатный капитал; дальше монеты покупаются за крипту (позже)
const VERSION = 2;
const MAX_HISTORY = 40;
const subs = new Set();

const state = () => {
  const s = store.get();
  // нет кошелька или он из тестовой версии (v<2, когда пополнение было бесплатным) — выдаём стартовый капитал
  if (!s.wallet || (s.wallet.v || 1) < VERSION) store.set({ wallet: { v: VERSION, balance: START_BALANCE, history: [{ t: Date.now(), k: 'bonus', amount: START_BALANCE, note: 'Стартовый капитал' }] } });
  return store.get().wallet;
};
const commit = (w) => { store.set({ wallet: w }); subs.forEach((f) => f(w.balance)); };

export const balance = () => state().balance;
export const history = () => state().history;
export const onChange = (f) => { subs.add(f); return () => subs.delete(f); };

function push(w, k, amount, note) {
  w.history = [{ t: Date.now(), k, amount, note }, ...w.history].slice(0, MAX_HISTORY);
}

/** Зачисление ПОДТВЕРЖДЁННОЙ покупки (вызывать только после ответа сервера об оплате). */
export function creditPurchase(amount, note = 'Покупка монет') {
  amount = Math.floor(+amount);
  if (!(amount > 0)) throw new Error('bad-amount');
  const w = { ...state() };
  w.balance += amount; push(w, 'deposit', amount, note);
  commit(w); return w.balance;
}
/** Покупка места за столом (buy-in). false — недостаточно средств. */
export function buyIn(amount, note = 'Вход за стол') {
  amount = Math.floor(+amount);
  const w = { ...state() };
  if (!(amount > 0) || amount > w.balance) return false;
  w.balance -= amount; push(w, 'buyin', -amount, note);
  commit(w); return true;
}
/** Возврат остатка стека на баланс при выходе из-за стола. */
export function cashOut(amount, note = 'Выход из-за стола') {
  amount = Math.max(0, Math.floor(+amount) || 0);
  if (!amount) return;
  const w = { ...state() };
  w.balance += amount; push(w, 'cashout', amount, note);
  commit(w);
}

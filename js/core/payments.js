// Платёжный слой. Сейчас — виртуальные монеты. Реальный приём криптовалюты (coinso) подключается здесь же.
//
// Как подключить реальный провайдер позже:
//  1. Ключи и подпись запросов живут ТОЛЬКО на сервере (в браузер их класть нельзя).
//  2. Клиент вызывает createInvoice() → сервер создаёт счёт у провайдера и возвращает { id, url }.
//  3. Провайдер присылает webhook на сервер; сервер проверяет подпись и начисляет баланс.
//  4. Клиент опрашивает status(id) и после 'paid' обновляет кошелёк.
// До появления сервера этот провайдер помечен enabled:false.
import * as wallet from './wallet.js';

export const AMOUNTS = [500, 1000, 5000, 10000, 50000, 100000];
export const MIN_DEPOSIT = 100;
export const MAX_DEPOSIT = 10_000_000;

export const PROVIDERS = [
  {
    id: 'virtual', name: 'Виртуальные монеты', hint: 'Мгновенно, без реальных денег', enabled: true,
    async createInvoice(amount) { wallet.deposit(amount, 'Пополнение · виртуальные монеты'); return { id: 'virt-' + Date.now(), status: 'paid' }; },
  },
  {
    id: 'coinso', name: 'Криптовалюта · coinso', hint: 'Реальные платежи подключим позже', enabled: false,
    async createInvoice() { throw new Error('provider-disabled'); },
  },
];

export const provider = (id) => PROVIDERS.find((p) => p.id === id);

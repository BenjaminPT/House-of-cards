// Платёжный слой. Покупка монет за криптовалюту (coinso) ещё не подключена: PURCHASES_ENABLED = false.
// Интерфейс и механика готовы — включение сводится к реализации createInvoice/status на сервере.
//
// Как подключить:
//  1. Ключи и подпись запросов живут ТОЛЬКО на сервере (в браузер их класть нельзя).
//  2. createInvoice(pack): клиент просит сервер создать счёт у провайдера → { id, url }; открываем url.
//  3. Провайдер присылает webhook на сервер, сервер проверяет подпись и увеличивает баланс игрока.
//  4. Клиент опрашивает status(id); на 'paid' вызывает wallet.creditPurchase(pack.coins) (или читает баланс с сервера).
import * as wallet from './wallet.js';

export const PURCHASES_ENABLED = false;

// Пакеты монет (цены появятся вместе с провайдером)
export const PACKS = [
  { id: 'p1', coins: 5000, tag: '' },
  { id: 'p2', coins: 10000, tag: '' },
  { id: 'p3', coins: 25000, tag: 'Популярный' },
  { id: 'p4', coins: 50000, tag: '' },
  { id: 'p5', coins: 100000, tag: '' },
  { id: 'p6', coins: 250000, tag: 'Выгодно' },
];

export const PROVIDERS = [
  { id: 'coinso', name: 'Криптовалюта · coinso', hint: 'USDT и другие монеты', enabled: PURCHASES_ENABLED },
];

export async function createInvoice(pack, providerId = 'coinso') {
  if (!PURCHASES_ENABLED) throw new Error('purchases-disabled');
  // TODO: POST /api/invoices { pack: pack.id, provider: providerId } → { id, url }
  throw new Error('not-implemented');
}
export async function status(/* invoiceId */) {
  if (!PURCHASES_ENABLED) throw new Error('purchases-disabled');
  // TODO: GET /api/invoices/:id → { status: 'pending' | 'paid' | 'expired' }
  throw new Error('not-implemented');
}
export const credit = (pack) => wallet.creditPurchase(pack.coins, 'Покупка монет · криптовалюта');

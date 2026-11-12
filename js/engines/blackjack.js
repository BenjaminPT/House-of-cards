// 21 (Blackjack): несколько игроков против дилера. Чистая state-машина.
import { newDeck, shuffle } from './common.js';

export const meta = {
  id: 'blackjack', name: '21', min: 1, max: 5,
  desc: 'Блэкджек против дилера: удвоение, сплит, ставки.',
};
const START = 1000;
const MIN_BET = 10;
const val = (r) => (r === 'A' ? 11 : ['J', 'Q', 'K'].includes(r) ? 10 : +r);

export function total(cards) {
  let t = 0, aces = 0;
  for (const c of cards) {
    if (c.h) continue;
    t += val(c.r);
    if (c.r === 'A') aces++;
  }
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return { t, soft: aces > 0 };
}

function draw(st, rnd) {
  if (!st.shoe.length) st.shoe = shuffle(newDeck(6), rnd);
  return { ...st.shoe.pop(), i: st.seq++ };
}

export function init(players, opts = {}, rnd = Math.random) {
  const st = {
    game: 'blackjack', phase: 'bet', round: 0, seq: 0, shoe: shuffle(newDeck(6), rnd),
    players: players.map((p) => ({
      id: p.id, name: p.name, bot: !!p.bot, chips: START, bet: 0, lastBet: 50,
      ready: false, next: false, hands: [], active: 0, delta: 0,
    })),
    dealer: { cards: [] }, holeUp: false, turn: -1, order: [], ds: 0, dealerBJ: false,
  };
  for (const p of st.players) p.bet = Math.min(p.lastBet, p.chips);
  return st;
}

const eligible = (p) => p.chips >= MIN_BET || p.bet >= MIN_BET;
const bust = (h) => total(h.cards).t > 21;
const isNatural = (h) => h.cards.length === 2 && !h.fromSplit && total(h.cards).t === 21;

function maybeStart(st) {
  const el = st.players.filter(eligible);
  if (!el.length || !el.every((p) => p.ready)) return;
  st.phase = 'deal';
  st.round++;
  st.holeUp = false;
  st.dealerBJ = false;
  st.dealer.cards = [];
  st.order = [];
  const seats = [];
  st.players.forEach((p, idx) => {
    if (p.ready && p.bet >= MIN_BET) {
      p.chips -= p.bet;
      p.lastBet = p.bet;
      p.delta = -p.bet;
      p.hands = [{ cards: [], bet: p.bet, done: false, doubled: false, fromSplit: false, aces: false, result: null }];
      p.active = 0;
      seats.push(idx);
    } else { p.hands = []; p.delta = 0; }
  });
  for (let k = 0; k < 2; k++) { for (const s of seats) st.order.push(s); st.order.push('D'); }
  st.ds = 0;
}

function afterDeal(st) {
  st.players.forEach((p) => p.hands.forEach((h) => { if (isNatural(h)) h.done = true; }));
  const up = st.dealer.cards[0], hole = st.dealer.cards[1];
  const peek = val(up.r) >= 10;
  if (peek && total([up, hole]).t === 21) { st.dealerBJ = true; st.phase = 'dealer'; st.turn = -1; return; }
  st.turn = -1;
  st.phase = 'play';
  advance(st, true);
}

// Переходит к следующей руке, требующей действия; иначе — к дилеру.
function advance(st, fromStart, rnd = Math.random) {
  let seat = st.turn;
  if (fromStart) seat = -1;
  for (;;) {
    if (seat >= 0) {
      const p = st.players[seat];
      while (p.active < p.hands.length && p.hands[p.active].done) p.active++;
      if (p.active < p.hands.length) {
        const h = p.hands[p.active];
        if (h.cards.length === 1) { // вторая карта после сплита
          h.cards.push(draw(st, rnd));
          if (h.aces || total(h.cards).t === 21) { h.done = true; continue; }
        }
        st.turn = seat;
        return;
      }
    }
    seat++;
    while (seat < st.players.length && !st.players[seat].hands.length) seat++;
    if (seat >= st.players.length) { st.turn = -1; st.phase = 'dealer'; return; }
  }
}

function settle(st) {
  const d = total(st.dealer.cards).t;
  for (const p of st.players) {
    let back = 0;
    for (const h of p.hands) {
      const t = total(h.cards).t;
      let res;
      if (isNatural(h)) {
        if (st.dealerBJ) { res = 'push'; back += h.bet; }
        else { res = 'blackjack'; back += h.bet + Math.floor(h.bet * 1.5); }
      } else if (t > 21) res = 'bust';
      else if (st.dealerBJ) res = 'lose';
      else if (d > 21 || t > d) { res = 'win'; back += h.bet * 2; }
      else if (t === d) { res = 'push'; back += h.bet; }
      else res = 'lose';
      h.result = res;
    }
    p.chips += back;
    p.delta = back - p.hands.reduce((a, h) => a + h.bet, 0);
  }
  st.phase = 'done';
  for (const p of st.players) p.next = false;
}

function resetRound(st, rnd) {
  st.phase = 'bet';
  st.dealer = { cards: [] };
  st.holeUp = false;
  st.dealerBJ = false;
  st.turn = -1;
  if (st.shoe.length < 80) st.shoe = shuffle(newDeck(6), rnd);
  for (const p of st.players) {
    p.hands = []; p.ready = false; p.next = false; p.delta = 0; p.active = 0;
    p.bet = Math.min(p.lastBet, p.chips);
    if (p.bet < MIN_BET) p.bet = 0;
  }
}

export function act(st, pid, a, rnd = Math.random) {
  if (pid === 'sys') {
    if (a.t === 'dealStep' && st.phase === 'deal') {
      const who = st.order[st.ds++];
      const card = draw(st, rnd);
      if (who === 'D') st.dealer.cards.push(card); else st.players[who].hands[0].cards.push(card);
      if (st.ds >= st.order.length) afterDeal(st);
      return null;
    }
    if (a.t === 'dealerStep' && st.phase === 'dealer') {
      if (!st.holeUp) { st.holeUp = true; return null; }
      const live = st.players.some((p) => p.hands.some((h) => !bust(h) && !isNatural(h)));
      if (!st.dealerBJ && live && total(st.dealer.cards).t < 17) st.dealer.cards.push(draw(st, rnd));
      else settle(st);
      return null;
    }
    return 'bad-sys';
  }
  const p = st.players.find((x) => x.id === pid);
  if (!p) return 'no-player';
  switch (a.t) {
    case 'bet': {
      if (st.phase !== 'bet' || p.ready) return 'locked';
      const amt = Math.floor(+a.amount);
      if (!(amt >= 0 && amt <= p.chips)) return 'bad-amount';
      p.bet = amt;
      return null;
    }
    case 'ready':
      if (st.phase !== 'bet' || p.ready || p.bet < MIN_BET) return 'cannot';
      p.ready = true; maybeStart(st); return null;
    case 'unready':
      if (st.phase !== 'bet') return 'cannot';
      p.ready = false; return null;
    case 'rebuy':
      if (st.phase !== 'bet' || p.chips >= MIN_BET || p.ready) return 'cannot';
      p.chips = START; p.bet = Math.min(p.lastBet, p.chips); return null;
    case 'next':
      if (st.phase !== 'done' || p.next) return 'cannot';
      p.next = true;
      if (st.players.every((x) => x.next)) resetRound(st, rnd);
      return null;
    case 'hit': case 'stand': case 'double': case 'split': {
      if (st.phase !== 'play' || st.turn < 0 || st.players[st.turn] !== p) return 'not-your-turn';
      const h = p.hands[p.active];
      if (a.t === 'hit') {
        h.cards.push(draw(st, rnd));
        const t = total(h.cards).t;
        if (t >= 21) h.done = true;
      } else if (a.t === 'stand') h.done = true;
      else if (a.t === 'double') {
        if (h.cards.length !== 2 || p.chips < h.bet) return 'cannot';
        p.chips -= h.bet; h.bet *= 2; h.doubled = true;
        h.cards.push(draw(st, rnd)); h.done = true;
      } else {
        if (h.cards.length !== 2 || val(h.cards[0].r) !== val(h.cards[1].r) || p.chips < h.bet || p.hands.length >= 4) return 'cannot';
        p.chips -= h.bet;
        const second = h.cards.pop();
        const aces = h.cards[0].r === 'A';
        h.fromSplit = true; h.aces = aces;
        const nh = { cards: [second], bet: h.bet, done: false, doubled: false, fromSplit: true, aces, result: null };
        p.hands.splice(p.active + 1, 0, nh);
        h.cards.push(draw(st, rnd));
        if (aces || total(h.cards).t === 21) h.done = true;
      }
      advance(st, false, rnd);
      return null;
    }
    default: return 'unknown';
  }
}

export function canDouble(p, h) { return h.cards.length === 2 && p.chips >= h.bet; }
export function canSplit(p, h) {
  return h.cards.length === 2 && val(h.cards[0].r) === val(h.cards[1].r) && p.chips >= h.bet && p.hands.length < 4;
}

export function pending(st) {
  if (st.phase === 'bet') return st.players.filter((p) => !p.ready).map((p) => p.id);
  if (st.phase === 'done') return st.players.filter((p) => !p.next).map((p) => p.id);
  if (st.phase === 'play' && st.turn >= 0) return [st.players[st.turn].id];
  return [];
}

export function auto(st) {
  if (st.phase === 'deal') return { delay: 320, action: { t: 'dealStep' } };
  if (st.phase === 'dealer') return { delay: 800, action: { t: 'dealerStep' } };
  return null;
}

export function timeoutAction(st, pid) {
  if (st.phase === 'bet') {
    const p = st.players.find((x) => x.id === pid);
    return p.bet >= MIN_BET ? { t: 'ready' } : p.chips >= MIN_BET ? { t: 'bet', amount: MIN_BET } : { t: 'rebuy' };
  }
  if (st.phase === 'done') return { t: 'next' };
  return { t: 'stand' };
}

export function view(st, pid) {
  const v = JSON.parse(JSON.stringify({ ...st, shoe: undefined, order: undefined }));
  v.shoeLeft = st.shoe.length;
  if (!st.holeUp && v.dealer.cards[1]) v.dealer.cards[1] = { i: v.dealer.cards[1].i, h: 1 };
  v.dealerTotal = total(v.dealer.cards.filter((c) => !c.h)).t;
  v.me = pid;
  return v;
}

export function bot(st, pid, rnd = Math.random) {
  const p = st.players.find((x) => x.id === pid);
  if (!p) return null;
  if (st.phase === 'bet') {
    if (p.ready) return null;
    if (p.chips < MIN_BET && p.bet < MIN_BET) return { t: 'rebuy' };
    // ставка детерминирована (раунд + место), иначе бот бесконечно «перекладывает» фишки
    const idx = st.players.indexOf(p);
    const frac = 0.03 + (((st.round * 7 + idx * 5) % 9) / 100);
    const want = Math.max(MIN_BET, Math.min(p.chips, Math.round((p.chips * frac) / 10) * 10));
    if (p.bet !== want) return { t: 'bet', amount: want };
    return { t: 'ready' };
  }
  if (st.phase === 'done') return p.next ? null : { t: 'next' };
  if (st.phase !== 'play' || st.turn < 0 || st.players[st.turn] !== p) return null;
  const h = p.hands[p.active];
  const { t, soft } = total(h.cards);
  const up = val(st.dealer.cards[0].r);
  if (canSplit(p, h)) {
    const r = val(h.cards[0].r);
    if (r === 11 || r === 8 || (r <= 9 && r >= 6 && up <= 6 && r !== 6) || ((r === 2 || r === 3 || r === 7) && up <= 7)) return { t: 'split' };
  }
  if (canDouble(p, h)) {
    if (!soft && (t === 11 || (t === 10 && up <= 9) || (t === 9 && up >= 3 && up <= 6))) return { t: 'double' };
    if (soft && t >= 13 && t <= 17 && up >= 4 && up <= 6) return { t: 'double' };
  }
  if (soft) return t >= 19 || (t === 18 && up <= 8) ? { t: 'stand' } : { t: 'hit' };
  if (t >= 17) return { t: 'stand' };
  if (t >= 13) return up <= 6 ? { t: 'stand' } : { t: 'hit' };
  if (t === 12) return up >= 4 && up <= 6 ? { t: 'stand' } : { t: 'hit' };
  return { t: 'hit' };
}


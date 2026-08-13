// Shared logic for the bot strategies described in specs/bots.md: swap
// enumeration, randomized [lo-hi] rolls, opponent-adjacency discovery,
// and the incomplete-hand scoring rules Regular and Difficult use to
// judge whether a card would help a neighbor.

import type { Card, Suit } from "../card/card.ts";
import { rankValue } from "../card/card.ts";
import { score } from "../card/score.ts";
import type { Action, Hand, PlayerView, PublicTurn } from "../game/types.ts";
import type { Rng } from "../rng.ts";

export interface CandidateSwap {
  potIdx: number;
  handIdx: number;
  score: number;
}

// candidateSwaps enumerates the resulting hand score for every possible
// pot/hand card swap, in pot-major/hand-minor order.
export function candidateSwaps(v: PlayerView): CandidateSwap[] {
  const swaps: CandidateSwap[] = [];
  for (let potIdx = 0; potIdx < 3; potIdx++) {
    for (let handIdx = 0; handIdx < 3; handIdx++) {
      const hand = [...v.hand] as [Card, Card, Card];
      hand[handIdx] = v.pot[potIdx] as Card;
      swaps.push({ potIdx, handIdx, score: score(hand) });
    }
  }
  return swaps;
}

// bestSwaps returns every candidate swap tied for the highest resulting
// score, in candidateSwaps' order.
export function bestSwaps(v: PlayerView): CandidateSwap[] {
  const swaps = candidateSwaps(v);
  const best = Math.max(...swaps.map((s) => s.score));
  return swaps.filter((s) => s.score === best);
}

// bestImprovingSwap returns the candidate swap that most improves the
// hand (specs/bots.md: "to improve the hand is to increase the score
// value of the hand"), breaking ties toward the lowest (potIdx, handIdx)
// pair. Returns undefined if no swap improves on the current score.
export function bestImprovingSwap(v: PlayerView): CandidateSwap | undefined {
  const current = score(v.hand);
  const improving = candidateSwaps(v).filter((s) => s.score > current);
  if (improving.length === 0) {
    return undefined;
  }
  const best = Math.max(...improving.map((s) => s.score));
  return improving.find((s) => s.score === best);
}

// resultingScore returns the score the hand would have after taking
// action, without mutating v.
export function resultingScore(v: PlayerView, action: Action): number {
  if (action.type === "knock") {
    return score(v.hand);
  }
  if (action.type === "exchange") {
    return score(v.pot);
  }
  const hand = [...v.hand] as Hand;
  hand[action.handIndex] = v.pot[action.potIndex] as Card;
  return score(hand);
}

// unnecessaryIndices returns the hand indices of cards not contributing
// to the hand's score value (specs/bots.md's "unnecessary" card): every
// card outside whichever suit (or suits, if tied) sums to the hand's
// score. A same-rank trio (30.5, or 32 for aces) has no unnecessary
// cards, since every card is part of what earns that score.
export function unnecessaryIndices(hand: Hand): number[] {
  const [a, b, c] = hand;
  if (a.rank === b.rank && b.rank === c.rank) {
    return [];
  }
  const sums = new Map<Suit, number>();
  for (const card of hand) {
    sums.set(card.suit, (sums.get(card.suit) ?? 0) + rankValue(card.rank));
  }
  const best = Math.max(...sums.values());
  return hand.reduce<number[]>((acc, card, i) => {
    if ((sums.get(card.suit) ?? 0) !== best) {
      acc.push(i);
    }
    return acc;
  }, []);
}

// choosePairMaker looks for a pot card that would give an unnecessary
// hand card's slot a rank matching some other card already in hand
// (specs/bots.md: "Trade an unnecessary card for one that makes a
// pair"), preferring the lowest (potIdx, handIdx) pair among unnecessary
// indices in the order given.
export function choosePairMaker(v: PlayerView, unnecessary: readonly number[]): { potIdx: number; handIdx: number } | undefined {
  for (let potIdx = 0; potIdx < 3; potIdx++) {
    const rank = (v.pot[potIdx] as Card).rank;
    for (const handIdx of unnecessary) {
      const others = [0, 1, 2].filter((i) => i !== handIdx);
      if (others.some((i) => (v.hand[i] as Card).rank === rank)) {
        return { potIdx, handIdx };
      }
    }
  }
  return undefined;
}

// chooseFavorableBySuit implements Regular's "Trade an unnecessary card
// for a favorable one": a favorable pot card isn't collectingSuit; among
// favorable candidates, one matching discardedSuit is more favorable.
// Returns undefined (bullet doesn't apply) with no unnecessary card, no
// favorable pot card, or collectingSuit not known yet.
export function chooseFavorableBySuit(
  v: PlayerView,
  unnecessary: readonly number[],
  collectingSuit: Suit | undefined,
  discardedSuit: Suit | undefined,
): { potIdx: number; handIdx: number } | undefined {
  if (unnecessary.length === 0 || collectingSuit === undefined) {
    return undefined;
  }
  const favorable = [0, 1, 2].filter((p) => (v.pot[p] as Card).suit !== collectingSuit);
  if (favorable.length === 0) {
    return undefined;
  }
  const moreFavorable = discardedSuit !== undefined ? favorable.filter((p) => (v.pot[p] as Card).suit === discardedSuit) : [];
  const chosen = moreFavorable.length > 0 ? moreFavorable : favorable;
  return { potIdx: Math.min(...chosen), handIdx: Math.min(...unnecessary) };
}

// chooseSafeBySuit implements Regular's "Trade a safe card for a random
// card": a safe hand card isn't collectingSuit. Returns undefined if
// collectingSuit isn't known yet, or no hand card qualifies.
export function chooseSafeBySuit(v: PlayerView, collectingSuit: Suit | undefined): number | undefined {
  if (collectingSuit === undefined) {
    return undefined;
  }
  const safe = [0, 1, 2].filter((i) => (v.hand[i] as Card).suit !== collectingSuit);
  return safe.length > 0 ? Math.min(...safe) : undefined;
}

// partialScore is score() generalized to fewer than 3 known cards, per
// specs/bots.md: "When computing the score of an incomplete hand (fewer
// than 3 known cards), unknown cards count as zero value and match no
// suit." With all 3 known, this is exactly score() (pair/trip bonuses
// apply); with fewer, it's simply the highest same-suit sum among what's
// known.
export function partialScore(cards: readonly Card[]): number {
  if (cards.length === 0) {
    return 0;
  }
  if (cards.length === 3) {
    return score(cards as [Card, Card, Card]);
  }
  const sums = new Map<Suit, number>();
  for (const c of cards) {
    sums.set(c.suit, (sums.get(c.suit) ?? 0) + rankValue(c.rank));
  }
  return Math.max(...sums.values());
}

// improvesKnownHand reports whether giving candidate to a seat known to
// hold `known` cards (0-3 of them) could increase their partialScore --
// trying every slot the card could occupy, including a still-unknown
// one. With zero known cards this is always true (any card beats
// nothing), which is exactly what lets favorable/safe callers treat "no
// information" as "skip this preference" without a special case.
export function improvesKnownHand(known: readonly Card[], candidate: Card): boolean {
  const current = partialScore(known);
  if (known.length < 3) {
    return partialScore([...known, candidate]) > current;
  }
  for (let i = 0; i < 3; i++) {
    const trial = known.slice();
    trial[i] = candidate;
    if (partialScore(trial) > current) {
      return true;
    }
  }
  return false;
}

// chooseFavorableByKnownHand implements Difficult's "Trade an
// unnecessary card for a favorable one": a favorable pot card is one
// that does not improve known (specs/bots.md). With known empty,
// improvesKnownHand is always true, so nothing reads as favorable and
// this naturally falls through -- exactly "no information, skip this
// case" without a separate check.
export function chooseFavorableByKnownHand(
  v: PlayerView,
  unnecessary: readonly number[],
  known: readonly Card[],
): { potIdx: number; handIdx: number } | undefined {
  if (unnecessary.length === 0) {
    return undefined;
  }
  const favorable = [0, 1, 2].filter((p) => !improvesKnownHand(known, v.pot[p] as Card));
  if (favorable.length === 0) {
    return undefined;
  }
  return { potIdx: Math.min(...favorable), handIdx: Math.min(...unnecessary) };
}

// chooseSafeByKnownHand implements Difficult's "Trade a safe card for a
// random card": a safe hand card is one that does not improve known.
// Same "no information" fallthrough as chooseFavorableByKnownHand.
export function chooseSafeByKnownHand(v: PlayerView, known: readonly Card[]): number | undefined {
  const safe = [0, 1, 2].filter((i) => !improvesKnownHand(known, v.hand[i] as Card));
  return safe.length > 0 ? Math.min(...safe) : undefined;
}

// dominantSuit returns whichever suit sums highest among cards (ties
// break toward the first card's suit encountered). Used to collapse an
// exchange's 3 given/taken cards down to "the" suit for Regular's
// last-suit-took/discarded tracking, the same way a single-card trade
// already yields one unambiguous suit.
export function dominantSuit(cards: readonly Card[]): Suit {
  const sums = new Map<Suit, number>();
  for (const c of cards) {
    sums.set(c.suit, (sums.get(c.suit) ?? 0) + rankValue(c.rank));
  }
  let best = (cards[0] as Card).suit;
  let bestVal = -Infinity;
  for (const [suit, val] of sums) {
    if (val > bestVal) {
      bestVal = val;
      best = suit;
    }
  }
  return best;
}

// randInt returns a pseudo-random integer in [lo, hi], inclusive, per
// specs/bots.md's "[18-20]" notation.
export function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + rng.intn(hi - lo + 1);
}

// applyKnownCards replays a single PublicTurn against a seat's
// known-held cards: each given card is removed (if it was known) and
// each taken card is added. A knock changes nothing; an exchange's
// given/taken always cover the seat's entire hand, so this naturally
// leaves exactly the 3 taken cards known regardless of what was known
// before.
export function applyKnownCards(known: readonly Card[], turn: PublicTurn): Card[] {
  let cards = known.slice();
  for (const given of turn.given) {
    cards = cards.filter((c) => !(c.rank === given.rank && c.suit === given.suit));
  }
  return [...cards, ...turn.taken];
}

// applyPublicTurn updates held -- a per-seat map of the cards currently
// known to be in that seat's hand -- with a newly-observed PublicTurn.
//
// held.get(seat)?.length === 3 is exactly "this seat's hand is fully
// known" -- not a turn-count heuristic, since a seat can re-trade the
// same hand slot indefinitely without ever revealing the other two.
export function applyPublicTurn(held: Map<number, Card[]>, turn: PublicTurn): void {
  held.set(turn.seat, applyKnownCards(held.get(turn.seat) ?? [], turn));
}

// NeighborSnapshot is a NeighborTracker's discovered adjacency and last
// observed turn, per its own snapshot()/restore().
export interface NeighborSnapshot {
  upstreamSeat: number | undefined;
  downstreamSeat: number | undefined;
  lastTurn: PublicTurn | undefined;
}

// NeighborTracker discovers a seat's upstream (the seat that acts
// immediately before it) and downstream (the seat that acts immediately
// after it) neighbors purely from the live sequence of PublicTurns --
// seats can be sparse (an eliminated seat is simply absent), so no
// static seat arithmetic is reliable.
//
// configure supplies the callbacks once, up front (a bot's tracking
// logic doesn't change turn to turn). setOwnSeat must then be called
// every decide() -- a Strategy only learns its own seat from
// PlayerView, which observe() is never given -- and is also where
// upstream gets discovered: it has to happen there, not the first time
// the bot's own turn is later observe()'d, since that broadcast only
// arrives after decide() has already returned and would be one turn
// too late to inform the decision it's meant to help with.
export class NeighborTracker {
  upstreamSeat: number | undefined;
  downstreamSeat: number | undefined;
  private ownSeat: number | undefined;
  private lastTurn: PublicTurn | undefined;
  private onUpstream: (t: PublicTurn) => void = () => {};
  private onDownstream: (t: PublicTurn) => void = () => {};

  configure(onUpstream: (t: PublicTurn) => void, onDownstream: (t: PublicTurn) => void): void {
    this.onUpstream = onUpstream;
    this.onDownstream = onDownstream;
  }

  // snapshot/restore capture and reapply discovered adjacency and turn
  // history -- everything reset() clears -- so a strategy can be torn
  // down and rebuilt (e.g. across a page reload, specs/state.md)
  // without losing what it had already discovered this round.
  snapshot(): NeighborSnapshot {
    return { upstreamSeat: this.upstreamSeat, downstreamSeat: this.downstreamSeat, lastTurn: this.lastTurn };
  }

  restore(s: NeighborSnapshot): void {
    this.upstreamSeat = s.upstreamSeat;
    this.downstreamSeat = s.downstreamSeat;
    this.lastTurn = s.lastTurn;
  }

  setOwnSeat(seat: number): void {
    this.ownSeat = seat;
    if (this.upstreamSeat === undefined && this.lastTurn !== undefined && this.lastTurn.seat !== seat) {
      this.upstreamSeat = this.lastTurn.seat;
      this.onUpstream(this.lastTurn);
    }
  }

  // reset clears discovered adjacency and turn history for a new round
  // -- adjacency can change round to round if a neighbor is eliminated
  // -- but keeps the remembered own seat and configured callbacks,
  // neither of which changes round to round.
  reset(): void {
    this.upstreamSeat = undefined;
    this.downstreamSeat = undefined;
    this.lastTurn = undefined;
  }

  observe(turn: PublicTurn): void {
    if (this.ownSeat !== undefined && turn.seat !== this.ownSeat) {
      if (this.downstreamSeat === undefined && this.lastTurn?.seat === this.ownSeat) {
        this.downstreamSeat = turn.seat;
      }
      if (turn.seat === this.upstreamSeat) {
        this.onUpstream(turn);
      }
      if (turn.seat === this.downstreamSeat) {
        this.onDownstream(turn);
      }
    }
    this.lastTurn = turn;
  }
}

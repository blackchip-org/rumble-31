// Shared logic for the bot strategies described in specs/bots.md: swap
// enumeration, randomized [lo-hi] rolls, opponent-adjacency discovery,
// and the incomplete-hand scoring rules Advanced and Expert use to
// judge whether a card would help a neighbor.

import type { Card, Suit } from "../card/card.ts";
import { rankValue } from "../card/card.ts";
import { score } from "../card/score.ts";
import type { Action, Hand, PlayerView, PublicTurn } from "../game/types.ts";
import { exchange, knock, trade } from "../game/types.ts";
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

// bestImprovingSwapDenying is bestImprovingSwap, but among swaps tied
// for the best improving score, prefers one whose pot card would also
// improve upstream's known hand (denying it to upstream on their next
// turn) over one that wouldn't -- falling back to bestImprovingSwap's
// own lowest-(potIdx, handIdx) tie-break within whichever subset applies.
export function bestImprovingSwapDenying(v: PlayerView, upstreamKnown: readonly Card[]): CandidateSwap | undefined {
  const current = score(v.hand);
  const improving = candidateSwaps(v).filter((s) => s.score > current);
  if (improving.length === 0) {
    return undefined;
  }
  const best = Math.max(...improving.map((s) => s.score));
  const tied = improving.filter((s) => s.score === best);
  const denying = tied.filter((s) => improvesKnownHand(upstreamKnown, v.pot[s.potIdx] as Card));
  return (denying[0] ?? tied[0]) as CandidateSwap;
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

// allDifferentSuits reports whether a hand's three cards each belong
// to a distinct suit -- the weakest possible hand shape, since no two
// cards can share a suit to sum together (specs/bots.md, Novice's
// first-turn take-pot-or-keep rule).
export function allDifferentSuits(hand: Hand): boolean {
  return new Set(hand.map((c) => c.suit)).size === 3;
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

// chooseFavorableBySuit implements Advanced's "Trade an unnecessary card
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

// chooseSafeBySuit implements Advanced's "Trade a safe card for a random
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

// hasConfirmedEdge reports whether the hand's current score already
// beats a fully-known neighbor's exact score (per applyPublicTurn's
// "3 known cards means fully known" convention) by at least margin.
// Unlike the stagnation bullet's [3-5]-turn wait -- which is guessing
// whether the hand is likely to still be ahead once the round ends --
// this is a confirmed, not probabilistic, edge: there's nothing left to
// discover about a fully-known neighbor's score, so no wait is needed.
export function hasConfirmedEdge(v: PlayerView, upstreamKnown: readonly Card[], downstreamKnown: readonly Card[], margin: number): boolean {
  const handScore = score(v.hand);
  const beats = (known: readonly Card[]) => known.length === 3 && handScore - score(known as [Card, Card, Card]) >= margin;
  return beats(upstreamKnown) || beats(downstreamKnown);
}

// downstreamRiskAdjustedKnockScore lowers the score-threshold-knock bar
// by discount once downstream's known (possibly incomplete) hand gets
// within margin points of knockScore itself -- downstream is already
// dangerous regardless of how much longer the hand is developed, so
// locking in a slightly lower score sooner beats risking downstream
// knocking first. Returns knockScore unchanged with nothing known yet
// about downstream, or when they're not yet a close threat.
export function downstreamRiskAdjustedKnockScore(downstreamKnown: readonly Card[], knockScore: number, margin: number, discount: number): number {
  if (downstreamKnown.length === 0 || partialScore(downstreamKnown) < knockScore - margin) {
    return knockScore;
  }
  return knockScore - discount;
}

// chooseDenialTrade implements Expert's denial trade: when no swap
// would improve the bot's own hand, but some pot card would improve
// upstream's known hand, trade an unnecessary hand card for it anyway
// -- purely to keep it away from upstream, not because it helps the
// bot. Prefers the lowest (potIdx, handIdx) match, matching the other
// trade-selection helpers' tie-break convention. Returns undefined if
// there's no unnecessary card to spare, upstream isn't known yet
// (improvesKnownHand is vacuously true with nothing known, which would
// otherwise "deny" every card for no real reason), or no pot card would
// actually help upstream.
export function chooseDenialTrade(
  v: PlayerView,
  unnecessary: readonly number[],
  upstreamKnown: readonly Card[],
): { potIdx: number; handIdx: number } | undefined {
  if (unnecessary.length === 0 || upstreamKnown.length === 0) {
    return undefined;
  }
  const denying = [0, 1, 2].filter((p) => improvesKnownHand(upstreamKnown, v.pot[p] as Card));
  if (denying.length === 0) {
    return undefined;
  }
  return { potIdx: Math.min(...denying), handIdx: Math.min(...unnecessary) };
}

// chooseFavorableByKnownHand implements Expert's "Trade an
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

// chooseSafeByKnownHand implements Expert's "Trade a safe card for a
// random card": a safe hand card is one that does not improve known.
// Same "no information" fallthrough as chooseFavorableByKnownHand.
export function chooseSafeByKnownHand(v: PlayerView, known: readonly Card[]): number | undefined {
  const safe = [0, 1, 2].filter((i) => !improvesKnownHand(known, v.hand[i] as Card));
  return safe.length > 0 ? Math.min(...safe) : undefined;
}

// dominantSuit returns whichever suit sums highest among cards (ties
// break toward the first card's suit encountered). Used to collapse an
// exchange's 3 given/taken cards down to "the" suit for Advanced's
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

// chance reports true with the given probability (0-1), per specs/bots.md's
// coin-flip bullets -- e.g. Advanced only sometimes acting on a pair-maker
// hit rather than always taking it.
export function chance(rng: Rng, probability: number): boolean {
  return rng.next() < probability;
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

// bestLastTurnAction implements the last-turn bullet shared by Advanced
// and Expert (specs/bots.md): with another player already having
// knocked, there's no more hand to develop before the round ends, so
// the only goal left is the best score reachable this turn. Compares
// the hand's own score (knock), the whole pot (exchange), and the best
// single-card swap, preferring knock and then exchange on a tie.
export function bestLastTurnAction(v: PlayerView): Action {
  const handScore = score(v.hand);
  const potScore = score(v.pot);
  const bestTrade = bestSwaps(v)[0] as CandidateSwap;

  if (handScore >= potScore && handScore >= bestTrade.score) {
    return knock();
  }
  if (potScore >= bestTrade.score) {
    return exchange();
  }
  return trade(bestTrade.potIdx, bestTrade.handIdx);
}

// BestScoreState is a bot's "best score and turn" tracking (specs/bots.md:
// reset to 0 at the start of every round, updated with the bot's own turn
// number whenever its score reaches a new best within that round), read
// by chooseSkeletonAction's stagnation-knock bullet.
export interface BestScoreState {
  score: number;
  turn: number;
}

// SkeletonConfig parameterizes chooseSkeletonAction with the constants
// and hooks that differ between Advanced and Expert (specs/bots.md):
// their distinct tuned thresholds, and each bot's own way (if any) of
// picking a favorable pickup, a pair-maker trade, or a safe discard
// using whatever it tracks about its neighbors. Leaving
// chooseFavorable/choosePair/chooseSafe undefined (as Advanced does for
// all three) simply skips those bullets.
export interface SkeletonConfig {
  // takePotScoreRange feeds the default first-turn blind-gamble bullet
  // below. Unused, and may be omitted, when chooseFirstTurn overrides
  // that bullet entirely.
  takePotScoreRange?: [number, number];
  knockTurnRange: [number, number];
  bestScoreTurnsAgoRange: [number, number];
  // knockScore is either a fixed threshold (Advanced, Expert) or a
  // [lo-hi] range (Novice) rolled once per turn and shared by every
  // bullet below that reads it -- specs/bots.md's "generate a random
  // number at the beginning of the turn... and use that number".
  knockScore: number | [number, number];
  // chooseFirstTurn, if provided, replaces the default first-turn
  // blind-gamble bullet entirely -- e.g. Novice's suit-shape rule (see
  // allDifferentSuits), which doesn't roll a random score threshold at
  // all. Leaving it undefined (as Advanced and Expert do) keeps the
  // default takePotScoreRange gamble.
  chooseFirstTurn?: (v: PlayerView) => Action;
  // confirmedEdge overrides the stagnation bullet's [3-5]-turn wait: if
  // true, knock immediately regardless of turns-since-best (see
  // hasConfirmedEdge).
  confirmedEdge?: (v: PlayerView) => boolean;
  // riskAdjustedKnockScore, if provided, overrides knockScore just for
  // the score-threshold-knock bullet below (not exchange-all) -- e.g.
  // Expert's downstream-risk discount
  // (see downstreamRiskAdjustedKnockScore).
  riskAdjustedKnockScore?: (v: PlayerView) => number;
  // chooseImproving overrides the plain bestImprovingSwap used by the
  // trade-to-improve bullet -- e.g. Expert's denial tie-break
  // (bestImprovingSwapDenying), which prefers denying upstream a card
  // among swaps otherwise tied for the best improving score.
  chooseImproving?: (v: PlayerView) => CandidateSwap | undefined;
  // chooseDeny overrides/precedes the favorable-pickup bullet: taking a
  // card purely to deny it to upstream, even though it wouldn't help
  // the bot's own hand (see chooseDenialTrade).
  chooseDeny?: (v: PlayerView, unnecessary: number[]) => { potIdx: number; handIdx: number } | undefined;
  chooseFavorable?: (v: PlayerView, unnecessary: number[]) => { potIdx: number; handIdx: number } | undefined;
  // choosePair, if provided, runs the pair-maker bullet (see
  // choosePairMaker) -- e.g. Expert's. Leaving it undefined (as
  // Advanced does) skips the bullet entirely.
  choosePair?: (v: PlayerView, unnecessary: number[]) => { potIdx: number; handIdx: number } | undefined;
  chooseSafe?: (v: PlayerView) => number | undefined;
}

// chooseSkeletonAction implements the full decision skeleton shared by
// Advanced and Expert (specs/bots.md), bullet by bullet: first-turn
// blind gamble, last-turn best-action, turn-limit knock, exchange-all
// (gated on knock-worthiness, not just "better than my hand"), stagnation
// knock, trade-to-improve, score-threshold knock, an optional
// favorable-pickup trade, an optional pair-maker trade, an optional
// safe-discard trade, and finally a fully random trade. Keeping this in
// one place means a bullet change (e.g. the last-turn bullet) applies to
// every bot that calls it, by construction, instead of needing to be
// hand-ported.
export function chooseSkeletonAction(v: PlayerView, rng: Rng, cfg: SkeletonConfig, best: BestScoreState): Action {
  if (v.isFirstTurnOfRound) {
    if (cfg.chooseFirstTurn) {
      return cfg.chooseFirstTurn(v);
    }
    return score(v.hand) < randInt(rng, ...(cfg.takePotScoreRange as [number, number])) ? exchange() : knock();
  }

  if (v.isLastTurn) {
    return bestLastTurnAction(v);
  }

  if (v.ownTurnNumber >= randInt(rng, ...cfg.knockTurnRange)) {
    return knock();
  }

  const knockScore = typeof cfg.knockScore === "number" ? cfg.knockScore : randInt(rng, ...cfg.knockScore);

  // Exchanging is itself a knock from the round's second turn on
  // (specs/rules.md), so the bar for taking the pot outright must be
  // the same one used to knock with your own hand -- not merely "the
  // pot beats my hand" (a pot of 11 beating a hand of 9 would
  // otherwise knock with an 11, almost always a losing score).
  if (score(v.pot) >= knockScore && score(v.pot) > score(v.hand)) {
    return exchange();
  }
  if (
    score(v.hand) === best.score &&
    v.ownTurnNumber - best.turn > randInt(rng, ...cfg.bestScoreTurnsAgoRange)
  ) {
    return knock();
  }
  if (cfg.confirmedEdge?.(v)) {
    return knock();
  }

  const improving = cfg.chooseImproving ? cfg.chooseImproving(v) : bestImprovingSwap(v);
  if (improving) {
    return trade(improving.potIdx, improving.handIdx);
  }

  if (score(v.hand) >= (cfg.riskAdjustedKnockScore?.(v) ?? knockScore)) {
    return knock();
  }

  const unnecessary = unnecessaryIndices(v.hand);

  const denial = cfg.chooseDeny?.(v, unnecessary);
  if (denial) {
    return trade(denial.potIdx, denial.handIdx);
  }

  const favorable = cfg.chooseFavorable?.(v, unnecessary);
  if (favorable) {
    return trade(favorable.potIdx, favorable.handIdx);
  }

  const pair = cfg.choosePair?.(v, unnecessary);
  if (pair) {
    return trade(pair.potIdx, pair.handIdx);
  }

  const safeHandIdx = cfg.chooseSafe?.(v);
  if (safeHandIdx !== undefined) {
    return trade(randInt(rng, 0, 2), safeHandIdx);
  }

  return trade(randInt(rng, 0, 2), randInt(rng, 0, 2));
}

import type { Card } from "../card/card.ts";
import { newDeck, shuffleDeck } from "../card/deck.ts";
import { score } from "../card/score.ts";
import { Rng } from "../rng.ts";
import { cardToString } from "../card/card.ts";
import type {
  Action,
  Hand,
  Player,
  PlayerResult,
  PlayerView,
  Pot,
  Result,
  Strategy,
  TurnRecord,
} from "./types.ts";

// RoundDealOverride lets a round's deal skip its normal fully-random
// setup for debugging (specs/params.md): assignedHands/assignedPot
// pre-populate specific seats/the pot with fixed cards instead of
// dealing them from the shuffled deck, and firstSeat fixes who acts
// first instead of picking randomly. Only ever used for a game's very
// first round — see Game.pendingInitialDeal.
//
// turnIndex, knocked, and knockerSeat additionally resume a round
// already in progress (specs/state.md): turnIndex is the count of
// turns already taken this round, so the resumed round's next turn is
// only ever treated as the round's first turn when turnIndex is still
// 0; knocked/knockerSeat carry forward whether a player has already
// knocked (or exchanged past the round's first turn), so the round
// still ends once play wraps back around to them, instead of
// forgetting that and continuing indefinitely.
export interface RoundDealOverride {
  assignedHands?: Map<number, Hand>;
  assignedPot?: Pot;
  firstSeat?: number;
  turnIndex?: number;
  knocked?: boolean;
  knockerSeat?: number;
}

// Round holds the state of a single Rumble-31 round in progress, among
// whichever seats are taking part (2 to 4 — a seat eliminated from the
// game doesn't appear here at all, so it's never dealt in, never
// takes a turn, and never touches the pot).
export class Round {
  pot: Pot;
  players: Player[];
  firstSeat: number;

  // turnIndex, knocked, and knockerSeat mirror RoundDealOverride's own
  // fields of the same name — run() starts from these instead of
  // always 0/false/-1, so a round reconstructed via override can
  // resume mid-play (specs/state.md) rather than always starting
  // completely fresh.
  turnIndex: number;
  knocked: boolean;
  knockerSeat: number;

  // onTurn, if set, is called (and awaited, if it returns a Promise)
  // with each TurnRecord as it happens, before the next seat acts —
  // e.g. to let a UI animate the turn's trade before play continues.
  onTurn: ((rec: TurnRecord) => void | Promise<void>) | undefined;

  constructor(pot: Pot, players: Player[], firstSeat = (players[0] as Player).seat) {
    this.pot = pot;
    this.players = players;
    this.firstSeat = firstSeat;
    this.turnIndex = 0;
    this.knocked = false;
    this.knockerSeat = -1;
    this.onTurn = undefined;
  }

  // run plays the round to completion: each seat is asked to decide an
  // action via its Strategy until a player knocks, or exchanges their
  // entire hand with the pot on any turn but the round's first (which
  // ends the round the same way a knock does), or any player reaches
  // three aces (which ends the round immediately, including at deal
  // time). Once the round has ended, every other player gets exactly one
  // more turn and the round ends before the player who ended it would
  // act again. Returns the final result and a log of every turn taken.
  async run(): Promise<{ result: Result; log: TurnRecord[] }> {
    if (hasThreeAces(this.players)) {
      return { result: this.computeResult(), log: [] };
    }

    const log: TurnRecord[] = [];
    // Index into this.players, not a seat number: seats can be sparse
    // (e.g. [0, 2, 3] once seat 1 is eliminated from the game), so
    // "next seat" means the next index, wrapping — still clockwise
    // order since this.players is seat-ascending.
    let idx = this.players.findIndex((p) => p.seat === this.firstSeat);
    let turnIdx = this.turnIndex;
    let knocked = this.knocked;
    let knockerSeat = this.knockerSeat;
    const ownTurnNum = new Map<number, number>();

    for (;;) {
      const player = this.players[idx] as Player;
      const seat = player.seat;
      if (knocked && seat === knockerSeat) {
        break;
      }

      ownTurnNum.set(seat, (ownTurnNum.get(seat) ?? 0) + 1);
      const isFirstTurn = turnIdx === 0;
      const view: PlayerView = {
        hand: player.hand,
        pot: this.pot,
        seat,
        isFirstTurnOfRound: isFirstTurn,
        ownTurnNumber: ownTurnNum.get(seat) as number,
      };

      const action = await player.strategy.decide(view);
      try {
        validateAction(action);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`seat ${seat} turn ${turnIdx}: ${message}`);
      }

      const record = this.apply(seat, action, turnIdx);
      log.push(record);
      turnIdx++;
      await this.onTurn?.(record);

      if (hasThreeAces(this.players)) {
        break;
      }
      if (!knocked && (action.type === "knock" || (action.type === "exchange" && !isFirstTurn))) {
        knocked = true;
        knockerSeat = seat;
      }
      idx = (idx + 1) % this.players.length;
    }

    return { result: this.computeResult(), log };
  }

  // apply performs the state mutation for a and returns a record of it.
  apply(seat: number, a: Action, turnIdx: number): TurnRecord {
    const p = this.players.find((pl) => pl.seat === seat) as Player;
    const handBefore = [...p.hand] as Hand;
    const potBefore = [...this.pot] as Pot;

    switch (a.type) {
      case "trade": {
        const hand: Card[] = p.hand;
        const pot: Card[] = this.pot;
        const tmp = hand[a.handIndex] as Card;
        hand[a.handIndex] = pot[a.potIndex] as Card;
        pot[a.potIndex] = tmp;
        break;
      }
      case "exchange": {
        const newHand = [...this.pot] as Hand;
        const newPot = [...p.hand] as Pot;
        p.hand = newHand;
        this.pot = newPot;
        break;
      }
      case "knock":
        break;
    }

    return {
      turnIndex: turnIdx,
      seat,
      action: a,
      handBefore,
      handAfter: [...p.hand] as Hand,
      potBefore,
      potAfter: [...this.pot] as Pot,
      scoreAfter: score(p.hand),
    };
  }

  // computeResult scores and ranks every player's final hand. Ties share
  // a rank (standard competition ranking); winners lists every seat with
  // rank === 1.
  computeResult(): Result {
    const prs: PlayerResult[] = this.players.map((p) => ({
      seat: p.seat,
      hand: [...p.hand] as Hand,
      score: score(p.hand),
      rank: 0,
    }));

    const order = prs.map((_, i) => i);
    order.sort((i, j) => (prs[j] as PlayerResult).score - (prs[i] as PlayerResult).score);

    let rank = 0;
    order.forEach((idx, i) => {
      const prev = i === 0 ? undefined : (prs[order[i - 1] as number] as PlayerResult);
      if (i === 0 || prev?.score !== (prs[idx] as PlayerResult).score) {
        rank = i + 1;
      }
      (prs[idx] as PlayerResult).rank = rank;
    });

    const winners = prs.filter((pr) => pr.rank === 1).map((pr) => pr.seat);

    return { players: prs, winners };
  }
}

// newRound deals a new round among the given seats (one strategy per
// seat, 2 to 4 of them — an eliminated seat is simply left out) and
// picks the first seat to act, all derived from seed so a round is
// fully reproducible. override, when given, pre-populates specific
// seats/the pot and/or fixes the first seat, per RoundDealOverride —
// see Game.playRound, which only ever passes one for a game's first
// round.
export function newRound(
  seed: number,
  seats: ReadonlyArray<{ seat: number; strategy: Strategy }>,
  override?: RoundDealOverride,
): Round {
  const rng = new Rng(seed);

  const { hands, pot } = override
    ? dealCardsWithOverride(
        rng,
        seats.map((s) => s.seat),
        override,
      )
    : dealCards(
        shuffledDeck(rng),
        seats.map((s) => s.seat),
      );
  const firstSeat = override?.firstSeat ?? (seats[rng.intn(seats.length)]?.seat as number);

  const players: Player[] = seats.map((s) => ({
    seat: s.seat,
    hand: hands.get(s.seat) as Hand,
    strategy: s.strategy,
  }));

  const round = new Round(pot, players, firstSeat);
  if (override?.turnIndex !== undefined) {
    round.turnIndex = override.turnIndex;
  }
  if (override?.knocked !== undefined) {
    round.knocked = override.knocked;
  }
  if (override?.knockerSeat !== undefined) {
    round.knockerSeat = override.knockerSeat;
  }
  return round;
}

// shuffledDeck returns a full, freshly-shuffled deck.
function shuffledDeck(rng: Rng): Card[] {
  const deck = newDeck();
  shuffleDeck(deck, rng);
  return deck;
}

// dealCards splits the top 3 * seats.length cards of the deck into
// seats.length three-card hands (round-robin, in seat order) and the
// next 3 cards into the pot.
function dealCards(deck: readonly Card[], seats: readonly number[]): { hands: Map<number, Hand>; pot: Pot } {
  const hands = new Map<number, Card[]>(seats.map((seat) => [seat, []]));
  let i = 0;
  for (let round = 0; round < 3; round++) {
    for (const seat of seats) {
      (hands.get(seat) as Card[]).push(deck[i] as Card);
      i++;
    }
  }
  const pot: Card[] = [];
  for (let j = 0; j < 3; j++) {
    pot.push(deck[i] as Card);
    i++;
  }
  const handsOut = new Map<number, Hand>();
  for (const [seat, cards] of hands) {
    handsOut.set(seat, cards as unknown as Hand);
  }
  return { hands: handsOut, pot: pot as unknown as Pot };
}

// dealCardsWithOverride deals a round per RoundDealOverride, per
// specs/params.md: seats/the pot named in override use their assigned
// cards untouched; a fresh deck, minus every assigned card, is
// shuffled and dealt round-robin (dealCards' own order) to fill
// whichever seats/the pot weren't assigned.
function dealCardsWithOverride(
  rng: Rng,
  seats: readonly number[],
  override: RoundDealOverride,
): { hands: Map<number, Hand>; pot: Pot } {
  const assignedHands = override.assignedHands ?? new Map<number, Hand>();
  const assignedCards = new Set<string>();
  for (const hand of assignedHands.values()) {
    for (const c of hand) {
      assignedCards.add(cardToString(c));
    }
  }
  if (override.assignedPot) {
    for (const c of override.assignedPot) {
      assignedCards.add(cardToString(c));
    }
  }

  const deck = newDeck().filter((c) => !assignedCards.has(cardToString(c)));
  shuffleDeck(deck, rng);

  const unassignedSeats = seats.filter((seat) => !assignedHands.has(seat));
  const { hands: dealtHands, pot: dealtPot } = dealCards(deck, unassignedSeats);

  const hands = new Map<number, Hand>(dealtHands);
  for (const [seat, hand] of assignedHands) {
    hands.set(seat, hand);
  }
  const pot = override.assignedPot ?? dealtPot;

  return { hands, pot };
}

// hasThreeAces reports whether any player currently holds three aces.
function hasThreeAces(players: readonly Player[]): boolean {
  return players.some((p) => p.hand.every((c) => c.rank === "A"));
}

// validateAction rejects actions that carry out-of-range indices.
export function validateAction(a: Action): void {
  switch (a.type) {
    case "trade":
      if (a.potIndex < 0 || a.potIndex > 2 || a.handIndex < 0 || a.handIndex > 2) {
        throw new Error(`trade index out of range: pot=${a.potIndex} hand=${a.handIndex}`);
      }
      break;
    case "exchange":
    case "knock":
      // Legal on any turn.
      break;
  }
}

import type { Card } from "../card/card.ts";
import { newDeck, shuffleDeck } from "../card/deck.ts";
import { score } from "../card/score.ts";
import { Rng } from "../rng.ts";
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

// Game holds the state of a single Rumble-31 game in progress, among
// whichever seats are taking part (2 to 4 — a seat eliminated from the
// match doesn't appear here at all, so it's never dealt in, never
// takes a turn, and never touches the pot).
export class Game {
  pot: Pot;
  players: Player[];
  firstSeat: number;

  // onTurn, if set, is called synchronously with each TurnRecord as it
  // happens, before the next seat acts.
  onTurn: ((rec: TurnRecord) => void) | undefined;

  constructor(pot: Pot, players: Player[], firstSeat = (players[0] as Player).seat) {
    this.pot = pot;
    this.players = players;
    this.firstSeat = firstSeat;
    this.onTurn = undefined;
  }

  // run plays the game to completion: each seat is asked to decide an
  // action via its Strategy until a player knocks, or exchanges their
  // entire hand with the pot on any turn but the game's first (which
  // ends the game the same way a knock does), or any player reaches
  // three aces (which ends the game immediately, including at deal
  // time). Once the game has ended, every other player gets exactly one
  // more turn and the game ends before the player who ended it would
  // act again. Returns the final result and a log of every turn taken.
  async run(): Promise<{ result: Result; log: TurnRecord[] }> {
    if (hasThreeAces(this.players)) {
      return { result: this.computeResult(), log: [] };
    }

    const log: TurnRecord[] = [];
    // Index into this.players, not a seat number: seats can be sparse
    // (e.g. [0, 2, 3] once seat 1 is eliminated from the match), so
    // "next seat" means the next index, wrapping — still clockwise
    // order since this.players is seat-ascending.
    let idx = this.players.findIndex((p) => p.seat === this.firstSeat);
    let turnIdx = 0;
    let knocked = false;
    let knockerSeat = -1;
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
        isFirstTurnOfGame: isFirstTurn,
        ownTurnNumber: ownTurnNum.get(seat) as number,
      };

      const action = await player.strategy.decide(view);
      try {
        validateAction(isFirstTurn, action);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`seat ${seat} turn ${turnIdx}: ${message}`);
      }

      const record = this.apply(seat, action, turnIdx);
      log.push(record);
      turnIdx++;
      this.onTurn?.(record);

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

// newGame deals a new game among the given seats (one strategy per
// seat, 2 to 4 of them — an eliminated seat is simply left out) and
// picks the first seat to act, all derived from seed so a game is
// fully reproducible.
export function newGame(seed: number, seats: ReadonlyArray<{ seat: number; strategy: Strategy }>): Game {
  const rng = new Rng(seed);

  const deck = newDeck();
  shuffleDeck(deck, rng);

  const { hands, pot } = dealCards(
    deck,
    seats.map((s) => s.seat),
  );
  const firstSeat = seats[rng.intn(seats.length)]?.seat as number;

  const players: Player[] = seats.map((s) => ({
    seat: s.seat,
    hand: hands.get(s.seat) as Hand,
    strategy: s.strategy,
  }));

  return new Game(pot, players, firstSeat);
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

// hasThreeAces reports whether any player currently holds three aces.
function hasThreeAces(players: readonly Player[]): boolean {
  return players.some((p) => p.hand.every((c) => c.rank === "A"));
}

// validateAction rejects actions that are not legal for the given turn,
// or that carry out-of-range indices.
export function validateAction(isFirstTurn: boolean, a: Action): void {
  switch (a.type) {
    case "trade":
      if (a.potIndex < 0 || a.potIndex > 2 || a.handIndex < 0 || a.handIndex > 2) {
        throw new Error(`trade index out of range: pot=${a.potIndex} hand=${a.handIndex}`);
      }
      break;
    case "exchange":
      // Legal on any turn.
      break;
    case "knock":
      if (isFirstTurn) {
        throw new Error("knock is not legal on the game's first turn");
      }
      break;
  }
}

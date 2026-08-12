// Rumble-31 game engine types: dealing, turn order, the exchange/knock
// actions, and end-of-round scoring, per specs/rules.md.

import type { Card } from "../card/card.ts";

// Hand is a player's 3-card hand. Pot is the shared 3-card pot.
export type Hand = [Card, Card, Card];
export type Pot = [Card, Card, Card];

export type ActionType = "trade" | "exchange" | "knock";

// Action is a player's chosen move for a turn. potIndex and handIndex
// are only meaningful for a "trade" action.
export interface Action {
  type: ActionType;
  potIndex: number;
  handIndex: number;
}

// trade returns an action that swaps the pot card at potIdx with the
// hand card at handIdx.
export function trade(potIdx: number, handIdx: number): Action {
  return { type: "trade", potIndex: potIdx, handIndex: handIdx };
}

// exchange returns an action that swaps the entire hand with the pot.
// It is legal on any turn. Except on the round's very first turn,
// choosing it also ends the round the same way a knock does.
export function exchange(): Action {
  return { type: "exchange", potIndex: 0, handIndex: 0 };
}

// knock returns an action that ends the player's turn without
// exchanging, starting the endgame. It is legal on any turn except the
// round's first turn.
export function knock(): Action {
  return { type: "knock", potIndex: 0, handIndex: 0 };
}

// PlayerView is the information available to a Strategy when deciding an
// action: the acting player's own hand, the shared pot, and turn
// context. It never exposes another player's hand.
export interface PlayerView {
  hand: Hand;
  pot: Pot;

  // seat is the acting player's seat (0-3).
  seat: number;

  // isFirstTurnOfRound is true only for the single decide() call made on
  // the very first turn of the round.
  isFirstTurnOfRound: boolean;

  // ownTurnNumber is the 1-based count of this seat's own turns so far,
  // including the current one.
  ownTurnNumber: number;
}

// PublicTurn is the publicly-observable outcome of one player's turn:
// exactly what specs/log.md announces (the cards that moved), never the
// untouched rest of a hand. given/taken are empty for a knock, length 1
// for a trade, and length 3 for an exchange.
export interface PublicTurn {
  seat: number;
  type: ActionType;
  given: Card[];
  taken: Card[];
}

// Strategy decides an action for a player given their view of the round.
// A synchronous Strategy (e.g. a bot, or the CLI's blocking-stdin human)
// returns Action directly; one that waits on external input (e.g. a
// browser click) returns a Promise<Action> instead.
//
// onRoundStart and observe are optional hooks for a Strategy that wants
// to track public information across a round: onRoundStart fires once
// per round, for every active seat's strategy, before any turns are
// taken, so per-round state can be reset; observe fires for every
// active seat's strategy after every turn (including the acting seat's
// own), with that turn's PublicTurn. Each Strategy that implements
// observe is responsible for building and owning its own model from
// what it's shown — the engine never hands out a shared, canonical
// history, so a strategy that wants imperfect memory can do so on its
// own without any change here.
export interface Strategy {
  decide(view: PlayerView): Action | Promise<Action>;
  onRoundStart?(): void;
  observe?(turn: PublicTurn): void;
}

// strategyFunc adapts a plain function to the Strategy interface.
export function strategyFunc(fn: (view: PlayerView) => Action): Strategy {
  return { decide: fn };
}

// Player is a seated player: their hand and the strategy that decides
// their actions.
export interface Player {
  seat: number;
  hand: Hand;
  strategy: Strategy;
}

// TurnRecord records what happened on a single turn, for logging.
export interface TurnRecord {
  turnIndex: number;
  seat: number;
  action: Action;

  handBefore: Hand;
  handAfter: Hand;
  potBefore: Pot;
  potAfter: Pot;

  scoreAfter: number;
}

// PlayerResult is a player's final hand, score, and rank at round end.
export interface PlayerResult {
  seat: number;
  hand: Hand;
  score: number;
  rank: number;
}

// Result is the final outcome of a round: every player's result (only
// seats that took part in this round — an eliminated seat has none), and
// the seat(s) that won (multiple seats if tied for first).
export interface Result {
  players: PlayerResult[];
  winners: number[];
}

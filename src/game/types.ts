// Rumble-31 game engine types: dealing, turn order, the exchange/knock
// actions, and end-of-game scoring, per specs/rules.md.

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
// It is legal on any turn. Except on the game's very first turn,
// choosing it also ends the game the same way a knock does.
export function exchange(): Action {
  return { type: "exchange", potIndex: 0, handIndex: 0 };
}

// knock returns an action that ends the player's turn without
// exchanging, starting the endgame. It is legal on any turn except the
// game's first turn.
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

  // isFirstTurnOfGame is true only for the single decide() call made on
  // the very first turn of the game.
  isFirstTurnOfGame: boolean;

  // ownTurnNumber is the 1-based count of this seat's own turns so far,
  // including the current one.
  ownTurnNumber: number;
}

// Strategy decides an action for a player given their view of the game.
export interface Strategy {
  decide(view: PlayerView): Action;
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

// PlayerResult is a player's final hand, score, and rank at game end.
export interface PlayerResult {
  seat: number;
  hand: Hand;
  score: number;
  rank: number;
}

// Result is the final outcome of a game: every player's result (only
// seats that took part in this game — an eliminated seat has none), and
// the seat(s) that won (multiple seats if tied for first).
export interface Result {
  players: PlayerResult[];
  winners: number[];
}

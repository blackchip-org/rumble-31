import type { Action } from "../game/types.ts";
import { trade } from "../game/types.ts";

// TradeSelection tracks which hand card and which pot card the player
// has picked to trade with a click, independent of the DOM. Clicking an
// already-picked card in a zone un-picks it; clicking a different card
// in the same zone moves the pick there instead. Cards can be picked in
// either order — hand then pot, or pot then hand — and the trade is
// ready once both zones have a pick.
export class TradeSelection {
  private hand: number | null = null;
  private pot: number | null = null;

  clickHand(i: number): void {
    this.hand = this.hand === i ? null : i;
  }

  clickPot(i: number): void {
    this.pot = this.pot === i ? null : i;
  }

  handIndex(): number | null {
    return this.hand;
  }

  potIndex(): number | null {
    return this.pot;
  }

  ready(): boolean {
    return this.hand !== null && this.pot !== null;
  }

  // action returns the trade once ready(); throws otherwise.
  action(): Action {
    if (this.hand === null || this.pot === null) {
      throw new Error("TradeSelection.action: not ready");
    }
    return trade(this.pot, this.hand);
  }
}

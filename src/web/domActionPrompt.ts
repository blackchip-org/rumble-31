import { score } from "../card/score.ts";
import type { Action, PlayerView, Strategy } from "../game/types.ts";
import { exchange, knock } from "../game/types.ts";
import { setScore } from "./panels.ts";
import { renderCards } from "./render.ts";
import { TradeSelection } from "./tradeSelection.ts";

// DomActionPrompt is South's Strategy: it renders the pot and the
// player's hand (score box included — South's score is always public),
// then resolves once the player either clicks a hand-card/pot-card pair
// (a trade, in either order) or clicks the standing Take Pot / Knock
// buttons. On the round's first turn, per specs/rules.md, only Take Pot
// or Keep are available: clicking a card does nothing, the buttons read
// "Keep Pot"/"Keep Hand" instead of "Take Pot"/"Knock" (Keep Hand still
// resolves to knock() — round.ts is what makes it not act as a real
// knock that turn), and every hand card gets a highlight (is-first-turn)
// signaling that all of the hand, not one card, is what's being kept.
export class DomActionPrompt implements Strategy {
  private potEl: HTMLElement;
  private handEl: HTMLElement;
  private scoreEl: HTMLElement;
  private takePotBtn: HTMLButtonElement;
  private knockBtn: HTMLButtonElement;
  private signal: AbortSignal;

  constructor(potEl: HTMLElement, handEl: HTMLElement, scoreEl: HTMLElement, takePotBtn: HTMLButtonElement, knockBtn: HTMLButtonElement, signal: AbortSignal) {
    this.potEl = potEl;
    this.handEl = handEl;
    this.scoreEl = scoreEl;
    this.takePotBtn = takePotBtn;
    this.knockBtn = knockBtn;
    this.signal = signal;
  }

  decide(view: PlayerView): Promise<Action> {
    renderCards(this.potEl, view.pot);
    renderCards(this.handEl, view.hand);
    setScore(this.scoreEl, score(view.hand));

    const handCards = Array.from(this.handEl.children) as HTMLElement[];
    const potCards = Array.from(this.potEl.children) as HTMLElement[];
    const selection = new TradeSelection();
    const isFirstTurn = view.isFirstTurnOfRound;

    return new Promise((resolve) => {
      let settled = false;

      const syncSelection = () => {
        handCards.forEach((el, i) => el.classList.toggle("is-selected", selection.handIndex() === i));
        potCards.forEach((el, i) => el.classList.toggle("is-selected", selection.potIndex() === i));
      };

      // detach undoes everything decide() attached to the DOM, without
      // settling the promise -- shared by finish() (a real decision,
      // which also resolves) and onAbort below (the game was paused or
      // abandoned mid-turn, so this decide() must stop touching the
      // DOM but never resolve, since round.ts is never going to look
      // at its result).
      const detach = () => {
        this.takePotBtn.disabled = true;
        this.knockBtn.disabled = true;
        this.takePotBtn.textContent = "Take Pot";
        this.knockBtn.textContent = "Knock";
        this.takePotBtn.removeEventListener("click", onTakePot);
        this.knockBtn.removeEventListener("click", onKnock);
        handCards.forEach((el) => el.classList.remove("is-selected", "is-first-turn"));
        potCards.forEach((el) => el.classList.remove("is-selected"));
        this.signal.removeEventListener("abort", onAbort);
      };

      const finish = (action: Action) => {
        if (settled) {
          return;
        }
        settled = true;
        detach();
        resolve(action);
      };

      const onAbort = () => {
        if (settled) {
          return;
        }
        settled = true;
        detach();
      };

      const onTakePot = () => finish(exchange());
      const onKnock = () => finish(knock());

      this.signal.addEventListener("abort", onAbort);

      this.takePotBtn.disabled = false;
      this.knockBtn.disabled = false;
      this.takePotBtn.textContent = isFirstTurn ? "Keep Pot" : "Take Pot";
      this.knockBtn.textContent = isFirstTurn ? "Keep Hand" : "Knock";
      this.takePotBtn.addEventListener("click", onTakePot);
      this.knockBtn.addEventListener("click", onKnock);

      // Trading a single card isn't legal on the round's first turn —
      // only Take Pot/Keep are, via the buttons above. All of South's
      // hand cards highlight instead, to signal that "all" of the hand
      // is what Keep Pot/Keep Hand consider.
      if (isFirstTurn) {
        handCards.forEach((el) => el.classList.add("is-first-turn"));
      } else {
        handCards.forEach((el, i) => {
          el.addEventListener("click", () => {
            selection.clickHand(i);
            syncSelection();
            if (selection.ready()) {
              finish(selection.action());
            }
          });
        });

        potCards.forEach((el, i) => {
          el.addEventListener("click", () => {
            selection.clickPot(i);
            syncSelection();
            if (selection.ready()) {
              finish(selection.action());
            }
          });
        });
      }
    });
  }
}

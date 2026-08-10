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
// buttons. Knock is disabled on the game's first turn, when it isn't a
// legal move.
export class DomActionPrompt implements Strategy {
  private potEl: HTMLElement;
  private handEl: HTMLElement;
  private scoreEl: HTMLElement;
  private takePotBtn: HTMLButtonElement;
  private knockBtn: HTMLButtonElement;

  constructor(potEl: HTMLElement, handEl: HTMLElement, scoreEl: HTMLElement, takePotBtn: HTMLButtonElement, knockBtn: HTMLButtonElement) {
    this.potEl = potEl;
    this.handEl = handEl;
    this.scoreEl = scoreEl;
    this.takePotBtn = takePotBtn;
    this.knockBtn = knockBtn;
  }

  decide(view: PlayerView): Promise<Action> {
    renderCards(this.potEl, view.pot);
    renderCards(this.handEl, view.hand);
    setScore(this.scoreEl, score(view.hand));

    const handCards = Array.from(this.handEl.children) as HTMLElement[];
    const potCards = Array.from(this.potEl.children) as HTMLElement[];
    const selection = new TradeSelection();

    return new Promise((resolve) => {
      let settled = false;

      const syncSelection = () => {
        handCards.forEach((el, i) => el.classList.toggle("is-selected", selection.handIndex() === i));
        potCards.forEach((el, i) => el.classList.toggle("is-selected", selection.potIndex() === i));
      };

      const finish = (action: Action) => {
        if (settled) {
          return;
        }
        settled = true;
        this.takePotBtn.disabled = true;
        this.knockBtn.disabled = true;
        this.takePotBtn.removeEventListener("click", onTakePot);
        this.knockBtn.removeEventListener("click", onKnock);
        handCards.forEach((el) => el.classList.remove("is-selected"));
        potCards.forEach((el) => el.classList.remove("is-selected"));
        resolve(action);
      };

      const onTakePot = () => finish(exchange());
      const onKnock = () => finish(knock());

      this.takePotBtn.disabled = false;
      this.knockBtn.disabled = view.isFirstTurnOfGame;
      this.takePotBtn.addEventListener("click", onTakePot);
      this.knockBtn.addEventListener("click", onKnock);

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
    });
  }
}

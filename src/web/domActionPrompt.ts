import { score } from "../card/score.ts";
import type { Action, PlayerView, Strategy } from "../game/types.ts";
import { exchange, knock } from "../game/types.ts";
import { clearFocus, type FocusFirst, focusHandCenter, focusKnockButton, focusPotCenter } from "./focusNav.ts";
import { setScore } from "./panels.ts";
import { renderBacks, renderCards } from "./render.ts";
import { TradeSelection } from "./tradeSelection.ts";

// DomActionPrompt is South's Strategy: it renders the pot and the
// player's hand (score box included — South's score is always public),
// then resolves once the player either clicks a hand-card/pot-card pair
// (a trade, in either order) or clicks the standing Take Pot / Knock
// buttons. On the round's first turn, per specs/rules.md, only Take Pot
// or Keep are available: clicking a card does nothing, the pot is
// private (rendered as card backs, same as a bot's hand — South can't
// see it either on this turn), the Knock button reads "Keep"
// instead (still resolves to knock() — round.ts is what makes it not
// act as a real knock that turn). A dialog (specs/screens/game.md)
// states the choice directly: Take Pot/Knock are relocated from their
// usual spot above South's panel into the dialog for as long as it's
// shown, and moved back once a decision is made. Every hand deals
// face-down (main.ts's animateDeal et al.), South's own included;
// South's is normally revealed right after dealing finishes, but on
// this turn it stays face-down on the board instead — the dialog is
// the only place its real cards (and the score they'd give away) are
// shown, until the decision resolves and round.ts's normal per-turn
// render reveals both again.
export class DomActionPrompt implements Strategy {
  private potEl: HTMLElement;
  private handEl: HTMLElement;
  private scoreEl: HTMLElement;
  private takePotBtn: HTMLButtonElement;
  private knockBtn: HTMLButtonElement;
  private actionsEl: HTMLElement;
  private firstTurnDialogEl: HTMLElement;
  private firstTurnPotEl: HTMLElement;
  private firstTurnHandEl: HTMLElement;
  private firstTurnActionsEl: HTMLElement;
  private getFocusFirst: () => FocusFirst;
  private signal: AbortSignal;

  constructor(
    potEl: HTMLElement,
    handEl: HTMLElement,
    scoreEl: HTMLElement,
    takePotBtn: HTMLButtonElement,
    knockBtn: HTMLButtonElement,
    firstTurnDialogEl: HTMLElement,
    firstTurnPotEl: HTMLElement,
    firstTurnHandEl: HTMLElement,
    firstTurnActionsEl: HTMLElement,
    getFocusFirst: () => FocusFirst,
    signal: AbortSignal,
  ) {
    this.potEl = potEl;
    this.handEl = handEl;
    this.scoreEl = scoreEl;
    this.takePotBtn = takePotBtn;
    this.knockBtn = knockBtn;
    this.actionsEl = takePotBtn.parentElement!;
    this.firstTurnDialogEl = firstTurnDialogEl;
    this.firstTurnPotEl = firstTurnPotEl;
    this.firstTurnHandEl = firstTurnHandEl;
    this.firstTurnActionsEl = firstTurnActionsEl;
    this.getFocusFirst = getFocusFirst;
    this.signal = signal;
  }

  decide(view: PlayerView): Promise<Action> {
    const isFirstTurn = view.isFirstTurnOfRound;
    if (isFirstTurn) {
      // The board's own hand/pot stay a mystery -- like the pot,
      // South's hand is only actually revealed inside the dialog
      // below, so the score stays hidden here too (same as an
      // un-revealed bot's) rather than giving away hand strength while
      // its cards are still shown as backs.
      renderBacks(this.potEl, view.pot.length);
      renderBacks(this.handEl, view.hand.length);
      setScore(this.scoreEl, null);
    } else {
      renderCards(this.potEl, view.pot);
      renderCards(this.handEl, view.hand);
      setScore(this.scoreEl, score(view.hand));
    }

    const handCards = Array.from(this.handEl.children) as HTMLElement[];
    const potCards = Array.from(this.potEl.children) as HTMLElement[];
    const selection = new TradeSelection();

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
        handCards.forEach((el) => el.classList.remove("is-selected"));
        potCards.forEach((el) => el.classList.remove("is-selected"));
        this.handEl.classList.remove("is-tradeable");
        this.potEl.classList.remove("is-tradeable");
        if (isFirstTurn) {
          this.actionsEl.append(this.takePotBtn, this.knockBtn);
          this.firstTurnDialogEl.hidden = true;
        }
        this.signal.removeEventListener("abort", onAbort);
      };

      const finish = (action: Action) => {
        if (settled) {
          return;
        }
        settled = true;
        clearFocus();
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
      this.takePotBtn.textContent = "Take Pot";
      this.knockBtn.textContent = isFirstTurn ? "Keep" : "Knock";
      this.takePotBtn.addEventListener("click", onTakePot);
      this.knockBtn.addEventListener("click", onKnock);

      // Trading a single card isn't legal on the round's first turn —
      // only Take Pot/Keep are. A dialog (specs/screens/game.md)
      // states the choice directly instead of highlighting a group of
      // cards, so Take Pot/Knock are relocated into it for as long as
      // it's shown (restored to their usual spot by detach() above).
      if (isFirstTurn) {
        renderBacks(this.firstTurnPotEl, view.pot.length);
        renderCards(this.firstTurnHandEl, view.hand);
        this.firstTurnActionsEl.append(this.takePotBtn, this.knockBtn);
        this.firstTurnDialogEl.hidden = false;
        focusKnockButton();
      } else {
        // is-tradeable marks these containers' cards as clickable --
        // focusNav.ts reads it to decide whether the hand/pot rows
        // belong in the controller/keyboard focus grid.
        this.handEl.classList.add("is-tradeable");
        this.potEl.classList.add("is-tradeable");
        if (this.getFocusFirst() === "pot") {
          focusPotCenter();
        } else {
          focusHandCenter();
        }

        handCards.forEach((el, i) => {
          el.addEventListener("click", () => {
            const picking = selection.handIndex() !== i;
            selection.clickHand(i);
            syncSelection();
            if (selection.ready()) {
              finish(selection.action());
            } else if (picking) {
              focusPotCenter();
            }
          });
        });

        potCards.forEach((el, i) => {
          el.addEventListener("click", () => {
            const picking = selection.potIndex() !== i;
            selection.clickPot(i);
            syncSelection();
            if (selection.ready()) {
              finish(selection.action());
            } else if (picking) {
              focusHandCenter();
            }
          });
        });
      }
    });
  }
}

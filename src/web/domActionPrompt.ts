import { score } from "../card/score.ts";
import type { Action, PlayerView, Strategy } from "../game/types.ts";
import { exchange, knock } from "../game/types.ts";
import { focusHandCenter, focusKnockButton, focusPotCenter } from "./focusNav.ts";
import { setScore } from "./panels.ts";
import { renderBacks, renderCards, setBackHighlight } from "./render.ts";
import { TradeSelection } from "./tradeSelection.ts";

// DomActionPrompt is South's Strategy: it renders the pot and the
// player's hand (score box included — South's score is always public),
// then resolves once the player either clicks a hand-card/pot-card pair
// (a trade, in either order) or clicks the standing Take Pot / Knock
// buttons. On the round's first turn, per specs/rules.md, only Take Pot
// or Keep are available: clicking a card does nothing, the pot is
// private (rendered as card backs, same as a bot's hand — South can't
// see it either on this turn), the Knock button reads "Keep Hand"
// instead (still resolves to knock() — round.ts is what makes it not
// act as a real knock that turn), and the group of cards Take Pot/Keep
// Hand would act on (all of the pot, or all of the hand) highlights as
// a group instead of one card, tracking hover/focus on the two
// buttons: the hand (real card art) via is-keep-highlight, the pot
// (card backs) by swapping to the light-yellow back via
// setBackHighlight.
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
    const isFirstTurn = view.isFirstTurnOfRound;
    if (isFirstTurn) {
      renderBacks(this.potEl, view.pot.length);
    } else {
      renderCards(this.potEl, view.pot);
    }
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

      // Tracks which group of cards Take Pot/Keep Hand would act on --
      // the pot while Take Pot has mouse hover, real DOM focus, or
      // focusNav.ts's own app-managed "is-focused" class
      // (controller/keyboard nav never sets real DOM focus -- see
      // focusNav.ts's top comment), the hand otherwise (including
      // while Knock/Keep Hand has any of those, or neither button
      // does). Only wired up to the buttons on the first turn (below);
      // defined unconditionally so detach() can always call
      // removeEventListener/disconnect with it. The hand's cards are
      // real, visible card art, so they highlight via the
      // is-keep-highlight class (cards-highlight.png); the pot's cards
      // are still-private card backs at this point, so they highlight
      // by swapping to the light-yellow back instead.
      const updateKeepHighlight = () => {
        const potActive =
          this.takePotBtn.matches(":hover") || document.activeElement === this.takePotBtn || this.takePotBtn.classList.contains("is-focused");
        handCards.forEach((el) => el.classList.toggle("is-keep-highlight", !potActive));
        potCards.forEach((el) => setBackHighlight(el, potActive));
      };
      const keepFocusObserver = new MutationObserver(updateKeepHighlight);

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
        this.takePotBtn.removeEventListener("mouseenter", updateKeepHighlight);
        this.takePotBtn.removeEventListener("mouseleave", updateKeepHighlight);
        this.takePotBtn.removeEventListener("focus", updateKeepHighlight);
        this.takePotBtn.removeEventListener("blur", updateKeepHighlight);
        keepFocusObserver.disconnect();
        handCards.forEach((el) => el.classList.remove("is-selected", "is-keep-highlight"));
        potCards.forEach((el) => el.classList.remove("is-selected"));
        if (isFirstTurn) {
          potCards.forEach((el) => setBackHighlight(el, false));
        }
        this.handEl.classList.remove("is-tradeable");
        this.potEl.classList.remove("is-tradeable");
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
      this.takePotBtn.textContent = "Take Pot";
      this.knockBtn.textContent = isFirstTurn ? "Keep Hand" : "Knock";
      this.takePotBtn.addEventListener("click", onTakePot);
      this.knockBtn.addEventListener("click", onKnock);

      // Trading a single card isn't legal on the round's first turn —
      // only Take Pot/Keep are, via the buttons above. Instead, the
      // hand or pot cards highlight as a group, tracking which of Take
      // Pot/Keep Hand currently has hover or focus, to signal which
      // cards that button would act on.
      if (isFirstTurn) {
        this.takePotBtn.addEventListener("mouseenter", updateKeepHighlight);
        this.takePotBtn.addEventListener("mouseleave", updateKeepHighlight);
        this.takePotBtn.addEventListener("focus", updateKeepHighlight);
        this.takePotBtn.addEventListener("blur", updateKeepHighlight);
        keepFocusObserver.observe(this.takePotBtn, { attributes: true, attributeFilter: ["class"] });
        updateKeepHighlight();
        focusKnockButton();
      } else {
        // is-tradeable marks these containers' cards as clickable --
        // focusNav.ts reads it to decide whether the hand/pot rows
        // belong in the controller/keyboard focus grid.
        this.handEl.classList.add("is-tradeable");
        this.potEl.classList.add("is-tradeable");
        focusHandCenter();

        handCards.forEach((el, i) => {
          el.addEventListener("click", () => {
            const picking = selection.handIndex() !== i;
            selection.clickHand(i);
            syncSelection();
            if (picking) {
              focusPotCenter();
            }
            if (selection.ready()) {
              finish(selection.action());
            }
          });
        });

        potCards.forEach((el, i) => {
          el.addEventListener("click", () => {
            const picking = selection.potIndex() !== i;
            selection.clickPot(i);
            syncSelection();
            if (picking) {
              focusHandCenter();
            }
            if (selection.ready()) {
              finish(selection.action());
            }
          });
        });
      }
    });
  }
}

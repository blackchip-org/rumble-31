import type { PlayerView } from "../game/types.ts";
import type { ActionPrompt } from "./actionPrompt.ts";
import { renderCards } from "./render.ts";

interface Choice {
  value: number;
  label: string;
}

// optionLabel returns the button text for menu option n out of max
// options, matching the CLI's own wording (cli/cli.ts's Human.decide).
function optionLabel(n: number, max: number): string {
  switch (n) {
    case 1:
      return "Trade one card with the pot";
    case 2:
      return max === 2 ? "Exchange your entire hand with the pot" : "Exchange your entire hand with the pot (this also knocks)";
    case 3:
      return "Knock";
    default:
      throw new Error(`domActionPrompt: no label for option ${n}`);
  }
}

// DomActionPrompt is the real, browser-backed ActionPrompt: it renders
// the pot/hand into the given elements and turns each choice into a row
// of buttons in actionsEl, resolving once one is clicked.
export class DomActionPrompt implements ActionPrompt {
  private potEl: HTMLElement;
  private handEl: HTMLElement;
  private actionsEl: HTMLElement;

  constructor(potEl: HTMLElement, handEl: HTMLElement, actionsEl: HTMLElement) {
    this.potEl = potEl;
    this.handEl = handEl;
    this.actionsEl = actionsEl;
  }

  render(view: PlayerView): void {
    renderCards(this.potEl, view.pot);
    renderCards(this.handEl, view.hand);
  }

  chooseOption(max: number): Promise<number> {
    const choices: Choice[] = [];
    for (let n = 1; n <= max; n++) {
      choices.push({ value: n, label: optionLabel(n, max) });
    }
    return this.choose(choices);
  }

  chooseCardIndex(label: string): Promise<number> {
    const choices: Choice[] = [0, 1, 2].map((i) => ({ value: i, label: `${label}: position ${i + 1}` }));
    return this.choose(choices);
  }

  private choose(choices: readonly Choice[]): Promise<number> {
    return new Promise((resolve) => {
      this.actionsEl.replaceChildren();
      for (const choice of choices) {
        const btn = document.createElement("button");
        btn.textContent = choice.label;
        btn.addEventListener("click", () => {
          this.actionsEl.replaceChildren();
          resolve(choice.value);
        });
        this.actionsEl.appendChild(btn);
      }
    });
  }
}

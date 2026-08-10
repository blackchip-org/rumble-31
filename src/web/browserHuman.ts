import type { Action, PlayerView, Strategy } from "../game/types.ts";
import { exchange, knock, trade } from "../game/types.ts";
import type { ActionPrompt } from "./actionPrompt.ts";

// BrowserHuman is a Strategy that prompts a person for each decision
// through an ActionPrompt, awaiting their answer (e.g. a button click)
// instead of blocking a thread the way the CLI's Human does. Unlike
// Human, it never reprompts for invalid input: an ActionPrompt only
// ever offers the legal choices in the first place.
export class BrowserHuman implements Strategy {
  private prompt: ActionPrompt;

  constructor(prompt: ActionPrompt) {
    this.prompt = prompt;
  }

  async decide(v: PlayerView): Promise<Action> {
    this.prompt.render(v);

    const max = v.isFirstTurnOfGame ? 2 : 3;
    const choice = await this.prompt.chooseOption(max);
    if (choice === 2) {
      return exchange();
    }
    if (choice === 3) {
      return knock();
    }
    return this.chooseTrade();
  }

  private async chooseTrade(): Promise<Action> {
    const potIdx = await this.prompt.chooseCardIndex("pot card to take");
    const handIdx = await this.prompt.chooseCardIndex("hand card to give up");
    return trade(potIdx, handIdx);
  }
}

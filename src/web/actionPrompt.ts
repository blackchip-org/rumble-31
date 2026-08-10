import type { PlayerView } from "../game/types.ts";

// ActionPrompt abstracts showing the player their view of the game and
// waiting for their answers, letting BrowserHuman's decide() logic stay
// independent of the DOM — the browser analog of cli/io.ts's
// LineReader/Writer split, collapsed into one interface since a browser
// turn is a single render-then-wait interaction rather than separate
// input/output streams.
export interface ActionPrompt {
  // render displays the given view (the pot and the player's hand).
  render(view: PlayerView): void;

  // chooseOption presents options 1..max and resolves with the one
  // picked.
  chooseOption(max: number): Promise<number>;

  // chooseCardIndex asks the player to pick a card by position (labeled
  // for context, e.g. "pot card to take") and resolves with its 0-based
  // index.
  chooseCardIndex(label: string): Promise<number>;
}

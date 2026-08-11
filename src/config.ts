// Developer-tunable constants, per specs/config.md.

// MIN_BOT_THINK_TIME/MAX_BOT_THINK_TIME bound the random pause used to
// simulate a bot thinking before it decides, in milliseconds.
export const MIN_BOT_THINK_TIME = 500;
export const MAX_BOT_THINK_TIME = 2000;

// DEAL_ANIMATION_DELAY is the pause, in milliseconds, between each
// card dealt during the round-start dealing animation. With all four
// seats active that's 15 cards (12 hand + 3 pot), so ~65ms lands the
// whole animation around one second; it's proportionally shorter with
// fewer seats active.
export const DEAL_ANIMATION_DELAY = 65;

// STRIKE_HIGHLIGHT_BLINK_INTERVAL is the number of milliseconds each
// on/off phase of the end-of-round red strike highlight is shown
// before toggling.
export const STRIKE_HIGHLIGHT_BLINK_INTERVAL = 400;

// TRADE_ANIMATION_DURATION is the total time, in milliseconds, for one
// card's trade animation: sliding from hand to pot, then the pot's
// card sliding back, split evenly across the two legs. Exchanging a
// whole hand plays this animation three times in sequence (once per
// card), not once for all three.
export const TRADE_ANIMATION_DURATION = 500;

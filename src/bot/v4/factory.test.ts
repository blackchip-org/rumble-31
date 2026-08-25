import { test } from "node:test";
import assert from "node:assert/strict";
import type { Action, PlayerView, Strategy } from "../../game/types.ts";
import { Rng } from "../../rng.ts";
import { parseCard } from "../../card/card.ts";
import { BOT_SKILL_LEVELS, createBot, snapshotBot } from "./factory.ts";

// decideSync calls decide() and asserts its result is synchronous --
// true of every bot in src/bot, unlike Strategy's own Action |
// Promise<Action> signature (which also covers e.g. a browser click).
function decideSync(bot: Strategy, v: PlayerView): Action {
  const result = bot.decide(v);
  assert.ok(!(result instanceof Promise), "expected a synchronous bot decision");
  return result;
}

// stuckView is a turn where the hand can't be improved -- its three
// different suits cap its score at Ks (10), and the pot is entirely
// hearts (a suit neither hand card holds) worth too little (24) to
// clear any skill's pot exchange threshold -- and the hand's score
// (10) sits well below every skill level's knockScoreThreshold, so
// only the Knock phase's repeat counter or failsafe lap can turn this
// into a knock.
function stuckView(overrides: Partial<PlayerView>): PlayerView {
  return {
    hand: [parseCard("7c"), parseCard("8d"), parseCard("Ks")],
    pot: [parseCard("7h"), parseCard("8h"), parseCard("9h")],
    seat: 0,
    opponentCount: 3,
    isFirstTurnOfRound: false,
    lap: 2,
    isLastTurn: false,
    ...overrides,
  };
}

test("createBot: a stuck hand's repeat counter builds turn over turn and eventually forces a knock", () => {
  for (const skillLevel of BOT_SKILL_LEVELS) {
    const bot = createBot(skillLevel, new Rng(1));
    bot.onRoundStart?.();
    let knocked = false;
    // Expert's own repeat-counter threshold (5) is the highest of the
    // three, needing 7 stuck turns to trip -- see phases.ts's
    // updateBestScore/knockPhase for why. 8 turns covers every skill
    // level, and (starting at lap 2) stays well under the lowest
    // possible failsafe lap (10), so only the repeat counter can be
    // responsible for a knock here.
    for (let turn = 0; turn < 8 && !knocked; turn++) {
      const action = decideSync(bot, stuckView({ lap: 2 + turn }));
      knocked = action.type === "knock";
    }
    assert.ok(knocked, `${skillLevel}: expected a knock within 8 stuck turns`);
  }
});

test("createBot: onRoundStart resets the repeat counter so it doesn't carry a knock into the next round", () => {
  const bot = createBot("novice", new Rng(1));
  bot.onRoundStart?.();
  // Novice's own repeat-counter threshold is 2 -- three stuck turns
  // bring the tracked repeat counter to exactly that, so a fourth
  // stuck turn without a reset in between would knock.
  for (let turn = 0; turn < 3; turn++) {
    const action = decideSync(bot, stuckView({ lap: 2 + turn }));
    assert.notEqual(action.type, "knock", `turn ${turn + 1} shouldn't knock yet`);
  }

  bot.onRoundStart?.();
  const afterReset = decideSync(bot, stuckView({ lap: 2 }));
  assert.notEqual(afterReset.type, "knock", "a fresh round shouldn't inherit the previous round's repeat counter");
});

test("createBot: the once-per-round failsafe lap eventually forces a knock even on a stuck hand", () => {
  for (const skillLevel of BOT_SKILL_LEVELS) {
    const bot = createBot(skillLevel, new Rng(7));
    bot.onRoundStart?.();
    // Lap 20 is past every possible failsafe draw (lap 10 + rand(3),
    // i.e. 10-13), and on its very first decide() call this round the
    // repeat counter is still 0 and the hand score (10) is nowhere
    // near any skill level's own knockScoreThreshold -- so a knock
    // here can only be the failsafe.
    const action = decideSync(bot, stuckView({ lap: 20 }));
    assert.equal(action.type, "knock", `${skillLevel}: expected the failsafe to force a knock by lap 20`);
  }
});

// Decision Logging (specs/bots_v4.md).
test("createBot: lastTrace stays undefined without a requested logDetail, and is populated with it", () => {
  const withoutLog = createBot("expert", new Rng(1));
  withoutLog.onRoundStart?.();
  decideSync(withoutLog, stuckView({}));
  assert.equal(withoutLog.lastTrace, undefined);

  const withLog = createBot("expert", new Rng(1), undefined, "full");
  withLog.onRoundStart?.();
  decideSync(withLog, stuckView({}));
  assert.ok(withLog.lastTrace !== undefined && withLog.lastTrace.length > 0);
  assert.equal(withLog.lastTrace.filter((e) => e.acted).length, 1);
});

test("snapshotBot/createBot's state param round-trip a bot's round-scoped Knock bookkeeping", () => {
  const original = createBot("novice", new Rng(1));
  original.onRoundStart?.();
  // Novice's repeat-counter threshold is 2 -- the hand's first stuck
  // turn sets a new best (repeatCount 0); its second ties that best,
  // building up bookkeeping worth snapshotting without yet forcing a
  // knock (that needs a third).
  decideSync(original, stuckView({ lap: 2 }));
  decideSync(original, stuckView({ lap: 3 }));
  const snapshot = snapshotBot(original);
  assert.equal(snapshot.best.repeatCount, 1);

  // A freshly created bot restored from that snapshot (even seeded
  // from a different Rng) reports the exact same bookkeeping back --
  // it never rerolled a new failsafe lap or reset best/repeatCount.
  const restored = createBot("novice", new Rng(99), snapshot);
  assert.deepEqual(snapshotBot(restored), snapshot);
});

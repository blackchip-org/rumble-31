import { test } from "node:test";
import assert from "node:assert/strict";
import { newDeck, shuffleDeck } from "./deck.ts";
import { cardToString, RANKS, SUITS } from "./card.ts";
import { Rng } from "../rng.ts";

test("newDeck has 32 unique cards, 4 per rank, 8 per suit", () => {
  const deck = newDeck();
  assert.equal(deck.length, 32);

  const seen = new Set<string>();
  const rankCount = new Map<string, number>();
  const suitCount = new Map<string, number>();
  for (const c of deck) {
    const key = cardToString(c);
    assert.equal(seen.has(key), false, `duplicate card ${key}`);
    seen.add(key);
    rankCount.set(c.rank, (rankCount.get(c.rank) ?? 0) + 1);
    suitCount.set(c.suit, (suitCount.get(c.suit) ?? 0) + 1);
  }
  for (const r of RANKS) {
    assert.equal(rankCount.get(r), 4, `rankCount[${r}]`);
  }
  for (const s of SUITS) {
    assert.equal(suitCount.get(s), 8, `suitCount[${s}]`);
  }
});

test("shuffle with the same seed is deterministic", () => {
  const d1 = newDeck();
  shuffleDeck(d1, new Rng(42));

  const d2 = newDeck();
  shuffleDeck(d2, new Rng(42));

  assert.deepEqual(d1, d2);
});

test("shuffle is a permutation of the original deck", () => {
  const original = newDeck();
  const shuffled = newDeck();
  shuffleDeck(shuffled, new Rng(1));

  const origCount = new Map<string, number>();
  for (const c of original) {
    const key = cardToString(c);
    origCount.set(key, (origCount.get(key) ?? 0) + 1);
  }
  for (const c of shuffled) {
    const key = cardToString(c);
    origCount.set(key, (origCount.get(key) ?? 0) - 1);
  }
  for (const [key, n] of origCount) {
    assert.equal(n, 0, `card ${key} count mismatch after shuffle`);
  }
});

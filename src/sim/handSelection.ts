// Monte Carlo analysis of the Hand Selection decision (specs/bots_v4.md):
// for a freshly dealt hand and pot, is swapping actually an improvement?
// This deals real (hand, pot) pairs from the deck and measures the pot
// against the hand directly, instead of guessing a skill level's rule.

import type { Card } from "../card/card.ts";
import { newDeck, shuffleDeck } from "../card/deck.ts";
import { score } from "../card/score.ts";
import { Rng } from "../rng.ts";

// HandPotSample is one dealt (hand, pot) pair's scores.
export interface HandPotSample {
  handScore: number;
  potScore: number;
}

// sampleHandsAndPots deals `trials` independent (hand, pot) pairs: each
// trial shuffles a fresh 32-card deck and takes the first 3 cards as the
// hand and the next 3 as the pot, so within a trial the two are always
// disjoint, matching a real deal.
export function sampleHandsAndPots(trials: number, seed: number): HandPotSample[] {
  const rng = new Rng(seed);
  const samples: HandPotSample[] = [];

  for (let i = 0; i < trials; i++) {
    const deck: Card[] = newDeck();
    shuffleDeck(deck, rng);
    const hand = deck.slice(0, 3) as [Card, Card, Card];
    const pot = deck.slice(3, 6) as [Card, Card, Card];
    samples.push({ handScore: score(hand), potScore: score(pot) });
  }

  return samples;
}

// HandScoreBucket aggregates every sample dealt with a particular hand
// score, answering: given this hand, how often would a random pot beat
// it, and by how much?
export interface HandScoreBucket {
  handScore: number;
  trials: number;
  // swapWinRate is the fraction of trials where the pot outscored the
  // hand (a tie is not a win -- swapping for an equal pot is not an
  // advantage).
  swapWinRate: number;
  // avgAlwaysSwapGain is the mean potScore - handScore across every
  // trial, i.e. the expected score change of a rule that always swaps.
  avgAlwaysSwapGain: number;
  // avgOptimalGain is the mean max(potScore, handScore) - handScore, the
  // expected score change of always taking the better of the two --
  // an upper bound no fixed rule can beat.
  avgOptimalGain: number;
}

// aggregateByHandScore groups samples by their exact hand score and
// summarizes each group as a HandScoreBucket, sorted by hand score
// ascending.
export function aggregateByHandScore(samples: readonly HandPotSample[]): HandScoreBucket[] {
  const groups = new Map<number, HandPotSample[]>();
  for (const sample of samples) {
    const group = groups.get(sample.handScore);
    if (group) {
      group.push(sample);
    } else {
      groups.set(sample.handScore, [sample]);
    }
  }

  const buckets: HandScoreBucket[] = [];
  for (const [handScore, group] of groups) {
    const trials = group.length;
    const wins = group.filter((s) => s.potScore > s.handScore).length;
    const alwaysSwapGain = group.reduce((total, s) => total + (s.potScore - s.handScore), 0) / trials;
    const optimalGain = group.reduce((total, s) => total + (Math.max(s.potScore, s.handScore) - s.handScore), 0) / trials;
    buckets.push({ handScore, trials, swapWinRate: wins / trials, avgAlwaysSwapGain: alwaysSwapGain, avgOptimalGain: optimalGain });
  }

  return buckets.sort((a, b) => a.handScore - b.handScore);
}

// formatHandScoreTable renders buckets as plain-text table lines, e.g.
// for printing to stdout.
export function formatHandScoreTable(trials: number, seed: number, buckets: readonly HandScoreBucket[]): string[] {
  const headers = ["Hand Score", "Trials", "Swap Wins", "Avg Always-Swap Gain", "Avg Optimal Gain"];
  const rows = buckets.map((b) => [
    String(b.handScore),
    String(b.trials),
    `${(b.swapWinRate * 100).toFixed(1)}%`,
    b.avgAlwaysSwapGain >= 0 ? `+${b.avgAlwaysSwapGain.toFixed(2)}` : b.avgAlwaysSwapGain.toFixed(2),
    `+${b.avgOptimalGain.toFixed(2)}`,
  ]);

  const widths = headers.map((h, col) => Math.max(h.length, ...rows.map((r) => (r[col] as string).length)));
  const formatRow = (cells: readonly string[]): string => cells.map((c, i) => c.padEnd(widths[i] as number)).join("  ").trimEnd();

  return [
    `Dealt ${trials} hand/pot pair(s) with seed ${seed}, grouped by hand score`,
    "",
    formatRow(headers),
    formatRow(widths.map((w) => "-".repeat(w))),
    ...rows.map(formatRow),
  ];
}

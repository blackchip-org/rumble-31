import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng } from "./rng.ts";

test("same seed produces the same sequence", () => {
  const a = new Rng(42);
  const b = new Rng(42);
  for (let i = 0; i < 20; i++) {
    assert.equal(a.next(), b.next());
  }
});

test("different seeds diverge", () => {
  const a = new Rng(1);
  const b = new Rng(2);
  const seqA = Array.from({ length: 5 }, () => a.next());
  const seqB = Array.from({ length: 5 }, () => b.next());
  assert.notDeepEqual(seqA, seqB);
});

test("intn stays within [0, n)", () => {
  const rng = new Rng(7);
  for (let i = 0; i < 1000; i++) {
    const v = rng.intn(4);
    assert.ok(v >= 0 && v < 4, `intn(4) = ${v} out of range`);
  }
});

test("shuffle with the same seed is deterministic", () => {
  const a = [1, 2, 3, 4, 5, 6, 7, 8];
  const b = [1, 2, 3, 4, 5, 6, 7, 8];
  new Rng(42).shuffle(a);
  new Rng(42).shuffle(b);
  assert.deepEqual(a, b);
});

test("shuffle is a permutation of the original", () => {
  const original = [1, 2, 3, 4, 5, 6, 7, 8];
  const shuffled = [...original];
  new Rng(1).shuffle(shuffled);
  assert.deepEqual([...shuffled].sort((x, y) => x - y), original);
});

// Rng is a small seeded pseudo-random number generator (mulberry32).
//
// A given seed always reproduces the same sequence within this
// implementation; that's all a -seed flag promises.
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  // next returns a pseudo-random float in [0, 1).
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // intn returns a pseudo-random integer in [0, n).
  intn(n: number): number {
    return Math.floor(this.next() * n);
  }

  // nextSeed derives a new 32-bit seed, for seeding an independent Rng
  // (e.g. one per game within a match).
  nextSeed(): number {
    return Math.floor(this.next() * 0x100000000);
  }

  // shuffle randomizes arr in place using a Fisher-Yates shuffle.
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.intn(i + 1);
      const tmp = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = tmp;
    }
  }
}

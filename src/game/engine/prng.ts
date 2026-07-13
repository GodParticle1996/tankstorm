// ═══════════════════════════════════════════════════════════
//  Seeded PRNG — mulberry32
//  Deterministic randomness for the entire engine.
//  Math.random() is BANNED inside game/engine/**.
//  This enables reproducible bugs, replays, and headless tests.
// ═══════════════════════════════════════════════════════════

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Core mulberry32 algorithm — returns [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Random float in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Random integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Random sign: -1 or +1 */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  /** Pick a random element from an array */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Shuffle array in-place (Fisher-Yates) and return it */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Get current state for save/restore (replays) */
  getState(): number {
    return this.state;
  }

  /** Restore state */
  setState(state: number): void {
    this.state = state >>> 0;
  }

  /** Create an independent copy */
  clone(): Rng {
    const r = new Rng(0);
    r.state = this.state;
    return r;
  }
}

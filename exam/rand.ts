// Deterministic choices from a seed, so anyone can regenerate an hour's questions.
import { keccakText } from '../lib/keccak.ts';

export class Rand {
  #state: string;
  #n = 0;
  constructor(seed: string) { this.#state = seed; }
  /** uniform integer in [0, n) */
  int(n: number): number {
    const h = keccakText(`${this.#state}:${this.#n++}`);
    return Number(BigInt(h) % BigInt(n));
  }
  pick<T>(xs: readonly T[]): T {
    if (!xs.length) throw new Error('pick from empty list');
    return xs[this.int(xs.length)]!;
  }
  shuffle<T>(xs: readonly T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; }
    return a;
  }
}

// Exact match after normalising the answer shape. A block off by one is wrong.
import type { Question } from './types.ts';

export function normalise(format: Question['format'], raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().replace(/^["'`]|["'`.]$/g, '').trim();
  if (format === 'address') {
    const m = s.match(/0x[0-9a-f]{40}/);
    return m ? m[0] : null;
  }
  if (format === 'integer') {
    if (/^0x[0-9a-f]+$/.test(s)) return BigInt(s).toString();
    const t = s.replace(/[,_\s]/g, '');
    return /^-?\d+$/.test(t) ? BigInt(t).toString() : null;
  }
  if (/^(yes|true|y)$/.test(s)) return 'yes';
  if (/^(no|false|n)$/.test(s)) return 'no';
  return null;
}

export const isCorrect = (q: Pick<Question, 'format' | 'key'>, answer: string | null): boolean =>
  answer !== null && normalise(q.format, answer) === q.key;

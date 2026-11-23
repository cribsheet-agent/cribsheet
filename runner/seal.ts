// Seal bytes exactly as in spec/seal.md.
import { createHash } from 'node:crypto';

const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

export function sealBytes(hour: number, resultsLine: string, notes: { manual: string; self: string; crowd: string }): string {
  return `cribsheet-seal-v1\nhour=${hour}\nresults=${sha(resultsLine)}\nmanual=${sha(notes.manual)}\nself=${sha(notes.self)}\ncrowd=${sha(notes.crowd)}\n`;
}
export const sealRoot = (bytes: string): string => '0x' + sha(bytes);

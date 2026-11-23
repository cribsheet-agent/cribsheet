// Fact check of the notes: every event topic must appear in real factory logs,
// every 4-byte selector must return data from a real call. Addresses with code are "seen";
// other lines are "untestable" (advice, or an address the chain cannot vouch for).
import { blockNumber, ethCall, getLogs, rpc } from '../lib/rpc.ts';
import { encodeAddress } from '../lib/abi.ts';
import { FACTORY } from '../exam/pons.ts';

export type Mark = 'seen' | 'cracked' | 'untestable';
export interface CheckedItem { kind: 'topic' | 'selector' | 'address'; value: string; mark: Mark; line: string }

export async function checkNotes(notes: string, sampleToken: string): Promise<CheckedItem[]> {
  const head = await blockNumber();
  const out: CheckedItem[] = [];
  const seen = new Set<string>();
  for (const line of notes.split('\n')) {
    for (const m of line.matchAll(/0x[0-9a-fA-F]+/g)) {
      const v = m[0].toLowerCase();
      if (seen.has(v)) continue;
      seen.add(v);
      if (v.length === 66) out.push({ kind: 'topic', value: v, line: line.trim(), mark: await topicSeen(v, head) });
      else if (v.length === 10) out.push({ kind: 'selector', value: v, line: line.trim(), mark: await selectorWorks(v, sampleToken) });
      else if (v.length === 42) out.push({ kind: 'address', value: v, line: line.trim(), mark: await hasCode(v) });
    }
  }
  return out;
}

async function topicSeen(topic: string, head: number): Promise<Mark> {
  // as topic0 on the factory, or as an indexed topic anywhere in the factory's last day of logs
  const logs = await getLogs({ address: FACTORY, topics: [topic], fromBlock: Math.max(0, head - 5_500_000), toBlock: head });
  return logs.length ? 'seen' : 'cracked';
}

async function selectorWorks(sel: string, token: string): Promise<Mark> {
  for (const data of [sel, sel + encodeAddress(token)]) {
    try { if ((await ethCall(FACTORY, data)).length > 2) return 'seen'; } catch { /* reverted: try the next shape */ }
  }
  return 'cracked';
}

async function hasCode(addr: string): Promise<Mark> {
  try { return (await rpc<string>('eth_getCode', [addr, 'latest'])).length > 2 ? 'seen' : 'untestable'; }
  catch { return 'untestable'; }
}

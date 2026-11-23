// Fact check of the notes, before every exam. Each fact is marked seen, cracked or untestable.
//  - 32-byte hashes: seen if they are topic0 in the factory's logs, or the hash of a known event
//    (the factory's verified ABI, ERC-20, or an event seen in a sample token's or curve's logs).
//  - 4-byte selectors: seen if a call to the factory, a sample token or a sample curve returns data.
//  - addresses: seen if they hold code, otherwise untestable.
//  - names written as code (`Name(...)` or a backticked PascalCase name): seen if the factory's
//    verified ABI or ERC-20 has them; a function named with no ABI match is tried on chain by its
//    selector; an event named with no ABI match is cracked unless its full signature is given
//    and its hash shows up in the logs.
import { readFileSync } from 'node:fs';
import { blockNumber, ethCall, getLogs, rpc } from '../lib/rpc.ts';
import { encodeAddress } from '../lib/abi.ts';
import { keccakText, selector } from '../lib/keccak.ts';
import { FACTORY, launchedToken } from '../exam/pons.ts';

export type Mark = 'seen' | 'cracked' | 'untestable';
export interface CheckedItem { kind: 'topic' | 'selector' | 'address' | 'name'; value: string; mark: Mark; line: string }

interface AbiItem { type: 'event' | 'function'; signature: string }
const FACTORY_ABI: AbiItem[] = JSON.parse(readFileSync(new URL('./factory-abi.json', import.meta.url), 'utf8')).items;
const ERC20: AbiItem[] = [
  ...['Transfer(address,address,uint256)', 'Approval(address,address,uint256)'].map(signature => ({ type: 'event' as const, signature })),
  ...['name()', 'symbol()', 'decimals()', 'totalSupply()', 'balanceOf(address)', 'allowance(address,address)',
    'transfer(address,uint256)', 'approve(address,uint256)', 'transferFrom(address,address,uint256)'].map(signature => ({ type: 'function' as const, signature })),
];
export const KNOWN: AbiItem[] = [...FACTORY_ABI, ...ERC20];
const nameOf = (sig: string): string => sig.slice(0, sig.indexOf('('));
const KNOWN_EVENT_TOPICS = new Set(KNOWN.filter(i => i.type === 'event').map(i => keccakText(i.signature)));

// a comma list of Solidity types, e.g. "address,uint256[]"
const TYPE = /^(address|bool|string|bytes([1-9]|[12][0-9]|3[0-2])?|u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?)(\[\d*\])*$/;
const isTypeList = (args: string): boolean => args.trim() === '' || args.split(',').every(a => TYPE.test(a.trim()));
// not contract names: JSON-RPC methods and the exam's own tools
const IGNORE = /^(eth_|net_|web3_|debug_)|^(rpc|keccak|keccak256|answer|sha3)$/;

/** Names the notes present as contract events or functions. */
export function namesIn(line: string): { name: string; args: string | undefined }[] {
  const out: { name: string; args: string | undefined }[] = [];
  for (const m of line.matchAll(/\b([A-Za-z_][A-Za-z0-9_]{2,})\(([^()]*)\)/g)) out.push({ name: m[1]!, args: m[2]! });
  for (const m of line.matchAll(/`([A-Z][A-Za-z0-9_]{2,})`/g)) out.push({ name: m[1]!, args: undefined });
  return out.filter(n => !IGNORE.test(n.name));
}

export async function checkNotes(notes: string, sampleToken: string): Promise<CheckedItem[]> {
  const head = await blockNumber();
  const targets = [FACTORY];
  if (/^0x[0-9a-f]{40}$/.test(sampleToken) && !/^0x0+$/.test(sampleToken)) {
    targets.push(sampleToken);
    try { targets.push((await launchedToken(sampleToken, 'latest')).curve); } catch { /* not a Pons token */ }
  }
  const out: CheckedItem[] = [];
  const seen = new Set<string>();
  const once = (k: string): boolean => seen.has(k) ? false : (seen.add(k), true);
  for (const raw of notes.split('\n')) {
    const line = raw.trim();
    for (const m of line.matchAll(/0x[0-9a-fA-F]+/g)) {
      const v = m[0].toLowerCase();
      if (!once(v)) continue;
      if (v.length === 66) out.push({ kind: 'topic', value: v, line, mark: await topicSeen(v, head, targets) });
      else if (v.length === 10) out.push({ kind: 'selector', value: v, line, mark: await selectorWorks(v, targets, sampleToken) });
      else if (v.length === 42) out.push({ kind: 'address', value: v, line, mark: await hasCode(v) });
    }
    for (const { name, args } of namesIn(line)) {
      const typed = args !== undefined && args.trim() !== '' && isTypeList(args) ? `${name}(${args.replace(/\s+/g, '')})` : undefined;
      if (!once('name:' + (typed ?? name))) continue;
      out.push({ kind: 'name', value: typed ?? name, line, mark: await nameMark(name, args, typed, head, targets, sampleToken) });
    }
  }
  return out;
}

async function nameMark(name: string, args: string | undefined, typed: string | undefined, head: number, targets: string[], token: string): Promise<Mark> {
  const known = KNOWN.filter(i => nameOf(i.signature) === name);
  if (known.length) {
    // a full signature must match one of the overloads; parameter names instead of types are fine
    return !typed || known.some(i => i.signature === typed) ? 'seen' : 'cracked';
  }
  const looksLikeEvent = /^[A-Z]/.test(name);
  if (looksLikeEvent) return typed ? topicSeen(keccakText(typed), head, targets) : 'cracked';
  // an unknown function: try its selector, as written or with no arguments
  const sig = typed ?? (args !== undefined && args.trim() === '' ? `${name}()` : undefined);
  return sig ? selectorWorks(selector(sig), targets, token) : 'cracked';
}

async function topicSeen(topic: string, head: number, targets: string[]): Promise<Mark> {
  if (KNOWN_EVENT_TOPICS.has(topic)) return 'seen';
  for (const address of targets) {
    // the factory: about the last week; a token or curve: the last day is plenty
    const span = address === FACTORY ? 5_500_000 : 800_000;
    const logs = await getLogs({ address, topics: [topic], fromBlock: Math.max(0, head - span), toBlock: head });
    if (logs.length) return 'seen';
  }
  return 'cracked';
}

async function selectorWorks(sel: string, targets: string[], token: string): Promise<Mark> {
  for (const to of targets) {
    for (const data of [sel, sel + encodeAddress(token)]) {
      try { if ((await ethCall(to, data)).length > 2) return 'seen'; } catch { /* reverted: try the next shape */ }
    }
  }
  return 'cracked';
}

async function hasCode(addr: string): Promise<Mark> {
  try { return (await rpc<string>('eth_getCode', [addr, 'latest'])).length > 2 ? 'seen' : 'untestable'; }
  catch { return 'untestable'; }
}

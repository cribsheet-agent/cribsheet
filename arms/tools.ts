// The three tools every arm gets, with the same limits for all four.
import { blockNumber, rpc } from '../lib/rpc.ts';
import { keccakText } from '../lib/keccak.ts';
import type { ToolSpec } from '../lib/model.ts';

export const READ_METHODS = new Set([
  'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getLogs', 'eth_call', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_getCode', 'eth_getStorageAt', 'eth_getBalance', 'eth_chainId',
]);
export const MAX_LOG_RANGE = 1_000_000;
const MAX_TEXT = 4000;
const MAX_LOGS_SHOWN = 25;

export const TOOLS: ToolSpec[] = [
  { type: 'function', function: {
    name: 'rpc',
    description: 'Read-only JSON-RPC call to Robinhood Chain (chain id 4663). Allowed methods: ' + [...READ_METHODS].join(', ') +
      `. eth_getLogs ranges are limited to ${MAX_LOG_RANGE} blocks and return {count, logs} with at most ${MAX_LOGS_SHOWN} logs shown. Long results are cut to ${MAX_TEXT} characters.`,
    parameters: { type: 'object', properties: { method: { type: 'string' }, params: { type: 'array', items: {} } }, required: ['method', 'params'] },
  } },
  { type: 'function', function: {
    name: 'keccak',
    description: 'keccak256 of a UTF-8 string, for event topics and function selectors. Example: "Transfer(address,address,uint256)".',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  } },
  { type: 'function', function: {
    name: 'answer',
    description: 'Submit your final answer. This ends the question and counts as one tool call.',
    parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
  } },
];

export async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === 'keccak') return keccakText(String(args.text ?? ''));
  if (name !== 'rpc') return `error: unknown tool ${name}`;
  const method = String(args.method ?? '');
  const params = Array.isArray(args.params) ? args.params : [];
  if (!READ_METHODS.has(method)) return `error: method ${method} is not allowed`;
  if (method === 'eth_getLogs') {
    // block tags work as on the real RPC; the range limit is checked on the resolved numbers
    const f = { ...(params[0] ?? {}) as { fromBlock?: string; toBlock?: string } };
    const head = /latest|pending|safe|finalized/.test(`${f.fromBlock} ${f.toBlock}`) || f.toBlock === undefined ? await blockNumber() : 0;
    const from = resolve(f.fromBlock ?? 'latest', head), to = resolve(f.toBlock ?? 'latest', head);
    if (from === null || to === null) return 'error: fromBlock and toBlock must be hex block numbers or a block tag such as "latest"';
    if (to - from + 1 > MAX_LOG_RANGE) return `error: range of ${to - from + 1} blocks is over the ${MAX_LOG_RANGE} limit`;
  }
  try {
    const result = await rpc<unknown>(method, params);
    if (method === 'eth_getLogs' && Array.isArray(result)) {
      const logs = result.slice(0, MAX_LOGS_SHOWN).map((l: { blockNumber: string; transactionHash: string; topics: string[]; data: string; address: string }) =>
        ({ address: l.address, blockNumber: l.blockNumber, transactionHash: l.transactionHash, topics: l.topics, data: l.data }));
      return cut(JSON.stringify({ count: result.length, logs }));
    }
    return cut(JSON.stringify(result));
  } catch (e) {
    return `error: ${(e as Error).message}`;
  }
}

const resolve = (v: unknown, head: number): number | null => {
  if (typeof v !== 'string') return null;
  if (/^0x[0-9a-f]+$/i.test(v)) return Number.parseInt(v, 16);
  if (v === 'earliest') return 0;
  return /^(latest|pending|safe|finalized)$/.test(v) ? head : null;
};
const cut = (s: string) => (s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + `…[cut, ${s.length} chars]` : s);

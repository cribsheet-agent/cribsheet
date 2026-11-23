// Minimal JSON-RPC client for Robinhood Chain with retries and log-range chunking.

export const RPC_URL = process.env.CRIBSHEET_RPC ?? 'https://rpc.mainnet.chain.robinhood.com';

export interface Log {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

export class RpcError extends Error {
  readonly code: number | undefined;
  constructor(message: string, code?: number) { super(message); this.code = code; }
}

let nextId = 1;

export async function rpc<T = unknown>(method: string, params: unknown[], url = RPC_URL): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) throw new RpcError(`HTTP ${res.status}`);
      if (!res.ok) throw new RpcError(`HTTP ${res.status}`, res.status);
      const body = await res.json() as { result?: T; error?: { code: number; message: string } };
      if (body.error) throw new RpcError(body.error.message, body.error.code);
      return body.result as T;
    } catch (e) {
      last = e;
      // JSON-RPC errors (bad params, reverts) are answers, not outages: do not retry them
      if (e instanceof RpcError && e.code !== undefined) throw e;
      await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw last;
}

export const hex = (n: number | bigint): string => '0x' + n.toString(16);
export const num = (h: string): number => Number.parseInt(h, 16);

export async function blockNumber(): Promise<number> {
  return num(await rpc<string>('eth_blockNumber', []));
}

export async function blockTime(block: number): Promise<number> {
  const b = await rpc<{ timestamp: string } | null>('eth_getBlockByNumber', [hex(block), false]);
  if (!b) throw new Error(`block ${block} not found`);
  return num(b.timestamp);
}

/** First block whose timestamp is >= ts (binary search). */
export async function blockAtOrAfter(ts: number, hi?: number): Promise<number> {
  let lo = 0;
  hi ??= await blockNumber();
  if (await blockTime(hi) < ts) throw new Error(`time ${ts} is after the chain head`);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await blockTime(mid) < ts) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** eth_getLogs split into chunks so long ranges stay under provider limits. */
export async function getLogs(filter: { address?: string; topics?: (string | null)[]; fromBlock: number; toBlock: number }, chunk = 1_000_000): Promise<Log[]> {
  const out: Log[] = [];
  for (let from = filter.fromBlock; from <= filter.toBlock; from += chunk) {
    const to = Math.min(filter.toBlock, from + chunk - 1);
    out.push(...await rpc<Log[]>('eth_getLogs', [{ address: filter.address, topics: filter.topics, fromBlock: hex(from), toBlock: hex(to) }]));
  }
  return out;
}

export async function ethCall(to: string, data: string, block: number | 'latest' = 'latest'): Promise<string> {
  return rpc<string>('eth_call', [{ to, data }, typeof block === 'number' ? hex(block) : block]);
}

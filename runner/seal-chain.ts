// Writes an hour's root to CribsheetSeals on Robinhood Chain (chain 4663).
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getRpcUrl } from '../lib/rpc.ts';

export const SEALS_ABI = parseAbi([
  'function seal(uint256 hour, bytes32 root)',
  'function rootOf(uint256 hour) view returns (bytes32)',
  'event Sealed(uint256 indexed hour, bytes32 root)',
]);

export const robinhood = () => defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [getRpcUrl()] } },
});

export interface SealTx { hour: number; root: string; contract: string; tx: string; block: number }

/** Seals `hour` unless the contract already holds a root for it (a retried step). */
export async function sealOnChain(opts: { contract: Hex; key: Hex; hour: number; root: Hex }): Promise<SealTx | { hour: number; root: string; contract: string; already: string }> {
  const chain = robinhood();
  const pub = createPublicClient({ chain, transport: http() });
  const existing = await pub.readContract({ address: opts.contract, abi: SEALS_ABI, functionName: 'rootOf', args: [BigInt(opts.hour)] });
  if (existing !== `0x${'0'.repeat(64)}`) return { hour: opts.hour, root: opts.root, contract: opts.contract, already: existing };
  const wallet = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(opts.key) });
  const tx = await wallet.writeContract({ address: opts.contract, abi: SEALS_ABI, functionName: 'seal', args: [BigInt(opts.hour), opts.root] });
  const receipt = await pub.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
  if (receipt.status !== 'success') throw new Error(`seal transaction ${tx} reverted`);
  return { hour: opts.hour, root: opts.root, contract: opts.contract, tx, block: Number(receipt.blockNumber) };
}

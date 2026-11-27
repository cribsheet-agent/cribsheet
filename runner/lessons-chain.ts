// CribsheetLessons on Robinhood Chain: read the board, and settle or retire lessons with the judge key.
import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { robinhood } from './seal-chain.ts';
import { KIND_ORDER, type Board, type ChainLesson, type LessonStatus, type Settler } from './lessons.ts';

export const LESSONS_ABI = parseAbi([
  'function count() view returns (uint256)',
  'function lessonOf(uint256 id) view returns ((address author, uint8 kind, uint8 status, uint64 submittedAt, uint64 settledAt, bytes32 evidence, string text))',
  'function token() view returns (address)',
  'function judge() view returns (address)',
  'function stake() view returns (uint256)',
  'function reward() view returns (uint256)',
  'function rewardBps() view returns (uint256)',
  'function pool() view returns (uint256)',
  'function active() view returns (uint256)',
  'function submit(string text, uint8 kind) returns (uint256)',
  'function settle(uint256 id, bool kept, bytes32 evidence)',
  'function retire(uint256 id, bytes32 evidence)',
  'error TooEarly(uint256 at)',
  'error TooLate(uint256 deadline)',
  'error WrongStatus(uint256 id, uint8 status)',
  'error NotJudge()',
  'error EmptyEvidence()',
]);

const STATUS: LessonStatus[] = ['none' as LessonStatus, 'testing', 'kept', 'burned', 'retired', 'reclaimed'];

/** Every lesson and the contract's fixed numbers, read at the chain head. */
export async function readBoard(contract: Hex): Promise<Board> {
  const pub = createPublicClient({ chain: robinhood(), transport: http() });
  const read = <T>(functionName: string, args: unknown[] = []) =>
    pub.readContract({ address: contract, abi: LESSONS_ABI, functionName, args } as never) as Promise<T>;
  const block = await pub.getBlockNumber();
  const [n, token, judge, stake, reward, rewardBps, pool, active] = await Promise.all([
    read<bigint>('count'), read<string>('token'), read<string>('judge'), read<bigint>('stake'), read<bigint>('reward'),
    read<bigint>('rewardBps'), read<bigint>('pool'), read<bigint>('active'),
  ]);
  const lessons: ChainLesson[] = [];
  for (let id = 0; id < Number(n); id++) {
    const l = await read<{ author: string; kind: number; status: number; submittedAt: bigint; settledAt: bigint; evidence: string; text: string }>('lessonOf', [BigInt(id)]);
    lessons.push({
      id, author: l.author.toLowerCase(), kind: KIND_ORDER[l.kind]!, status: STATUS[l.status]!,
      submitted_at: Number(l.submittedAt), settled_at: Number(l.settledAt), evidence: l.evidence, text: l.text,
    });
  }
  return {
    contract: contract.toLowerCase(), chain_id: 4663, token: token.toLowerCase(), judge: judge.toLowerCase(),
    stake: stake.toString(), reward: reward.toString(), reward_bps: Number(rewardBps), pool: pool.toString(),
    active: Number(active), max_active: 12, read_at_block: Number(block), lessons,
  };
}

/** Writes a verdict with the judge key. A verdict the chain already holds is not sent again. */
export function chainSettler(contract: Hex, key: Hex): Settler {
  return async job => {
    const chain = robinhood();
    const pub = createPublicClient({ chain, transport: http() });
    const account = privateKeyToAccount(key);
    const wallet = createWalletClient({ chain, transport: http(), account });
    const l = await pub.readContract({ address: contract, abi: LESSONS_ABI, functionName: 'lessonOf', args: [BigInt(job.id)] });
    const status = STATUS[l.status]!;
    const want = job.action === 'retire' ? 'kept' : 'testing';
    if (status !== want) return { done: `chain says ${status}` };
    const call = job.action === 'retire'
      ? { functionName: 'retire' as const, args: [BigInt(job.id), job.evidence] as const }
      : { functionName: 'settle' as const, args: [BigInt(job.id), job.kept, job.evidence] as const };
    try {
      await pub.simulateContract({ address: contract, abi: LESSONS_ABI, account, ...call } as never);
    } catch (e) {
      const revert = e instanceof BaseError ? e.walk(x => x instanceof ContractFunctionRevertedError) : null;
      const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
      // three hours after submission at the earliest: try again next hour
      if (name === 'TooEarly') return { wait: 'settles from three hours after submission' };
      if (name === 'TooLate') return { done: 'settle window passed; the author can reclaim the stake' };
      throw e;
    }
    const tx = await wallet.writeContract({ address: contract, abi: LESSONS_ABI, ...call } as never);
    const receipt = await pub.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
    if (receipt.status !== 'success') throw new Error(`${call.functionName} transaction ${tx} reverted`);
    return { tx, block: Number(receipt.blockNumber) };
  };
}

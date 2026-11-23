// Builds one hour's questions and reads every key before any agent starts.
// Keys that need more than one lookup are read two independent ways; if the two
// readings disagree the question is dropped and the drop is recorded.
import { blockAtOrAfter, blockTime, getLogs, rpc, num } from '../lib/rpc.ts';
import { keccakText } from '../lib/keccak.ts';
import { FACTORY, TOPIC, graduationsBetween, launchedToken, launchesBetween, type Launch } from './pons.ts';
import { Rand } from './rand.ts';
import { KIND_LEVEL, LEVEL_BUDGET, type Dropped, type ExamWindow, type Kind, type Question } from './types.ts';

const KINDS_AT: Record<number, Kind[]> = {
  1: ['curve', 'creator', 'launch_block'],
  2: ['creator_tax', 'graduated', 'hour_launch_count'],
  3: ['creator_24h'],
  4: ['creator_7d'],
};

/** Eight questions: four at the level, two below (retention), two above (probe). */
export function plan(level: number, rand: Rand): Kind[] {
  const below = Math.max(1, level - 1), above = Math.min(4, level + 1);
  // cycle through each level's kinds from a random offset, so one hour mixes kinds
  const offset: Record<number, number> = {};
  const take = (lvl: number, n: number) => Array.from({ length: n }, () => {
    const ks = KINDS_AT[lvl]!;
    offset[lvl] ??= rand.int(ks.length);
    return ks[offset[lvl]++ % ks.length]!;
  });
  return [...take(level, 4), ...take(below, 2), ...take(above, 2)];
}

export interface Generated { window: ExamWindow; seed: string; questions: Question[]; dropped: Dropped[] }

export async function generate(opts: { hour: number; level: number; start_block: number; end_block: number; key_block: number }): Promise<Generated> {
  const { hour, level, start_block, end_block, key_block } = opts;
  const startHash = (await rpc<{ hash: string }>('eth_getBlockByNumber', ['0x' + start_block.toString(16), false])).hash;
  const seed = keccakText(`cribsheet:${hour}:${startHash}`);
  const rand = new Rand(seed);
  const window: ExamWindow = { hour, start_block, end_block, key_block };

  const launches = await launchesBetween(start_block, end_block);
  if (!launches.length) throw new Error(`no launches between ${start_block} and ${end_block}`);
  const kinds = plan(level, rand);
  const questions: Question[] = [];
  const dropped: Dropped[] = [];
  const used = new Set<string>();
  const freshToken = (): Launch => {
    const free = launches.filter(l => !used.has(l.token));
    const l = rand.pick(free.length ? free : launches);
    used.add(l.token);
    return l;
  };

  // yes/no balance for "graduated": alternate, starting from a coin flip
  let gradYes = rand.int(2) === 0;
  const keyTime = await blockTime(key_block);
  const block24h = await blockAtOrAfter(keyTime - 86_400, key_block);
  const block7d = await blockAtOrAfter(keyTime - 7 * 86_400, key_block);
  const grads7d = await graduationsBetween(block7d, key_block);
  const launches7d = await launchesBetween(block7d, key_block);
  const countSince = (deployer: string, from: number) => launches7d.filter(x => x.deployer === deployer && x.block >= from).length;
  // half of the "how many launches" questions ask about a deployer with more than one launch
  let wantRepeat = rand.int(2) === 0;

  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i]!;
    const id = `h${hour}-q${i + 1}`;
    const base = { id, kind, level: KIND_LEVEL[kind], official: true, budget: LEVEL_BUDGET[KIND_LEVEL[kind]]! };
    try {
      questions.push({ ...base, ...await build(kind) });
    } catch (e) {
      dropped.push({ id, kind, reason: (e as Error).message });
    }
  }
  return { window, seed, questions, dropped };

  async function build(kind: Kind): Promise<Pick<Question, 'text' | 'format' | 'key' | 'key_sources'>> {
    switch (kind) {
      case 'curve': {
        const l = freshToken();
        const onChain = await launchedToken(l.token, 'latest');
        agree(l.curve, onChain.curve, 'curve');
        return { format: 'address', key: l.curve, key_sources: ['TokenLaunched topic 2', 'getLaunchedToken(token).curve'],
          text: `What is the bonding curve address of token ${l.token}, launched on the Pons launch factory? Answer with the address.` };
      }
      case 'creator': {
        const l = freshToken();
        const onChain = await launchedToken(l.token, 'latest');
        agree(l.deployer, onChain.deployer, 'deployer');
        return { format: 'address', key: l.deployer, key_sources: ['TokenLaunched topic 3', 'getLaunchedToken(token).deployer'],
          text: `Which address deployed token ${l.token} through the Pons launch factory? Answer with the address.` };
      }
      case 'launch_block': {
        const l = freshToken();
        const receipt = await rpc<{ blockNumber: string }>('eth_getTransactionReceipt', [l.tx]);
        agree(String(l.block), String(num(receipt.blockNumber)), 'launch block');
        return { format: 'integer', key: String(l.block), key_sources: ['TokenLaunched log block', 'launch transaction receipt'],
          text: `In which block was token ${l.token} launched on the Pons launch factory? Answer with the block number.` };
      }
      case 'creator_tax': {
        const l = freshToken();
        const t = await launchedToken(l.token, 'latest');
        return { format: 'integer', key: String(t.creatorTaxBps), key_sources: ['getLaunchedToken(token).creatorTaxBps'],
          text: `What creator tax, in basis points, does token ${l.token} have on the Pons launch factory as of block ${key_block}? Answer with an integer.` };
      }
      case 'graduated': {
        const wantYes = gradYes; gradYes = !gradYes;
        let token: string, sinceBlock: number;
        if (wantYes) {
          const free = grads7d.filter(g => !used.has(g.token));
          if (!free.length) throw new Error('no graduated token in the last 7 days');
          token = rand.pick(free).token; sinceBlock = block7d;
        } else {
          const l = freshToken(); token = l.token; sinceBlock = l.block;
        }
        used.add(token);
        const logs = await getLogs({ address: FACTORY, topics: [TOPIC.PoolGraduated, '0x' + token.slice(2).padStart(64, '0')], fromBlock: sinceBlock, toBlock: key_block });
        const byLog = logs.length > 0;
        const byPhase = (await launchedToken(token, 'latest')).phase === 2;
        agree(String(byLog), String(byPhase), 'graduated');
        return { format: 'yesno', key: byLog ? 'yes' : 'no', key_sources: ['PoolGraduated log for the token', 'getLaunchedToken(token).phase == 2'],
          text: `As of block ${key_block}, has token ${token} graduated from its Pons bonding curve? Answer yes or no.` };
      }
      case 'hour_launch_count': {
        const filtered = launches.length;
        const all = await getLogs({ address: FACTORY, fromBlock: start_block, toBlock: end_block });
        const local = all.filter(l => l.topics[0] === TOPIC.TokenLaunched).length;
        agree(String(filtered), String(local), 'launch count');
        return { format: 'integer', key: String(filtered), key_sources: ['eth_getLogs filtered by TokenLaunched topic', 'all factory logs counted locally'],
          text: `How many tokens did the Pons launch factory launch from block ${start_block} to block ${end_block}, both included? Answer with an integer.` };
      }
      case 'creator_24h':
      case 'creator_7d': {
        const from = kind === 'creator_24h' ? block24h : block7d;
        // repeat deployers come from the whole window of the question, not only the last hour
        const repeats = launches7d.filter(x => x.block >= from && !used.has(x.token) && countSince(x.deployer, from) > 1);
        let l: Launch;
        if (wantRepeat && repeats.length) { l = rand.pick(repeats); used.add(l.token); } else l = freshToken();
        wantRepeat = !wantRepeat;
        const byTopic = (await launchesBetween(from, key_block, l.deployer)).length;
        const byScan = countSince(l.deployer, from);
        agree(String(byTopic), String(byScan), 'launches by deployer');
        return { format: 'integer', key: String(byTopic), key_sources: ['eth_getLogs filtered by deployer topic', 'all launches of the last 7 days filtered locally by deployer'],
          text: `How many tokens did the deployer of token ${l.token} launch on the Pons launch factory from block ${from} to block ${key_block}, both included? Answer with an integer.` };
      }
    }
  }
}

function agree(a: string, b: string, what: string): void {
  if (a.toLowerCase() !== b.toLowerCase()) throw new Error(`two readings of ${what} disagree: ${a} vs ${b}`);
}

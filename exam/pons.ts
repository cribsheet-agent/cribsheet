// The Pons V2 launch factory on Robinhood Chain (chain 4663).
// Source verified on Sourcify (exact match). Topics are checked in test/keccak.test.ts.
import { asAddress, asBool, asUint, encodeAddress, topicAddress, word } from '../lib/abi.ts';
import { ethCall, getLogs, num, type Log } from '../lib/rpc.ts';
import { selector } from '../lib/keccak.ts';

export const FACTORY = '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e';
export const TOPIC = {
  TokenLaunched: '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607',
  PoolGraduated: '0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259',
} as const;
export const SEL = { getLaunchedToken: selector('getLaunchedToken(address)') };

export interface Launch {
  token: string;
  curve: string;
  deployer: string;
  pairToken: string;
  launchConfigId: bigint;
  graduationThreshold: bigint;
  block: number;
  tx: string;
}

export function decodeLaunch(l: Log): Launch {
  if (l.topics[0] !== TOPIC.TokenLaunched) throw new Error('not a TokenLaunched log');
  return {
    token: topicAddress(l.topics[1]!),
    curve: topicAddress(l.topics[2]!),
    deployer: topicAddress(l.topics[3]!),
    pairToken: asAddress(word(l.data, 0)),
    launchConfigId: asUint(word(l.data, 1)),
    graduationThreshold: asUint(word(l.data, 2)),
    block: num(l.blockNumber),
    tx: l.transactionHash,
  };
}

export async function launchesBetween(fromBlock: number, toBlock: number, deployer?: string): Promise<Launch[]> {
  const topics = [TOPIC.TokenLaunched, null, null, deployer ? '0x' + encodeAddress(deployer) : null];
  return (await getLogs({ address: FACTORY, topics, fromBlock, toBlock })).map(decodeLaunch);
}

export async function graduationsBetween(fromBlock: number, toBlock: number): Promise<{ token: string; block: number }[]> {
  return (await getLogs({ address: FACTORY, topics: [TOPIC.PoolGraduated], fromBlock, toBlock }))
    .map(l => ({ token: topicAddress(l.topics[1]!), block: num(l.blockNumber) }));
}

export interface LaunchedToken {
  token: string; curve: string; deployer: string; creatorFeeRecipient: string; pairToken: string;
  graduationThreshold: bigint; creatorTaxBps: number; buybackEnabled: boolean; phase: number; exists: boolean;
}

/** getLaunchedToken(token) as of `block`. The struct is all static words, returned in order. */
export async function launchedToken(token: string, block: number | 'latest'): Promise<LaunchedToken> {
  const d = await ethCall(FACTORY, SEL.getLaunchedToken + encodeAddress(token), block);
  return {
    token: asAddress(word(d, 0)), curve: asAddress(word(d, 1)), deployer: asAddress(word(d, 2)),
    creatorFeeRecipient: asAddress(word(d, 3)), pairToken: asAddress(word(d, 4)),
    graduationThreshold: asUint(word(d, 5)), creatorTaxBps: Number(asUint(word(d, 8))),
    buybackEnabled: asBool(word(d, 9)), phase: Number(asUint(word(d, 10))), exists: asBool(word(d, 14)),
  };
}

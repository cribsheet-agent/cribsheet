// Checks one sealed hour end to end, with nothing but the public site and the public RPC:
//   node tools/verify-seal.ts <hour> [--contract 0x...] [--site https://cribsheet.pro]
// The contract defaults to CribsheetSeals on Robinhood Chain, deployed 27 Nov 2026.
// 1. sha256 of /data/seal/<hour> equals CribsheetSeals.rootOf(hour) on chain;
// 2. the hashes inside the seal match the hour's results line and the three notes files.
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { ethCall } from '../lib/rpc.ts';
import { selector } from '../lib/keccak.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  contract: { type: 'string', default: '0xfe6d4f39ca6732af967b941e8051d773f2c6011a' },
  site: { type: 'string', default: 'https://cribsheet.pro' },
} });
const hour = Number(positionals[0]);
if (!Number.isInteger(hour) || hour < 0) throw new Error('usage: node tools/verify-seal.ts <hour> [--contract 0x...]');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const get = async (path: string) => {
  const r = await fetch(`${values.site}/data/${path}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.text();
};

const bytes = await get(`seal/${hour}`);
const fields = Object.fromEntries(bytes.trim().split('\n').slice(1).map(l => l.split('=') as [string, string]));
let ok = true;
const line = (name: string, pass: boolean, detail: string) => { ok &&= pass; console.log(`${pass ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} ${detail}`); };

const results = (await get('results.jsonl')).split('\n').find(l => l.startsWith(`{"hour":${hour},`)) ?? '';
line('results', sha(results) === fields.results, `sha256 of the hour's line in results.jsonl`);
for (const arm of ['manual', 'self', 'crowd']) line(arm, sha(await get(`notes/${arm}/${hour}.md`)) === fields[arm], `sha256 of notes/${arm}/${hour}.md`);

const root = '0x' + sha(bytes);
if (values.contract) {
  const onChain = await ethCall(values.contract, selector('rootOf(uint256)') + hour.toString(16).padStart(64, '0'));
  line('chain', onChain.toLowerCase() === root, `rootOf(${hour}) = ${onChain}`);
} else console.log(`root     ${root} (pass --contract to compare with the chain)`);
process.exit(ok ? 0 : 1);

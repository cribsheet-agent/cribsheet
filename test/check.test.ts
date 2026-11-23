import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KNOWN, namesIn } from '../checker/check.ts';
import { keccakText } from '../lib/keccak.ts';
import { TOPIC } from '../exam/pons.ts';

test('the stored factory ABI hashes to the topics the exam reads', () => {
  const ev = (n: string) => KNOWN.find(i => i.type === 'event' && i.signature.startsWith(n + '('))!.signature;
  assert.equal(keccakText(ev('TokenLaunched')), TOPIC.TokenLaunched);
  assert.equal(keccakText(ev('PoolGraduated')), TOPIC.PoolGraduated);
});

test('names written as code are picked up, RPC methods and tools are not', () => {
  const line = 'Fetch the `TokenCreated` log, then call `getLaunchedToken(token)` and `bondingCurve()`; use eth_getLogs(filter) and keccak(text).';
  assert.deepEqual(namesIn(line).map(n => n.name).sort(), ['TokenCreated', 'bondingCurve', 'getLaunchedToken']);
  assert.deepEqual(namesIn('`Launch(address,uint256)`').map(n => [n.name, n.args]), [['Launch', 'address,uint256']]);
  assert.deepEqual(namesIn('use `fromBlock` and `toBlock` as hex').map(n => n.name), []);
});

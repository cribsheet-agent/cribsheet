import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../exam/generate.ts';
import { Rand } from '../exam/rand.ts';
import { KIND_LEVEL } from '../exam/types.ts';
import { capWords, lastBlock, wordCount } from '../arms/blocks.ts';
import { sealBytes, sealRoot } from '../runner/seal.ts';
import { runTool } from '../arms/tools.ts';

test('eight questions: four at the level, two below, two above', () => {
  for (const level of [1, 2, 3, 4]) {
    const levels = plan(level, new Rand('seed')).map(k => KIND_LEVEL[k]);
    assert.equal(levels.length, 8);
    assert.deepEqual(levels.slice(0, 4), [level, level, level, level]);
    assert.ok(levels.slice(4, 6).every(l => l === Math.max(1, level - 1)));
    assert.ok(levels.slice(6).every(l => l === Math.min(4, level + 1)));
  }
});

test('same seed, same questions', () => {
  assert.deepEqual(plan(2, new Rand('a')), plan(2, new Rand('a')));
});

test('notes are capped at 300 words', () => {
  assert.equal(wordCount(capWords('w '.repeat(500))), 300);
  assert.equal(capWords('short note'), 'short note');
});

test('only the last block differs between arms', () => {
  assert.equal(lastBlock('blank', 'x', []), 'You have no notes.');
  assert.match(lastBlock('manual', '', []), /0x3cf28b5a/);
  assert.match(lastBlock('self', 'my note', []), /my note/);
  assert.match(lastBlock('crowd', 'my note', []), /my note[\s\S]*Lessons from holders[\s\S]*none yet/);
});

test('seal bytes follow spec/seal.md', () => {
  const b = sealBytes(12, '{}', { manual: 'm', self: 's', crowd: 'c' });
  assert.match(b, /^cribsheet-seal-v1\nhour=12\nresults=[0-9a-f]{64}\nmanual=[0-9a-f]{64}\nself=[0-9a-f]{64}\ncrowd=[0-9a-f]{64}\n$/);
  assert.match(sealRoot(b), /^0x[0-9a-f]{64}$/);
});

test('tools refuse writes and oversized log ranges without touching the network', async () => {
  assert.match(await runTool('rpc', { method: 'eth_sendRawTransaction', params: ['0x00'] }), /not allowed/);
  assert.match(await runTool('rpc', { method: 'eth_getLogs', params: [{ fromBlock: '0x0', toBlock: '0x1000000' }] }), /over the 1000000 limit/);
  assert.match(await runTool('keccak', { text: '' }), /^0xc5d2460186f7233c/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeLaunch, SEL, TOPIC } from '../exam/pons.ts';
import type { Log } from '../lib/rpc.ts';

const logs: Log[] = JSON.parse(readFileSync(new URL('./fixtures/token-launched.json', import.meta.url), 'utf8'));

test('decodes real TokenLaunched logs from the factory', () => {
  assert.ok(logs.length > 0);
  for (const l of logs) {
    const d = decodeLaunch(l);
    assert.equal(d.token, '0x' + l.topics[1]!.slice(-40));
    assert.equal(d.curve, '0x' + l.topics[2]!.slice(-40));
    assert.equal(d.deployer, '0x' + l.topics[3]!.slice(-40));
    assert.equal(d.block, Number.parseInt(l.blockNumber, 16));
    assert.ok(d.graduationThreshold > 0n);
  }
});

test('rejects other events', () => {
  assert.throws(() => decodeLaunch({ ...logs[0]!, topics: [TOPIC.PoolGraduated, ...logs[0]!.topics.slice(1)] }));
});

test('getLaunchedToken selector', () => {
  assert.equal(SEL.getLaunchedToken, '0x3cf28b5a');
});

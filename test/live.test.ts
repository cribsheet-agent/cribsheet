import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeLive, liveAnswered, livePhase, liveStart, STALE_AFTER } from '../runner/live.ts';
import type { Store } from '../runner/hour.ts';

const mem = (): Store & { files: Map<string, string> } => {
  const files = new Map<string, string>();
  return { files, async get(p) { return files.get(p) ?? null; }, async put(p, t) { files.set(p, t); } };
};

test('no run yet reads as idle', async () => {
  assert.deepEqual(await composeLive(mem(), 5), { phase: 'idle', now: 5 });
});

test('progress per arm, no answers or score while running', async () => {
  const s = mem();
  await liveStart(s, 23, 1000);
  await livePhase(s, 23, 'answering', { questions: 8 }, 2000);
  await liveAnswered(s, 23, 'self', 3);
  await liveAnswered(s, 23, 'blank', 1);
  const v = await composeLive(s, 3000);
  assert.equal(v.phase, 'answering');
  assert.equal(v.questions, 8);
  assert.equal(v.started, 1000);
  assert.deepEqual(v.answered, { blank: 1, manual: 0, self: 3, crowd: 0 });
  assert.equal(v.score, undefined);
  assert.equal(v.stale, undefined);
});

test('a new hour resets the arms and keeps the question count across phases', async () => {
  const s = mem();
  await liveStart(s, 1, 0);
  await liveAnswered(s, 1, 'manual', 8);
  await liveStart(s, 2, 10);
  await livePhase(s, 2, 'answering', { questions: 8 }, 11);
  await livePhase(s, 2, 'graded', { score: { blank: 0, manual: 5, self: 4, crowd: 6 } }, 12);
  const v = await composeLive(s, 13);
  assert.equal(v.answered!.manual, 0);
  assert.equal(v.questions, 8);
  assert.equal(v.score!.crowd, 6);
});

test('a run that is not final after the lock age is stale; a graded one never is', async () => {
  const s = mem();
  await liveStart(s, 4, 0);
  assert.equal((await composeLive(s, STALE_AFTER + 1)).stale, true);
  await livePhase(s, 4, 'graded', {}, 1);
  assert.equal((await composeLive(s, STALE_AFTER * 3)).stale, undefined);
});

test('a failing store never throws from a live write', async () => {
  const bad: Store = { async get() { throw new Error('r2 down'); }, async put() { throw new Error('r2 down'); } };
  await liveStart(bad, 1);
  await livePhase(bad, 1, 'grading');
  await liveAnswered(bad, 1, 'crowd', 2);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  KIND_ORDER, decide, mergeIndex, pickTests, readIndex, recordTests, settlePending, tallyHour,
  type Board, type ChainLesson, type LessonTest, type SettleJob,
} from '../runner/lessons.ts';
import type { Attempt } from '../arms/agent.ts';
import type { Kind, Question } from '../exam/types.ts';
import type { Store } from '../runner/hour.ts';

const mem = (): Store & { files: Map<string, string> } => {
  const files = new Map<string, string>();
  return { files, async get(p) { return files.get(p) ?? null; }, async put(p, t) { files.set(p, t); } };
};

const lesson = (id: number, status: ChainLesson['status'], kind: Kind = 'graduated', submitted_at = 1_000_000): ChainLesson =>
  ({ id, author: '0xa11ce', kind, status, submitted_at, settled_at: 0, evidence: '0x' + '0'.repeat(64), text: `lesson ${id}` });
const board = (lessons: ChainLesson[]): Board => ({
  contract: '0xc0ffee', chain_id: 4663, token: '0x685b', judge: '0x1d6e', stake: '1000', reward: '500', reward_bps: 5000,
  pool: '100000', active: lessons.length, max_active: 12, lessons,
});
const q = (id: string, kind: Kind, key = 'yes', official = true): Question =>
  ({ id, kind, level: 2, official, text: `q ${id}`, format: 'yesno', key, key_sources: [], key_calls: [], budget: 12 });
const ans = (answer: string | null): Attempt => ({ answer, calls: [], usage: [], stopped: 'answered' });

test('kind numbers match the contract order', () => {
  assert.deepEqual(KIND_ORDER, ['curve', 'creator', 'launch_block', 'creator_tax', 'graduated', 'hour_launch_count', 'creator_24h', 'creator_7d']);
});

test('kept only if more right on target and no fewer elsewhere', () => {
  assert.equal(decide({ with: 3, without: 2, n: 9 }, { with: 5, without: 5, n: 21 }), true);
  assert.equal(decide({ with: 2, without: 2, n: 9 }, { with: 9, without: 5, n: 21 }), false); // tie on target
  assert.equal(decide({ with: 9, without: 2, n: 9 }, { with: 4, without: 5, n: 21 }), false); // worse elsewhere
});

test('tally: target includes official questions of the kind; re-test swaps the sides', () => {
  const official = [q('o1', 'graduated'), q('o2', 'curve')];
  const t: LessonTest = { id: 0, kind: 'graduated', round: 0, mode: 'test', block: 'b', extra: [q('e1', 'graduated', 'no', false)] };
  const copy = [ans('yes'), ans('no'), ans('no')];   // right, wrong, right
  const crowdOfficial = [ans('no'), ans('no')];      // wrong, wrong
  const crowdExtra = [ans('yes')];                   // wrong
  assert.deepEqual(tallyHour(t, official, copy, crowdOfficial, crowdExtra),
    { target: { with: 2, without: 0, n: 2 }, elsewhere: { with: 0, without: 0, n: 1 } });
  assert.deepEqual(tallyHour({ ...t, mode: 'retest' }, official, copy, crowdOfficial, crowdExtra),
    { target: { with: 0, without: 2, n: 2 }, elsewhere: { with: 0, without: 0, n: 1 } });
});

test('picks: running rounds first, then new lessons, then re-tests due; capped by slots', () => {
  const idx = mergeIndex(board([lesson(0, 'testing'), lesson(1, 'testing'), lesson(2, 'kept'), lesson(3, 'burned')]), null, 100);
  idx.lessons[1]!.rounds = [{ round: 0, mode: 'test', started_hour: 99, hours: [], skipped: [] }];
  const kept = idx.lessons[2]!;
  kept.rounds = [{ round: 0, mode: 'test', started_hour: 40, hours: [], skipped: [],
    verdict: { kept: true, target: { with: 1, without: 0, n: 1 }, elsewhere: { with: 0, without: 0, n: 0 }, hours: [40, 41, 52], file: '', sha256: '', settle: { action: 'settle', pending: false } } }];
  assert.deepEqual(pickTests(idx, 100, 1_000_100, 5).map(p => [p.id, p.mode, p.round]), [[1, 'test', 0], [0, 'test', 0], [2, 'retest', 1]]);
  assert.deepEqual(pickTests(idx, 99, 1_000_100, 5).map(p => p.id), [1, 0]); // 47 hours since the last test hour
  assert.deepEqual(pickTests(idx, 100, 1_000_100, 1).map(p => p.id), [1]);
  // no new test starts in the last six hours of the settle window
  assert.deepEqual(pickTests(idx, 100, 1_000_000 + 7 * 86_400 - 3600, 5).map(p => p.id), [1, 2]);
});

test('three counted hours give a verdict whose hash is the file; settle sends it once', async () => {
  const s = mem();
  await s.put('lessons/index.json', JSON.stringify(mergeIndex(board([lesson(0, 'testing')]), null, 10)));
  const official = [q('o1', 'curve')];
  for (const hour of [10, 11, 11, 12]) { // hour 11 is recorded twice, as a retried step would
    const t: LessonTest = { id: 0, kind: 'graduated', round: 0, mode: 'test', block: 'with lesson', extra: [q(`h${hour}e1`, 'graduated'), q(`h${hour}e2`, 'graduated'), q(`h${hour}e3`, 'graduated')] };
    await recordTests(s, { hour, official, tests: [t], crowdBlock: 'crowd', crowdOfficial: [ans('yes')],
      copy: { 0: [ans('yes'), ans('yes'), ans('yes'), ans('no')] }, crowdExtra: { 0: [ans('yes'), ans('no'), ans('no')] } });
  }
  const idx = (await readIndex(s))!;
  const r = idx.lessons[0]!.rounds[0]!;
  assert.deepEqual(r.hours.map(h => h.hour), [10, 11, 12]);
  assert.ok(r.verdict);
  assert.equal(r.verdict.kept, true);
  assert.deepEqual(r.verdict.target, { with: 6, without: 3, n: 9 });
  assert.deepEqual(r.verdict.elsewhere, { with: 3, without: 3, n: 3 });
  const bytes = s.files.get('lessons/0/verdict.json')!;
  assert.equal(r.verdict.sha256, '0x' + createHash('sha256').update(bytes).digest('hex'));
  assert.ok(s.files.has('lessons/0/hours/12.json') && s.files.has('lessons/0/hours/12.transcripts.json'));

  // no judge key: stays pending with a note
  await settlePending(s, null);
  assert.equal((await readIndex(s))!.lessons[0]!.rounds[0]!.verdict!.settle.note, 'waiting for the judge key');

  const jobs: SettleJob[] = [];
  let first = true;
  const settler = async (j: SettleJob) => { jobs.push(j); if (first) { first = false; return { wait: 'too early' }; } return { tx: '0xabc', block: 7 }; };
  await settlePending(s, settler); // too early: still pending
  await settlePending(s, settler);
  await settlePending(s, settler); // already settled: not sent again
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs[1], { id: 0, action: 'settle', kept: true, evidence: r.verdict.sha256 });
  const v = (await readIndex(s))!.lessons[0]!.rounds[0]!.verdict!;
  assert.deepEqual([v.settle.pending, v.settle.tx, v.settle.note], [false, '0xabc', undefined]);
});

test('an hour without enough extra questions or answers is skipped, not counted', async () => {
  const s = mem();
  await s.put('lessons/index.json', JSON.stringify(mergeIndex(board([lesson(0, 'testing')]), null, 10)));
  const t: LessonTest = { id: 0, kind: 'graduated', round: 0, mode: 'test', block: 'b', extra: [], short: 'only 2 graduated questions could be built' };
  await recordTests(s, { hour: 10, official: [], tests: [t], crowdBlock: 'c', crowdOfficial: [], copy: {}, crowdExtra: {} });
  await recordTests(s, { hour: 11, official: [], tests: [{ ...t, short: undefined, extra: [q('e', 'graduated')] }], crowdBlock: 'c', crowdOfficial: [], copy: {}, crowdExtra: {} });
  const r = (await readIndex(s))!.lessons[0]!.rounds[0]!;
  assert.equal(r.hours.length, 0);
  assert.deepEqual(r.skipped.map(x => x.hour), [10, 11]);
});

test('a failed re-test retires; a passed one asks nothing of the chain', async () => {
  for (const [copyRight, action] of [[true, 'retire'], [false, 'none']] as const) {
    const s = mem();
    const idx = mergeIndex(board([lesson(0, 'kept')]), null, 60);
    idx.lessons[0]!.rounds = [{ round: 0, mode: 'test', started_hour: 1, hours: [], skipped: [] }];
    await s.put('lessons/index.json', JSON.stringify(idx));
    for (const hour of [60, 61, 62]) {
      const t: LessonTest = { id: 0, kind: 'graduated', round: 1, mode: 'retest', block: 'without', extra: [q('e1', 'graduated'), q('e2', 'graduated'), q('e3', 'graduated')] };
      // the copy (without the lesson) against Crowd (with it)
      const c = copyRight ? 'yes' : 'no', o = copyRight ? 'no' : 'yes';
      await recordTests(s, { hour, official: [], tests: [t], crowdBlock: 'with', crowdOfficial: [], copy: { 0: [ans(c), ans(c), ans(c)] }, crowdExtra: { 0: [ans(o), ans(o), ans(o)] } });
    }
    const v = (await readIndex(s))!.lessons[0]!.rounds[1]!.verdict!;
    assert.equal(v.settle.action, action);
    assert.equal(v.file, 'lessons/0/retest-1.json');
  }
});

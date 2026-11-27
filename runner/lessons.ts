// Lessons (F2): a holder's lesson is tested for three exam hours on a copy of Crowd, then settled.
//
// Each tested hour, a copy of Crowd answers the official questions plus at least three extra
// questions of the lesson's kind; the real Crowd answers the same extra questions. Nothing here
// touches the official score. After three counted hours:
//   kept  = with the lesson, more right on target and no fewer right elsewhere
//   target    = the extra questions plus the official questions of the lesson's kind
//   elsewhere = the official questions of every other kind
// A new lesson is tested "with" on the copy (Crowd + lesson) against Crowd. A kept lesson is
// re-tested every 48 hours the other way round: Crowd (which reads it) against a copy without it.
// A re-test it fails retires it, without penalty.
//
// Public files, under /data/:
//   lessons/index.json                 every lesson, the contract's numbers and each test round
//   lessons/<id>/hours/<hour>.json     one tested hour: blocks, questions, keys, both sides' answers
//   lessons/<id>/hours/<hour>.transcripts.json
//   lessons/<id>/verdict.json          the first test's verdict; its SHA-256 is written on chain
//   lessons/<id>/retest-<round>.json   later re-tests
import { createHash } from 'node:crypto';
import { generate } from '../exam/generate.ts';
import { isCorrect, normalise } from '../exam/grade.ts';
import type { Kind, Question } from '../exam/types.ts';
import { lastBlock } from '../arms/blocks.ts';
import type { Attempt } from '../arms/agent.ts';
import type { Store } from './hour.ts';

/** The contract's kind numbers, in order. */
export const KIND_ORDER: Kind[] = ['curve', 'creator', 'launch_block', 'creator_tax', 'graduated', 'hour_launch_count', 'creator_24h', 'creator_7d'];
export const TEST_HOURS = 3;
/** Extra questions asked per tested hour; an hour counts only if at least MIN_EXTRA were built. */
export const EXTRA_ASKED = 4;
export const MIN_EXTRA = 3;
export const RETEST_EVERY_HOURS = 48;
/** The contract closes settlement 7 days after submission; no new test starts in its last 6 hours. */
export const SETTLE_WINDOW_S = 7 * 86_400;
const START_MARGIN_S = 6 * 3600;

export type LessonStatus = 'testing' | 'kept' | 'burned' | 'retired' | 'reclaimed';

export interface ChainLesson {
  id: number; author: string; kind: Kind; status: LessonStatus;
  submitted_at: number; settled_at: number; evidence: string; text: string;
}

export interface Board {
  contract: string; chain_id: number; token: string; judge: string;
  stake: string; reward: string; reward_bps: number; pool: string;
  active: number; max_active: number; read_at_block?: number;
  lessons: ChainLesson[];
  /** Set when the board is test data (staging), never on the public site. */
  fixture?: boolean;
}

export type Mode = 'test' | 'retest';
export interface Tally { with: number; without: number; n: number }
export interface HourTally { hour: number; target: Tally; elsewhere: Tally; extra: number; file: string }
export interface SettleState { action: 'settle' | 'retire' | 'none'; pending: boolean; tx?: string; block?: number; note?: string }
export interface Verdict { kept: boolean; target: Tally; elsewhere: Tally; hours: number[]; file: string; sha256: string; settle: SettleState }
export interface Round { round: number; mode: Mode; started_hour: number; hours: HourTally[]; skipped: { hour: number; reason: string }[]; verdict?: Verdict }
export interface Entry extends ChainLesson { rounds: Round[] }
export interface Index extends Omit<Board, 'lessons'> { updated_hour: number; lessons: Entry[] }

export interface LessonTest {
  id: number; kind: Kind; round: number; mode: Mode;
  /** The copy's last block: Crowd's plus the lesson (test), or Crowd's without it (re-test). */
  block: string;
  extra: Question[];
  /** Why this hour does not count for the lesson; no answers are asked then. */
  short?: string;
}

const INDEX = 'lessons/index.json';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export async function readIndex(store: Store): Promise<Index | null> {
  const t = await store.get(INDEX);
  return t ? JSON.parse(t) as Index : null;
}

/** Kept lessons, by id: what Crowd reads. */
export const keptTexts = (board: Board): string[] => board.lessons.filter(l => l.status === 'kept').map(l => l.text);

/** Merges a fresh board with the rounds already recorded. */
export function mergeIndex(board: Board, prev: Index | null, hour: number): Index {
  const rounds = new Map((prev?.lessons ?? []).map(e => [e.id, e.rounds]));
  const { lessons, ...rest } = board;
  return { ...rest, updated_hour: hour, lessons: lessons.map(l => ({ ...l, rounds: rounds.get(l.id) ?? [] })) };
}

export interface Pick { id: number; kind: Kind; text: string; round: number; mode: Mode }

/**
 * Which lessons are tested this hour, at most `slots`: rounds already running first, then new
 * lessons by id, then kept lessons due for a re-test.
 */
export function pickTests(idx: Index, hour: number, now: number, slots: number): Pick[] {
  const picks: Pick[] = [];
  const open = (e: Entry) => { const r = e.rounds.at(-1); return r && !r.verdict ? r : undefined; };
  const live = (e: Entry, r: Round) => (r.mode === 'test' ? e.status === 'testing' : e.status === 'kept');
  for (const e of idx.lessons) {
    const r = open(e);
    if (r && live(e, r)) picks.push({ id: e.id, kind: e.kind, text: e.text, round: r.round, mode: r.mode });
  }
  for (const e of idx.lessons) {
    if (e.status !== 'testing' || e.rounds.length || now > e.submitted_at + SETTLE_WINDOW_S - START_MARGIN_S) continue;
    picks.push({ id: e.id, kind: e.kind, text: e.text, round: 0, mode: 'test' });
  }
  for (const e of idx.lessons) {
    if (e.status !== 'kept' || open(e)) continue;
    const last = e.rounds.at(-1)?.verdict;
    const lastHour = last ? Math.max(...last.hours) : -Infinity;
    if (hour - lastHour >= RETEST_EVERY_HOURS) picks.push({ id: e.id, kind: e.kind, text: e.text, round: e.rounds.length, mode: 'retest' });
  }
  return picks.slice(0, Math.max(0, slots));
}

/** Builds this hour's tests: the copy's block and the extra questions, all before any answer. */
export async function prepareTests(opts: {
  store: Store; board: Board; hour: number; level: number; now: number; slots: number; selfNotes: string;
  window: { start_block: number; end_block: number; key_block: number }; official: Question[];
}): Promise<LessonTest[]> {
  const { store, board, hour } = opts;
  const idx = mergeIndex(board, await readIndex(opts.store), hour);
  const picks = pickTests(idx, hour, opts.now, opts.slots);
  const kept = board.lessons.filter(l => l.status === 'kept');
  const avoid = opts.official.map(q => q.text.match(/token (0x[0-9a-f]{40})/)?.[1]).filter((x): x is string => !!x);
  const tests: LessonTest[] = [];
  for (const p of picks) {
    const texts = p.mode === 'test' ? [...kept.map(l => l.text), p.text] : kept.filter(l => l.id !== p.id).map(l => l.text);
    const block = lastBlock('crowd', opts.selfNotes, texts);
    let extra: Question[] = [], short: string | undefined;
    try {
      const gen = await generate({ hour, level: opts.level, ...opts.window, extra: { kinds: Array(EXTRA_ASKED).fill(p.kind), tag: `L${p.id}r${p.round}`, avoid } });
      extra = gen.questions;
      if (extra.length < MIN_EXTRA) short = `only ${extra.length} ${p.kind} questions could be built (${gen.dropped.map(d => d.reason).join('; ').slice(0, 200)})`;
    } catch (e) {
      short = (e as Error).message.slice(0, 200);
    }
    tests.push({ id: p.id, kind: p.kind, round: p.round, mode: p.mode, block, extra: short ? [] : extra, ...(short ? { short } : {}) });
  }
  await store.put(INDEX, JSON.stringify(idx, null, 1));
  return tests;
}

/** The copy answers the official questions then the extra ones; Crowd answers only the extra ones. */
export function copyQuestions(official: Question[], t: LessonTest): Question[] {
  return [...official, ...t.extra];
}

/** Right answers with and without the lesson, on target and elsewhere, for one hour. */
export function tallyHour(t: LessonTest, official: Question[], copy: Attempt[], crowdOfficial: Attempt[], crowdExtra: Attempt[]): { target: Tally; elsewhere: Tally } {
  const qs = copyQuestions(official, t);
  const crowd = [...crowdOfficial, ...crowdExtra];
  const target: Tally = { with: 0, without: 0, n: 0 }, elsewhere: Tally = { with: 0, without: 0, n: 0 };
  qs.forEach((q, i) => {
    const bucket = q.kind === t.kind ? target : elsewhere;
    const c = isCorrect(q, copy[i]!.answer) ? 1 : 0, o = isCorrect(q, crowd[i]!.answer) ? 1 : 0;
    // test: the copy has the lesson; re-test: Crowd has it and the copy does not
    bucket.with += t.mode === 'test' ? c : o;
    bucket.without += t.mode === 'test' ? o : c;
    bucket.n++;
  });
  return { target, elsewhere };
}

export const decide = (target: Tally, elsewhere: Tally): boolean => target.with > target.without && elsewhere.with >= elsewhere.without;

const add = (a: Tally, b: Tally): Tally => ({ with: a.with + b.with, without: a.without + b.without, n: a.n + b.n });

/**
 * Records one tested hour per lesson and, after the third counted hour, its verdict.
 * Safe to run again for the same hour (a retried step): the hour's tally is replaced, not added.
 */
export async function recordTests(store: Store, opts: {
  hour: number; official: Question[]; tests: LessonTest[]; crowdBlock: string;
  copy: Record<number, Attempt[]>; crowdExtra: Record<number, Attempt[]>; crowdOfficial: Attempt[];
}): Promise<void> {
  const idx = await readIndex(store);
  if (!idx) return;
  const { hour, official } = opts;
  for (const t of opts.tests) {
    const e = idx.lessons.find(x => x.id === t.id);
    if (!e) continue;
    let r = e.rounds.find(x => x.round === t.round);
    if (!r) { r = { round: t.round, mode: t.mode, started_hour: hour, hours: [], skipped: [] }; e.rounds.push(r); }
    if (r.verdict) continue;
    if (t.short) {
      r.skipped = [...r.skipped.filter(s => s.hour !== hour), { hour, reason: t.short }];
      continue;
    }
    const copy = opts.copy[t.id], crowdExtra = opts.crowdExtra[t.id];
    if (!copy || !crowdExtra) {
      r.skipped = [...r.skipped.filter(s => s.hour !== hour), { hour, reason: 'a lesson answer failed after retries' }];
      continue;
    }
    const { target, elsewhere } = tallyHour(t, official, copy, opts.crowdOfficial, crowdExtra);
    const file = `lessons/${t.id}/hours/${hour}.json`;
    const qs = copyQuestions(official, t);
    const crowd = [...opts.crowdOfficial, ...crowdExtra];
    await store.put(file, JSON.stringify({
      lesson: t.id, round: t.round, mode: t.mode, hour, kind: t.kind,
      copy_block: t.block, crowd_block: opts.crowdBlock,
      target, elsewhere,
      questions: qs.map((q, i) => ({
        id: q.id, kind: q.kind, official: q.official, on_target: q.kind === t.kind, text: q.text, key: q.key, key_sources: q.key_sources, key_calls: q.key_calls, budget: q.budget,
        copy: side(q, copy[i]!), crowd: side(q, crowd[i]!),
      })),
    }, null, 1));
    await store.put(`lessons/${t.id}/hours/${hour}.transcripts.json`, JSON.stringify({
      copy: copy.map((x, i) => ({ id: qs[i]!.id, ...x })),
      crowd_extra: crowdExtra.map((x, i) => ({ id: t.extra[i]!.id, ...x })),
    }, null, 1));
    r.hours = [...r.hours.filter(h => h.hour !== hour), { hour, target, elsewhere, extra: t.extra.length, file }];

    if (r.hours.length >= TEST_HOURS) {
      const hs = r.hours.slice(0, TEST_HOURS);
      const tt = hs.reduce((s, h) => add(s, h.target), { with: 0, without: 0, n: 0 });
      const te = hs.reduce((s, h) => add(s, h.elsewhere), { with: 0, without: 0, n: 0 });
      const kept = decide(tt, te);
      const path = r.round === 0 ? `lessons/${t.id}/verdict.json` : `lessons/${t.id}/retest-${r.round}.json`;
      const bytes = JSON.stringify({
        lesson: t.id, round: r.round, mode: r.mode, kind: t.kind, text: e.text, contract: idx.contract,
        rule: 'kept if, with the lesson, more right on target and no fewer right elsewhere, over three tested hours',
        kept, target: tt, elsewhere: te, hours: hs.map(h => ({ hour: h.hour, target: h.target, elsewhere: h.elsewhere, file: h.file })),
      }, null, 1) + '\n';
      await store.put(path, bytes);
      const action: SettleState['action'] = r.mode === 'test' ? 'settle' : kept ? 'none' : 'retire';
      r.verdict = { kept, target: tt, elsewhere: te, hours: hs.map(h => h.hour), file: path, sha256: '0x' + sha(bytes), settle: { action, pending: action !== 'none' } };
    }
  }
  idx.updated_hour = hour;
  await store.put(INDEX, JSON.stringify(idx, null, 1));
}

function side(q: Question, a: Attempt) {
  return { answer: normalise(q.format, a.answer) ?? a.answer, correct: isCorrect(q, a.answer), calls: a.calls.length, stopped: a.stopped };
}

export interface SettleJob { id: number; action: 'settle' | 'retire'; kept: boolean; evidence: `0x${string}` }
export type Settled = { tx: string; block: number } | { wait: string } | { done: string };
export type Settler = (job: SettleJob) => Promise<Settled>;

/** Sends every pending verdict to the chain. Without a settler they stay pending, with a note. */
export async function settlePending(store: Store, settler: Settler | null): Promise<{ id: number; result: Settled | { error: string } }[]> {
  const idx = await readIndex(store);
  if (!idx) return [];
  const out: { id: number; result: Settled | { error: string } }[] = [];
  for (const e of idx.lessons) {
    for (const r of e.rounds) {
      const v = r.verdict;
      if (!v || !v.settle.pending || v.settle.action === 'none') continue;
      if (!settler) { v.settle.note = 'waiting for the judge key'; continue; }
      let result: Settled | { error: string };
      try {
        result = await settler({ id: e.id, action: v.settle.action, kept: v.kept, evidence: v.sha256 as `0x${string}` });
      } catch (err) {
        result = { error: (err as Error).message.slice(0, 300) };
      }
      if ('tx' in result) { v.settle = { ...v.settle, pending: false, tx: result.tx, block: result.block }; delete v.settle.note; }
      else if ('done' in result) v.settle = { ...v.settle, pending: false, note: result.done };
      else v.settle.note = 'wait' in result ? result.wait : result.error;
      out.push({ id: e.id, result });
    }
  }
  await store.put(INDEX, JSON.stringify(idx, null, 1));
  return out;
}

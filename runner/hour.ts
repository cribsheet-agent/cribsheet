// One exam hour in three phases, so the same code runs locally (one process) and in the
// Worker (each phase, and each answer, a separate Workflow step):
//   prepare: read state, generate questions and keys, write the arms' context blocks and the fact check
//   answer:  one arm answers one question
//   finish:  grade, Self rewrites its notes, write results, transcripts and seal bytes, advance state
// Every file goes through a Store: the local file system, or R2 in the Worker.
import { blockAtOrAfter, blockNumber, blockTime } from '../lib/rpc.ts';
import { neuronsToUsd, type ModelConfig, type Usage } from '../lib/model.ts';
import { generate } from '../exam/generate.ts';
import { isCorrect, normalise } from '../exam/grade.ts';
import type { Dropped, Question } from '../exam/types.ts';
import { ARMS, lastBlock, type Arm } from '../arms/blocks.ts';
import { attempt, type Attempt } from '../arms/agent.ts';
import { rewriteNotes } from '../arms/notes.ts';
import { checkNotes, type CheckedItem } from '../checker/check.ts';
import { sealBytes, sealRoot } from './seal.ts';

export interface Store {
  get(path: string): Promise<string | null>;
  put(path: string, text: string): Promise<void>;
}

export interface State { next_hour: number; level: number; best: number[]; self_notes: string; lessons: string[] }
const fresh = (): State => ({ next_hour: 0, level: 1, best: [], self_notes: '', lessons: [] });

export async function readState(store: Store): Promise<State> {
  const s = await store.get('state.json');
  return s ? JSON.parse(s) as State : fresh();
}
const writeState = (store: Store, state: State) => store.put('state.json', JSON.stringify(state, null, 2));

async function append(store: Store, path: string, line: string): Promise<void> {
  await store.put(path, ((await store.get(path)) ?? '') + line + '\n');
}

export interface Prepared {
  hour: number; level: number; seed: string;
  start_block: number; end_block: number; key_block: number;
  questions: Question[]; dropped: Dropped[];
  blocks: Record<Arm, string>;
  check: CheckedItem[];
}

/** `at`: a unix time inside the hour after the one to examine (default: the chain head's time). */
export async function prepare(store: Store, at?: number, log: (s: string) => void = () => {}): Promise<Prepared> {
  const state = await readState(store);
  const hour = state.next_hour;

  // window: the last full UTC hour before `at`; keys are read at the chain head
  const key_block = await blockNumber();
  const headTime = await blockTime(key_block);
  const hourEnd = Math.floor((at ?? headTime) / 3600) * 3600;
  const start_block = await blockAtOrAfter(hourEnd - 3600, key_block);
  const end_block = (await blockAtOrAfter(hourEnd, key_block)) - 1;
  log(`hour ${hour}: blocks ${start_block}-${end_block}, keys at ${key_block}, level ${state.level}`);

  const gen = await generate({ hour, level: state.level, start_block, end_block, key_block });
  log(`${gen.questions.length} questions, ${gen.dropped.length} dropped`);

  // context blocks and the fact check are written before any answer
  const blocks = Object.fromEntries(ARMS.map(a => [a, lastBlock(a, state.self_notes, state.lessons)])) as Record<Arm, string>;
  for (const a of ARMS) await store.put(`notes/${a}/${hour}.md`, blocks[a]);
  const sample = gen.questions.map(q => q.text.match(/token (0x[0-9a-f]{40})/)?.[1]).find(Boolean) ?? '0x' + '0'.repeat(40);
  const check = state.self_notes.trim() ? await checkNotes(state.self_notes, sample) : [];
  await store.put(`check/${hour}.json`, JSON.stringify({ hour, notes: 'self', items: check }, null, 2));

  return { hour, level: state.level, seed: gen.seed, start_block, end_block, key_block, questions: gen.questions, dropped: gen.dropped, blocks, check };
}

export function answer(cfg: ModelConfig, p: Prepared, arm: Arm, i: number): Promise<Attempt> {
  const q = p.questions[i]!;
  return attempt(cfg, p.blocks[arm], q.text, q.budget);
}

export async function finish(store: Store, cfg: ModelConfig, p: Prepared, attempts: Record<Arm, Attempt[]>) {
  const state = await readState(store);
  if (state.next_hour !== p.hour) throw new Error(`state moved on: expected hour ${p.hour}, state says ${state.next_hour}`);
  const { hour, questions } = p;

  const sum = (us: Usage[]) => us.reduce((s, u) => ({ prompt: s.prompt + u.prompt_tokens, completion: s.completion + u.completion_tokens, neurons: s.neurons + (u.neurons ?? 0) }), { prompt: 0, completion: 0, neurons: 0 });
  const score = Object.fromEntries(ARMS.map(a => [a, questions.filter((q, i) => q.official && isCorrect(q, attempts[a][i]!.answer)).length])) as Record<Arm, number>;

  // Self rewrites its notes from this hour
  const selfHour = questions.map((q, i) => ({ q, a: attempts.self[i]!, correct: isCorrect(q, attempts.self[i]!.answer) }));
  const rewrite = await rewriteNotes(cfg, state.self_notes, selfHour, p.check);

  const arms = Object.fromEntries(ARMS.map(a => [a, sum(attempts[a].flatMap(x => x.usage))]));
  const notes_rewrite = sum([rewrite.usage]);
  const neurons = Object.values(arms).reduce((s, c) => s + c.neurons, 0) + notes_rewrite.neurons;

  const result = {
    hour, status: 'graded', start_block: p.start_block, end_block: p.end_block, key_block: p.key_block, level: p.level, model: cfg.model, seed: p.seed,
    score,
    questions: questions.map((q, i) => ({
      id: q.id, kind: q.kind, level: q.level, official: q.official, text: q.text, key: q.key, key_sources: q.key_sources, key_calls: q.key_calls, budget: q.budget,
      answers: Object.fromEntries(ARMS.map(a => {
        const x = attempts[a][i]!;
        return [a, { answer: normalise(q.format, x.answer) ?? x.answer, correct: isCorrect(q, x.answer), calls: x.calls.length, stopped: x.stopped }];
      })),
    })),
    dropped: p.dropped,
    ...(rewrite.kept ? { notes_kept: rewrite.kept } : {}),
    cost: { arms, notes_rewrite, neurons, usd: Number(neuronsToUsd(neurons).toFixed(4)) },
  };
  const line = JSON.stringify(result);
  await append(store, 'results.jsonl', line);
  for (const a of ARMS) await store.put(`transcripts/${hour}/${a}.json`, JSON.stringify(attempts[a].map((x, i) => ({ id: questions[i]!.id, ...x })), null, 1));

  const bytes = sealBytes(hour, line, { manual: p.blocks.manual, self: p.blocks.self, crowd: p.blocks.crowd });
  await store.put(`seal/${hour}`, bytes);

  // level: up after 6 hours at >= 85% for the best arm, down after 6 hours under 50%
  const official = questions.filter(q => q.official).length || 1;
  state.best = [...state.best, Math.max(...Object.values(score)) / official].slice(-6);
  if (state.best.length === 6 && state.best.every(x => x >= 0.85) && state.level < 4) { state.level++; state.best = []; }
  else if (state.best.length === 6 && state.best.every(x => x < 0.5) && state.level > 1) { state.level--; state.best = []; }
  state.self_notes = rewrite.notes;
  state.next_hour = hour + 1;
  await writeState(store, state);

  return { result, root: sealRoot(bytes), bytes, check: p.check };
}

/** Local: the whole hour in one process, arms in parallel, questions in order within an arm. */
export async function runHour(opts: { store: Store; cfg: ModelConfig; at?: number; log?: (s: string) => void }) {
  const log = opts.log ?? (() => {});
  const p = await prepare(opts.store, opts.at, log);
  const attempts = {} as Record<Arm, Attempt[]>;
  await Promise.all(ARMS.map(async arm => {
    attempts[arm] = [];
    for (let i = 0; i < p.questions.length; i++) {
      const a = await answer(opts.cfg, p, arm, i);
      attempts[arm].push(a);
      const q = p.questions[i]!;
      log(`  ${arm.padEnd(6)} ${q.id} ${q.kind.padEnd(17)} ${isCorrect(q, a.answer) ? 'right' : 'wrong'} (${a.calls.length}/${q.budget}${a.stopped === 'answered' ? '' : ', ' + a.stopped})`);
    }
  }));
  return finish(opts.store, opts.cfg, p, attempts);
}

/** A failed hour is written as missed, with the reason, and never back-filled. */
export async function recordMissed(store: Store, reason: string): Promise<number> {
  const state = await readState(store);
  const hour = state.next_hour;
  await append(store, 'results.jsonl', JSON.stringify({ hour, status: 'missed', missed_reason: reason.slice(0, 300) }));
  state.next_hour = hour + 1;
  await writeState(store, state);
  return hour;
}

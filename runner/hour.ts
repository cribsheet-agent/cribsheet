// Runs one exam hour end to end and writes the public files under data/.
// F0: runs locally; F1 moves the same steps into a Worker with a cron trigger.
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { blockAtOrAfter, blockNumber, blockTime } from '../lib/rpc.ts';
import { neuronsToUsd, type ModelConfig, type Usage } from '../lib/model.ts';
import { generate } from '../exam/generate.ts';
import { isCorrect, normalise } from '../exam/grade.ts';
import type { Question } from '../exam/types.ts';
import { ARMS, lastBlock, type Arm } from '../arms/blocks.ts';
import { attempt, type Attempt } from '../arms/agent.ts';
import { rewriteNotes } from '../arms/notes.ts';
import { checkNotes } from '../checker/check.ts';
import { sealBytes, sealRoot } from './seal.ts';

export interface State { next_hour: number; level: number; best: number[]; self_notes: string; lessons: string[] }
const fresh = (): State => ({ next_hour: 0, level: 1, best: [], self_notes: '', lessons: [] });

export async function runHour(opts: { dir: string; cfg: ModelConfig; at?: number; log?: (s: string) => void }) {
  const { dir, cfg } = opts;
  const log = opts.log ?? (() => {});
  const statePath = join(dir, 'state.json');
  const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : fresh();
  const hour = state.next_hour;

  // window: the last full UTC hour before `at` (default: now); keys are read at the chain head
  const key_block = await blockNumber();
  const headTime = await blockTime(key_block);
  const hourEnd = Math.floor((opts.at ?? headTime) / 3600) * 3600;
  const start_block = await blockAtOrAfter(hourEnd - 3600, key_block);
  const end_block = (await blockAtOrAfter(hourEnd, key_block)) - 1;
  log(`hour ${hour}: blocks ${start_block}-${end_block}, keys at ${key_block}, level ${state.level}`);

  const gen = await generate({ hour, level: state.level, start_block, end_block, key_block });
  log(`${gen.questions.length} questions, ${gen.dropped.length} dropped`);

  // context blocks and the fact check are written before any answer
  const blocks = Object.fromEntries(ARMS.map(a => [a, lastBlock(a, state.self_notes, state.lessons)])) as Record<Arm, string>;
  for (const a of ARMS) write(join(dir, 'notes', a, `${hour}.md`), blocks[a]);
  const sample = gen.questions.map(q => q.text.match(/token (0x[0-9a-f]{40})/)?.[1]).find(Boolean) ?? '0x' + '0'.repeat(40);
  const check = state.self_notes.trim() ? await checkNotes(state.self_notes, sample) : [];
  write(join(dir, 'check', `${hour}.json`), JSON.stringify({ hour, notes: 'self', items: check }, null, 2));

  // answers: arms in parallel, questions in order within an arm
  const attempts = {} as Record<Arm, Attempt[]>;
  await Promise.all(ARMS.map(async arm => {
    attempts[arm] = [];
    for (const q of gen.questions) {
      const a = await attempt(cfg, blocks[arm], q.text, q.budget);
      attempts[arm].push(a);
      log(`  ${arm.padEnd(6)} ${q.id} ${q.kind.padEnd(17)} ${isCorrect(q, a.answer) ? 'right' : 'wrong'} (${a.calls.length}/${q.budget}${a.stopped === 'answered' ? '' : ', ' + a.stopped})`);
    }
  }));

  const sum = (us: Usage[]) => us.reduce((s, u) => ({ prompt: s.prompt + u.prompt_tokens, completion: s.completion + u.completion_tokens, neurons: s.neurons + (u.neurons ?? 0) }), { prompt: 0, completion: 0, neurons: 0 });
  const score = Object.fromEntries(ARMS.map(a => [a, gen.questions.filter((q, i) => q.official && isCorrect(q, attempts[a][i]!.answer)).length])) as Record<Arm, number>;

  // Self rewrites its notes from this hour
  const selfHour = gen.questions.map((q, i) => ({ q, a: attempts.self[i]!, correct: isCorrect(q, attempts.self[i]!.answer) }));
  const rewrite = await rewriteNotes(cfg, state.self_notes, selfHour, check);

  const arms = Object.fromEntries(ARMS.map(a => [a, sum(attempts[a].flatMap(x => x.usage))]));
  const notes_rewrite = sum([rewrite.usage]);
  const neurons = Object.values(arms).reduce((s, c) => s + c.neurons, 0) + notes_rewrite.neurons;

  const result = {
    hour, status: 'graded', start_block, end_block, key_block, level: state.level, model: cfg.model, seed: gen.seed,
    score,
    questions: gen.questions.map((q: Question, i) => ({
      id: q.id, kind: q.kind, level: q.level, official: q.official, text: q.text, key: q.key, key_sources: q.key_sources, key_calls: q.key_calls, budget: q.budget,
      answers: Object.fromEntries(ARMS.map(a => {
        const x = attempts[a][i]!;
        return [a, { answer: normalise(q.format, x.answer) ?? x.answer, correct: isCorrect(q, x.answer), calls: x.calls.length, stopped: x.stopped }];
      })),
    })),
    dropped: gen.dropped,
    cost: { arms, notes_rewrite, neurons, usd: Number(neuronsToUsd(neurons).toFixed(4)) },
  };
  const line = JSON.stringify(result);
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'results.jsonl'), line + '\n');
  for (const a of ARMS) write(join(dir, 'transcripts', String(hour), `${a}.json`), JSON.stringify(attempts[a].map((x, i) => ({ id: gen.questions[i]!.id, ...x })), null, 1));

  const bytes = sealBytes(hour, line, { manual: blocks.manual, self: blocks.self, crowd: blocks.crowd });
  write(join(dir, 'seal', String(hour)), bytes);

  // level: up after 6 hours at >= 85% for the best arm, down after 6 hours under 50%
  const official = gen.questions.filter(q => q.official).length || 1;
  state.best = [...state.best, Math.max(...Object.values(score)) / official].slice(-6);
  if (state.best.length === 6 && state.best.every(x => x >= 0.85) && state.level < 4) { state.level++; state.best = []; }
  else if (state.best.length === 6 && state.best.every(x => x < 0.5) && state.level > 1) { state.level--; state.best = []; }
  state.self_notes = rewrite.notes;
  state.next_hour = hour + 1;
  write(statePath, JSON.stringify(state, null, 2));

  return { result, root: sealRoot(bytes), check };
}

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** A failed hour is written as missed, with the reason, and never back-filled. */
export function recordMissed(dir: string, reason: string): number {
  const statePath = join(dir, 'state.json');
  const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : fresh();
  const hour = state.next_hour;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'results.jsonl'), JSON.stringify({ hour, status: 'missed', missed_reason: reason.slice(0, 300) }) + '\n');
  state.next_hour = hour + 1;
  write(statePath, JSON.stringify(state, null, 2));
  return hour;
}

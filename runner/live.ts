// Live progress of the hour that is running, served as /data/live.json.
// Progress only: which phase, how many questions each arm has answered. Answers and scores
// stay out until the hour is graded, then the score of the graded hour is shown.
// Each arm writes its own file, so the four arms running in parallel never overwrite each other.
import { ARMS, type Arm } from '../arms/blocks.ts';
import type { Store } from './hour.ts';

export type Phase = 'prepare' | 'answering' | 'grading' | 'sealing' | 'graded' | 'missed';

export interface LiveRun {
  hour: number;
  phase: Phase;
  started: number; // ms
  since: number;   // ms, start of this phase
  questions?: number;
  score?: Record<Arm, number>;
  seal_tx?: string;
}

const RUN = '_internal/live/run.json';
const armPath = (arm: Arm) => `_internal/live/${arm}.json`;
/** A run that is not final after this long is shown as stalled. Matches the runner's lock age. */
export const STALE_AFTER = 55 * 60_000;

/** Live writes never fail an exam step: a lost progress update only makes the page lag. */
async function safe(fn: () => Promise<void>): Promise<void> {
  try { await fn(); } catch { /* progress is best effort */ }
}

export async function liveStart(store: Store, hour: number, now = Date.now()): Promise<void> {
  await safe(async () => {
    await Promise.all(ARMS.map(arm => store.put(armPath(arm), JSON.stringify({ hour, answered: 0 }))));
    await store.put(RUN, JSON.stringify({ hour, phase: 'prepare', started: now, since: now } satisfies LiveRun));
  });
}

export async function livePhase(store: Store, hour: number, phase: Phase, extra: Partial<LiveRun> = {}, now = Date.now()): Promise<void> {
  await safe(async () => {
    const prev = await readRun(store);
    const started = prev && prev.hour === hour ? prev.started : now;
    const keep = prev && prev.hour === hour ? { questions: prev.questions } : {};
    await store.put(RUN, JSON.stringify({ ...keep, ...extra, hour, phase, started, since: now } satisfies LiveRun));
  });
}

export async function liveAnswered(store: Store, hour: number, arm: Arm, answered: number): Promise<void> {
  await safe(() => store.put(armPath(arm), JSON.stringify({ hour, answered })));
}

async function readRun(store: Store): Promise<LiveRun | null> {
  const t = await store.get(RUN);
  return t ? JSON.parse(t) as LiveRun : null;
}

export interface LiveView extends Omit<Partial<LiveRun>, 'phase'> {
  phase: Phase | 'idle';
  now: number;
  stale?: boolean;
  answered?: Record<Arm, number>;
}

/** What /data/live.json returns. */
export async function composeLive(store: Store, now = Date.now()): Promise<LiveView> {
  const run = await readRun(store);
  if (!run) return { phase: 'idle', now };
  const answered = {} as Record<Arm, number>;
  await Promise.all(ARMS.map(async arm => {
    const t = await store.get(armPath(arm));
    const a = t ? JSON.parse(t) as { hour: number; answered: number } : null;
    answered[arm] = a && a.hour === run.hour ? a.answered : 0;
  }));
  const final = run.phase === 'graded' || run.phase === 'missed';
  return { ...run, now, answered, ...(!final && now - run.started > STALE_AFTER ? { stale: true } : {}) };
}

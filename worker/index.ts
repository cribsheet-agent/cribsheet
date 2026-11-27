// The cribsheet.pro Worker.
//  - fetch: the site (static assets) and the public record under /data/, read from R2.
//  - ExamHour: one exam hour as a Workflow. Each phase and each answer is a step, so an hour
//    that takes longer than a cron invocation may run still finishes, and a failed step is retried.
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { workersAiBinding } from '../lib/model.ts';
import { ARMS, type Arm } from '../arms/blocks.ts';
import type { Attempt } from '../arms/agent.ts';
import { sealOnChain } from '../runner/seal-chain.ts';
import { setRpcUrl } from '../lib/rpc.ts';
import { answer, finish, prepare, readState, recordMissed, type Prepared, type Store } from '../runner/hour.ts';
import { composeLive, liveAnswered, liveStart, livePhase } from '../runner/live.ts';

export interface Env {
  ASSETS: Fetcher;
  DATA: R2Bucket;
  AI: { run(model: string, body: Record<string, unknown>): Promise<unknown> };
  HOUR: Workflow;
  MODEL: string;
  /** CribsheetSeals address; without it (or without SEAL_KEY) hours are not sealed on chain. */
  SEALS_ADDRESS?: string;
  /** Secret: private key of the contract's sealer. */
  SEAL_KEY?: string;
  /** Secret: a Robinhood Chain RPC endpoint that serves eth_getLogs to Workers (the public one does not). */
  RPC_URL?: string;
}

const r2Store = (bucket: R2Bucket): Store => ({
  async get(path) { return (await bucket.get(path))?.text() ?? null; },
  async put(path, text) { await bucket.put(path, text, { httpMetadata: { contentType: contentType(path) } }); },
});

function contentType(path: string): string {
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return 'text/plain; charset=utf-8'; // results.jsonl, seal/<hour>
}

// Written while an hour runs; a firing that finds it (and it is recent) leaves the window alone.
const RUNNING = '_internal/running.json';
const RUNNING_MAX_AGE = 55 * 60_000;

interface Params { at?: number }

export class ExamHour extends WorkflowEntrypoint<Env, Params> {
  async run(event: Readonly<WorkflowEvent<Params>>, step: WorkflowStep) {
    if (this.env.RPC_URL) setRpcUrl(this.env.RPC_URL);
    const store = r2Store(this.env.DATA);
    const cfg = workersAiBinding(this.env.MODEL, this.env.AI);
    // the hour before the firing: a cron at minute 1 examines the hour that just closed
    const firedAt = event.payload?.at ?? Math.floor((event.schedule?.scheduledTime ?? event.timestamp.getTime()) / 1000);

    const claim = await step.do('claim', async () => {
      const running = await this.env.DATA.get(RUNNING);
      if (running) {
        const r = await running.json<{ since: number; hour: number }>();
        if (Date.now() - r.since < RUNNING_MAX_AGE) return { ok: false as const, reason: `hour ${r.hour} still running` };
      }
      const hour = (await readState(store)).next_hour;
      await this.env.DATA.put(RUNNING, JSON.stringify({ hour, since: Date.now(), instance: event.instanceId }));
      await liveStart(store, hour);
      return { ok: true as const, hour };
    });
    if (!claim.ok) return { skipped: claim.reason };

    try {
      const p: Prepared = await step.do('prepare', { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '10 minutes' },
        () => prepare(store, firedAt));
      await step.do('live answering', () => livePhase(store, p.hour, 'answering', { questions: p.questions.length }));

      // arms in parallel, questions in order within an arm, one step per answer
      const attempts = {} as Record<Arm, Attempt[]>;
      await Promise.all(ARMS.map(async arm => {
        attempts[arm] = [];
        for (let i = 0; i < p.questions.length; i++) {
          // tool arguments are free-form JSON, so the step returns the attempt as a string
          const a = await step.do(`answer ${arm} ${i + 1}`, { retries: { limit: 3, delay: '20 seconds', backoff: 'exponential' }, timeout: '10 minutes' },
            async () => {
              const out = JSON.stringify(await answer(cfg, p, arm, i));
              await liveAnswered(store, p.hour, arm, i + 1);
              return out;
            });
          attempts[arm].push(JSON.parse(a) as Attempt);
        }
      }));

      await step.do('live grading', () => livePhase(store, p.hour, 'grading'));
      const done = await step.do('finish', { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '10 minutes' }, async () => {
        const { result, root } = await finish(store, cfg, p, attempts);
        return { hour: result.hour, score: result.score, usd: result.cost.usd, root };
      });
      const { SEALS_ADDRESS, SEAL_KEY } = this.env;
      let sealTx: string | undefined;
      if (SEALS_ADDRESS && SEAL_KEY) {
        await step.do('live sealing', () => livePhase(store, done.hour, 'sealing', { score: done.score }));
        // a graded hour stays graded if sealing fails; the failure is written next to the seal bytes
        try {
          const tx = await step.do('seal', { retries: { limit: 5, delay: '1 minute', backoff: 'exponential' }, timeout: '5 minutes' },
            () => sealOnChain({ contract: SEALS_ADDRESS as `0x${string}`, key: SEAL_KEY as `0x${string}`, hour: done.hour, root: done.root as `0x${string}` }));
          await step.do('seal record', () => store.put(`seal/${done.hour}.tx.json`, JSON.stringify(tx, null, 2)));
          sealTx = 'tx' in tx ? tx.tx : undefined;
        } catch (e) {
          await step.do('seal failed', () => store.put(`seal/${done.hour}.tx.json`, JSON.stringify({ hour: done.hour, root: done.root, error: (e as Error).message.slice(0, 300) }, null, 2)));
        }
      }
      await step.do('live graded', () => livePhase(store, done.hour, 'graded', { score: done.score, ...(sealTx ? { seal_tx: sealTx } : {}) }));
      return done;
    } catch (e) {
      // record the hour as missed only if it has not been graded (finish advances the state)
      const reason = (e as Error).message;
      await step.do('missed', async () => {
        if ((await readState(store)).next_hour === claim.hour) {
          await recordMissed(store, reason);
          await livePhase(store, claim.hour, 'missed');
        }
      });
      return { missed: claim.hour, reason };
    } finally {
      await step.do('release', async () => { await this.env.DATA.delete(RUNNING); });
    }
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/data/')) return data(url.pathname.slice('/data/'.length), req, env);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

async function data(path: string, req: Request, env: Env): Promise<Response> {
  const headers = new Headers({ 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed', { status: 405, headers });
  if (path === 'live.json') {
    // progress of the running hour, composed from the per-arm files; changes every few seconds
    headers.set('content-type', 'application/json; charset=utf-8');
    headers.set('cache-control', 'no-store');
    const body = JSON.stringify(await composeLive(r2Store(env.DATA)));
    return new Response(req.method === 'HEAD' ? null : body, { headers });
  }
  if (!path || path.startsWith('_') || path.includes('..')) return new Response('not found', { status: 404, headers });
  const obj = await env.DATA.get(path);
  if (!obj) return new Response('not found', { status: 404, headers });
  headers.set('content-type', obj.httpMetadata?.contentType ?? contentType(path));
  headers.set('etag', obj.httpEtag);
  // files of a finished hour never change; results.jsonl and state.json change every hour
  headers.set('cache-control', /^(results\.jsonl|state\.json)$/.test(path) ? 'public, max-age=60' : 'public, max-age=300');
  return new Response(req.method === 'HEAD' ? null : obj.body, { headers });
}

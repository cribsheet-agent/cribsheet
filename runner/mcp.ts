// Read-only MCP server for the public record, served at /mcp (Streamable HTTP, JSON responses,
// stateless). Every tool reads what /data/ already publishes; nothing writes, signs or pays.
// The Worker supplies the reads (R2 and the chain), so the same code runs in tests.
import { createHash } from 'node:crypto';
import { isCorrect } from '../exam/grade.ts';
import { KIND_FORMAT, type Kind } from '../exam/types.ts';

export const SITE = 'https://cribsheet.pro';
export const PROTOCOL = '2025-06-18';
export const VERSION = '1.0.0';
export const SEALS = '0xfe6d4f39ca6732af967b941e8051d773f2c6011a';
const ARMS = ['blank', 'manual', 'self', 'crowd'] as const;
const NOTED = ['manual', 'self', 'crowd'] as const;

export interface Reader {
  /** A public file under /data/, as stored; null when it does not exist. */
  get(path: string): Promise<string | null>;
  /** /data/live.json as served. */
  live(): Promise<unknown>;
  /** CribsheetSeals.rootOf(hour) on Robinhood Chain, 0x-prefixed. */
  rootOf(hour: number): Promise<string>;
}

type Args = Record<string, unknown>;
interface Tool { name: string; title: string; description: string; inputSchema: Record<string, unknown>; annotations: Record<string, unknown> }

const HOUR = { type: 'integer', minimum: 0, description: 'Exam hour number (hour 0 ran 26 Nov 2026, 13:00 to 14:00 UTC). Omit for the latest graded hour.' };
const ro = (openWorld = false) => ({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: openWorld });

export const TOOLS: Tool[] = [
  {
    name: 'cribsheet_record',
    title: 'Scores of recent exam hours',
    description: 'Every hour, four copies of the same model (gpt-oss-120b) answer 8 questions about Pons launches on Robinhood Chain from the hour before. They differ only in their notes: Blank has none, Manual has a fixed manual written once, Self has its own notes (at most 300 words) rewritten after every graded hour, Crowd has Self\'s notes plus holder lessons that passed their test. Keys are read from the chain after the answers are in. Returns the last hours with each arm\'s score out of 8, cost and seal status, plus totals over the whole record.',
    inputSchema: { type: 'object', properties: { last: { type: 'integer', minimum: 1, maximum: 200, description: 'How many recent hours to list (default 24).' } } },
    annotations: ro(),
  },
  {
    name: 'cribsheet_hour',
    title: 'One exam hour in full',
    description: 'Returns one graded hour: each question with its text, level, tool-call budget, the key read from the chain, the sources and JSON-RPC calls behind the key, and every arm\'s answer with whether it was right. Use it to see where agents miss.',
    inputSchema: { type: 'object', properties: { hour: HOUR } },
    annotations: ro(),
  },
  {
    name: 'cribsheet_notes',
    title: 'An arm\'s notes for one hour',
    description: 'Returns the notes one arm carried into an hour (Markdown). Manual\'s are a fixed manual; Self\'s are rewritten by the model after every graded hour; Crowd\'s are Self\'s notes plus holder lessons that passed. Blank has no notes.',
    inputSchema: { type: 'object', properties: { arm: { type: 'string', enum: [...NOTED] }, hour: HOUR }, required: ['arm'] },
    annotations: ro(),
  },
  {
    name: 'cribsheet_transcript',
    title: 'Tool calls behind an answer',
    description: 'Returns the tool calls (JSON-RPC, keccak and so on) one arm made for one hour, with each result cut to 600 characters. Pass question (1 to 8, or an id such as "h44-q1") to get a single question.',
    inputSchema: { type: 'object', properties: { hour: HOUR, arm: { type: 'string', enum: [...ARMS] }, question: { type: ['integer', 'string'], description: 'Question number (1 to 8) or id.' } }, required: ['arm'] },
    annotations: ro(),
  },
  {
    name: 'cribsheet_live',
    title: 'The hour running now',
    description: 'Progress of the exam hour that is running: phase (answering, grading, sealing, graded), how many questions each arm has answered, and the score once graded. Answers stay hidden until grading.',
    inputSchema: { type: 'object', properties: {} },
    annotations: ro(),
  },
  {
    name: 'cribsheet_grade',
    title: 'Score your own answers',
    description: 'Grades answers from your own agent against one hour\'s keys, with the same rules as the exam (exact match after normalising: addresses, integers in decimal or hex, yes/no), and puts your score next to the four arms. Keys of past hours are public, so the comparison is fair only if your agent answered without reading cribsheet.pro.',
    inputSchema: {
      type: 'object',
      properties: {
        hour: HOUR,
        answers: { type: 'object', additionalProperties: { type: ['string', 'null'] }, description: 'Answers keyed by question id ("h44-q1") or number ("1" to "8"); null for no answer.' },
      },
      required: ['answers'],
    },
    annotations: ro(),
  },
  {
    name: 'cribsheet_verify_seal',
    title: 'Check an hour against the chain',
    description: 'Checks one sealed hour end to end: the SHA-256 of the seal bytes equals CribsheetSeals.rootOf(hour) on Robinhood Chain, and the hashes inside the seal match the hour\'s results line and the three notes files. Hours are sealed from hour 25.',
    inputSchema: { type: 'object', properties: { hour: HOUR } },
    annotations: ro(true),
  },
  {
    name: 'cribsheet_lessons',
    title: 'Lessons board',
    description: 'The CribsheetLessons board as last read from the chain: stake and reward in $CRIBSHEET, the reward pool, active lessons and their verdicts. A lesson is a note of at most 280 bytes; it is tested on Crowd for 3 hours against a copy of Crowd without it.',
    inputSchema: { type: 'object', properties: {} },
    annotations: ro(),
  },
];

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const text = (v: unknown) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 1) }];
const done = (v: unknown) => ({ content: text(v), ...(typeof v === 'object' && v && !Array.isArray(v) ? { structuredContent: v } : {}) });
class ToolError extends Error {}
const toolError = (message: string) => ({ isError: true, content: text(message) });

interface Row { hour: number; status: string; score?: Record<string, number>; cost?: { usd?: number }; questions?: Q[]; [k: string]: unknown }
interface Q { id: string; kind: Kind; level: number; text: string; key: string; key_sources?: string[]; key_calls?: string[]; budget?: number; answers?: Record<string, { answer: string | null; correct: boolean; calls?: number; stopped?: string }> }

async function rows(r: Reader): Promise<{ lines: string[]; all: Row[] }> {
  const lines = ((await r.get('results.jsonl')) ?? '').split('\n').filter(Boolean);
  return { lines, all: lines.map(l => JSON.parse(l) as Row) };
}

function pickHour(all: Row[], hour: unknown): Row {
  if (hour === undefined || hour === null) {
    const last = all.findLast(x => x.status === 'graded');
    if (!last) throw new ToolError('No graded hour yet.');
    return last;
  }
  const h = Number(hour);
  if (!Number.isInteger(h) || h < 0) throw new ToolError('hour must be a whole number from 0.');
  const row = all.find(x => x.hour === h);
  if (!row) throw new ToolError(`Hour ${h} is not in the record yet (latest is ${all.at(-1)?.hour ?? 'none'}).`);
  if (row.status !== 'graded') throw new ToolError(`Hour ${h} was not graded (${row.status}).`);
  return row;
}

function questionIndex(row: Row, q: unknown): number {
  const qs = row.questions ?? [];
  const i = typeof q === 'number' || /^\d+$/.test(String(q)) ? Number(q) - 1 : qs.findIndex(x => x.id === q);
  if (i < 0 || i >= qs.length) throw new ToolError(`No question ${String(q)} in hour ${row.hour} (it has ${qs.length}).`);
  return i;
}

async function call(r: Reader, name: string, a: Args) {
  switch (name) {
    case 'cribsheet_record': {
      const { all } = await rows(r);
      const last = Math.min(200, Math.max(1, Number(a.last ?? 24) || 24));
      const graded = all.filter(x => x.status === 'graded');
      const total = Object.fromEntries(ARMS.map(arm => [arm, graded.reduce((s, x) => s + (x.score?.[arm] ?? 0), 0)]));
      const sealed = new Set<number>();
      await Promise.all(all.slice(-last).map(async x => { if (x.hour >= 25 && (await r.get(`seal/${x.hour}.tx.json`))?.includes('"tx"')) sealed.add(x.hour); }));
      return done({
        hours: all.slice(-last).map(x => ({ hour: x.hour, status: x.status, score: x.score, usd: x.cost?.usd, sealed_on_chain: sealed.has(x.hour) })),
        totals: { hours_in_record: all.length, graded: graded.length, missed: all.length - graded.length, right_answers: total, out_of: graded.reduce((s, x) => s + (x.questions?.length ?? 0), 0) },
        source: `${SITE}/data/results.jsonl`,
      });
    }
    case 'cribsheet_hour': {
      const row = pickHour((await rows(r)).all, a.hour);
      const tx = await r.get(`seal/${row.hour}.tx.json`);
      return done({
        hour: row.hour, score: row.score, blocks: { start: row.start_block, end: row.end_block, key: row.key_block }, model: row.model, usd: row.cost?.usd,
        questions: (row.questions ?? []).map((q, i) => ({ n: i + 1, id: q.id, kind: q.kind, level: q.level, budget: q.budget, text: q.text, key: q.key, key_sources: q.key_sources, key_calls: q.key_calls, answers: q.answers })),
        seal: tx ? JSON.parse(tx) : null,
        source: `${SITE}/data/results.jsonl`,
      });
    }
    case 'cribsheet_notes': {
      const arm = String(a.arm);
      if (!(NOTED as readonly string[]).includes(arm)) throw new ToolError('arm must be manual, self or crowd (Blank has no notes).');
      const row = pickHour((await rows(r)).all, a.hour);
      const notes = await r.get(`notes/${arm}/${row.hour}.md`);
      if (notes === null) throw new ToolError(`No ${arm} notes stored for hour ${row.hour}.`);
      return { content: text(`<!-- ${arm} notes, hour ${row.hour}, ${SITE}/data/notes/${arm}/${row.hour}.md -->\n${notes}`) };
    }
    case 'cribsheet_transcript': {
      const arm = String(a.arm);
      if (!(ARMS as readonly string[]).includes(arm)) throw new ToolError('arm must be blank, manual, self or crowd.');
      const row = pickHour((await rows(r)).all, a.hour);
      const raw = await r.get(`transcripts/${row.hour}/${arm}.json`);
      if (raw === null) throw new ToolError(`No ${arm} transcript stored for hour ${row.hour}.`);
      type Entry = { id: string; answer: string | null; calls?: { tool: string; args: unknown; result: string }[] };
      let list = JSON.parse(raw) as Entry[];
      if (a.question !== undefined) { const id = row.questions?.[questionIndex(row, a.question)]?.id; list = list.filter(e => e.id === id); }
      const cut = (s: unknown) => { const t = typeof s === 'string' ? s : JSON.stringify(s); return t.length > 600 ? `${t.slice(0, 600)}… (${t.length} chars)` : t; };
      return done({ hour: row.hour, arm, questions: list.map(e => ({ ...e, calls: e.calls?.map(c => ({ ...c, result: cut(c.result) })) })), source: `${SITE}/data/transcripts/${row.hour}/${arm}.json` });
    }
    case 'cribsheet_live':
      return done(await r.live());
    case 'cribsheet_grade': {
      const row = pickHour((await rows(r)).all, a.hour);
      const given = (a.answers && typeof a.answers === 'object' ? a.answers : {}) as Record<string, unknown>;
      const qs = row.questions ?? [];
      const known = new Set([...qs.map(q => q.id), ...qs.map((_, i) => String(i + 1))]);
      const unknown = Object.keys(given).filter(k => !known.has(k));
      if (unknown.length) throw new ToolError(`Unknown question ids: ${unknown.join(', ')}. Hour ${row.hour} has ${qs.map(q => q.id).join(', ')}.`);
      const graded = qs.map((q, i) => {
        const v = given[q.id] ?? given[String(i + 1)] ?? null;
        const answer = v === null ? null : String(v);
        return { n: i + 1, id: q.id, kind: q.kind, answer, key: q.key, correct: isCorrect({ format: KIND_FORMAT[q.kind], key: q.key }, answer) };
      });
      return done({ hour: row.hour, you: graded.filter(g => g.correct).length, out_of: qs.length, arms: row.score, questions: graded, note: 'Fair only if your agent answered from the chain without reading cribsheet.pro.' });
    }
    case 'cribsheet_verify_seal': {
      const { lines, all } = await rows(r);
      const row = pickHour(all, a.hour);
      if (row.hour < 25) throw new ToolError('Hours are sealed on chain from hour 25.');
      const bytes = await r.get(`seal/${row.hour}`);
      if (bytes === null) throw new ToolError(`No seal stored for hour ${row.hour}.`);
      const fields = Object.fromEntries(bytes.trim().split('\n').slice(1).map(l => l.split('=') as [string, string]));
      const line = lines.find(l => l.startsWith(`{"hour":${row.hour},`)) ?? '';
      const checks: { check: string; ok: boolean; detail: string }[] = [{ check: 'results', ok: sha(line) === fields.results, detail: 'sha256 of the hour\'s line in results.jsonl' }];
      for (const arm of NOTED) checks.push({ check: arm, ok: sha((await r.get(`notes/${arm}/${row.hour}.md`)) ?? '') === fields[arm], detail: `sha256 of notes/${arm}/${row.hour}.md` });
      const root = '0x' + sha(bytes);
      const onChain = (await r.rootOf(row.hour)).toLowerCase();
      checks.push({ check: 'chain', ok: onChain === root, detail: `rootOf(${row.hour}) on ${SEALS} = ${onChain}` });
      return done({ hour: row.hour, ok: checks.every(c => c.ok), root, checks, seal_bytes: bytes, run_it_yourself: `node tools/verify-seal.ts ${row.hour}` });
    }
    case 'cribsheet_lessons': {
      const board = await r.get('lessons/index.json');
      if (board === null) throw new ToolError('The lessons board has not been read yet.');
      return done(JSON.parse(board));
    }
  }
  throw new ToolError(`No tool ${name}.`);
}

export async function callTool(r: Reader, name: string, args: Args) {
  try { return await call(r, name, args); } catch (e) {
    if (e instanceof ToolError) return toolError(e.message);
    return toolError(`Could not read the record: ${(e as Error).message.slice(0, 200)}`);
  }
}

const INSTRUCTIONS = 'Cribsheet is an hourly on-chain AI exam on Robinhood Chain. Four copies of one model answer 8 questions about the previous hour\'s Pons launches; only their notes differ. Everything here is read-only and free: scores (cribsheet_record), full hours with keys and answers (cribsheet_hour), notes, tool-call transcripts, the running hour, grading your own agent\'s answers, checking an hour against its on-chain seal, and the lessons board. Answers by the arms are agent answers, not facts; the key is what the chain said.';

export const serverInfo = { name: 'cribsheet', title: 'Cribsheet', version: VERSION, websiteUrl: `${SITE}/developers#mcp` };

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Args };

export async function handleRpc(r: Reader, m: Rpc) {
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id ?? null, result });
  switch (m?.method) {
    case 'initialize': return ok({ protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo, instructions: INSTRUCTIONS });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': return ok(await callTool(r, String(m.params?.name ?? ''), (m.params?.arguments as Args) ?? {}));
    default: return m?.id == null ? null : { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `method not found: ${m.method}` } };
  }
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** POST /mcp: one JSON-RPC message or a batch. GET answers 405, as a server without SSE streams. */
export async function mcpFetch(req: Request, r: Reader): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST (MCP Streamable HTTP, JSON responses).', docs: `${SITE}/developers#mcp` }, 405);
  const body = await req.json().catch(() => null) as Rpc | Rpc[] | null;
  if (!body || typeof body !== 'object') return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400);
  const batch = Array.isArray(body) ? body : [body];
  if (batch.length > 20) return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'batch of at most 20' } }, 400);
  const out = (await Promise.all(batch.map(m => handleRpc(r, m)))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(body) ? out : out[0]);
}

/** Static metadata for directories that cannot scan, at /.well-known/mcp/server-card.json. */
export const serverCard = () => ({
  serverInfo,
  description: 'Read-only record of an hourly on-chain AI exam on Robinhood Chain: scores, keys, answers, notes, transcripts, seals and lessons.',
  iconUrl: `${SITE}/assets/icon-512.png`,
  transport: { type: 'streamable-http', url: `${SITE}/mcp` },
  authentication: { required: false },
  tools: TOOLS, resources: [], prompts: [],
});

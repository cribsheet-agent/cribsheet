import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callTool, mcpFetch, TOOLS, type Reader } from '../runner/mcp.ts';
import { sealBytes, sealRoot } from '../runner/seal.ts';
import { KIND_FORMAT, KIND_LEVEL } from '../exam/types.ts';

const ans = (answer: string | null, correct: boolean) => ({ answer, correct, calls: 3 });
const row = (hour: number) => ({
  hour, status: 'graded', start_block: 10, end_block: 20, key_block: 25, level: 1, model: 'm',
  score: { blank: 0, manual: 1, self: 2, crowd: 1 },
  questions: [
    { id: `h${hour}-q1`, kind: 'launch_block', level: 1, text: 'block?', key: '124922884', budget: 8,
      answers: { blank: ans(null, false), manual: ans('124922884', true), self: ans('124922884', true), crowd: ans(null, false) } },
    { id: `h${hour}-q2`, kind: 'graduated', level: 2, text: 'graduated?', key: 'no', budget: 12,
      answers: { blank: ans('yes', false), manual: ans('yes', false), self: ans('no', true), crowd: ans('no', true) } },
  ],
  cost: { usd: 0.2 },
});

function reader(opts: { tamper?: boolean } = {}): Reader & { files: Map<string, string> } {
  const files = new Map<string, string>();
  const lines = [JSON.stringify(row(25)), JSON.stringify(row(26)), JSON.stringify({ hour: 27, status: 'missed', missed_reason: 'rpc' })];
  files.set('results.jsonl', lines.join('\n') + '\n');
  for (const h of [25, 26]) {
    const notes = { manual: `manual ${h}`, self: `self ${h}`, crowd: `crowd ${h}` };
    for (const [arm, t] of Object.entries(notes)) files.set(`notes/${arm}/${h}.md`, t);
    files.set(`seal/${h}`, sealBytes(h, lines[h - 25]!, notes));
    files.set(`seal/${h}.tx.json`, JSON.stringify({ hour: h, tx: '0xabc' }));
  }
  files.set('transcripts/26/self.json', JSON.stringify([
    { id: 'h26-q1', answer: '124922884', calls: [{ tool: 'rpc', args: {}, result: 'x'.repeat(2000) }] },
    { id: 'h26-q2', answer: 'no', calls: [] },
  ]));
  return {
    files,
    async get(p) { return files.get(p) ?? null; },
    async live() { return { phase: 'answering', hour: 28 }; },
    async rootOf(h) { return opts.tamper ? '0x' + '0'.repeat(64) : sealRoot(files.get(`seal/${h}`)!); },
  };
}
const out = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text);

test('every kind has an answer format', () => {
  assert.deepEqual(Object.keys(KIND_FORMAT).sort(), Object.keys(KIND_LEVEL).sort());
});

test('every tool is read-only', () => {
  for (const t of TOOLS) assert.equal(t.annotations.readOnlyHint, true, t.name);
});

test('record lists hours with totals and seal status', async () => {
  const v = out(await callTool(reader(), 'cribsheet_record', {}) as never);
  assert.equal(v.hours.length, 3);
  assert.deepEqual(v.totals, { hours_in_record: 3, graded: 2, missed: 1, right_answers: { blank: 0, manual: 2, self: 4, crowd: 2 }, out_of: 4 });
  assert.equal(v.hours[0].sealed_on_chain, true);
  assert.equal(v.hours[2].sealed_on_chain, false);
});

test('hour defaults to the latest graded hour and refuses a missed one', async () => {
  assert.equal(out(await callTool(reader(), 'cribsheet_hour', {}) as never).hour, 26);
  const missed = await callTool(reader(), 'cribsheet_hour', { hour: 27 }) as { isError?: boolean };
  assert.equal(missed.isError, true);
  assert.equal((await callTool(reader(), 'cribsheet_hour', { hour: 99 }) as { isError?: boolean }).isError, true);
});

test('grade uses the exam rules (hex block, yes/no)', async () => {
  const v = out(await callTool(reader(), 'cribsheet_grade', { hour: 26, answers: { 'h26-q1': '0x' + (124922884).toString(16), 2: 'No.' } }) as never);
  assert.equal(v.you, 2);
  assert.deepEqual(v.arms, { blank: 0, manual: 1, self: 2, crowd: 1 });
  const bad = await callTool(reader(), 'cribsheet_grade', { answers: { 'h9-q1': '1' } }) as { isError?: boolean };
  assert.equal(bad.isError, true);
});

test('verify_seal passes on the stored bytes and fails when the chain differs', async () => {
  const ok = out(await callTool(reader(), 'cribsheet_verify_seal', { hour: 25 }) as never);
  assert.equal(ok.ok, true);
  assert.equal(ok.checks.length, 5);
  const r = reader();
  r.files.set('notes/self/26.md', 'edited');
  const edited = out(await callTool(r, 'cribsheet_verify_seal', {}) as never);
  assert.equal(edited.ok, false);
  assert.equal(edited.checks.find((c: { check: string }) => c.check === 'self').ok, false);
  assert.equal(out(await callTool(reader({ tamper: true }), 'cribsheet_verify_seal', { hour: 25 }) as never).ok, false);
});

test('notes and transcripts', async () => {
  const notes = await callTool(reader(), 'cribsheet_notes', { arm: 'crowd', hour: 25 }) as { content: { text: string }[] };
  assert.match(notes.content[0]!.text, /crowd 25$/);
  assert.equal((await callTool(reader(), 'cribsheet_notes', { arm: 'blank' }) as { isError?: boolean }).isError, true);
  const t = out(await callTool(reader(), 'cribsheet_transcript', { arm: 'self', question: 1 }) as never);
  assert.equal(t.questions.length, 1);
  assert.ok(t.questions[0].calls[0].result.length < 700);
});

test('protocol: initialize, tools/list, notifications, unknown methods, GET', async () => {
  const post = (body: unknown) => mcpFetch(new Request('https://x/mcp', { method: 'POST', body: JSON.stringify(body) }), reader());
  const init = await (await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).json() as { result: { serverInfo: { name: string } } };
  assert.equal(init.result.serverInfo.name, 'cribsheet');
  const list = await (await post([{ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { jsonrpc: '2.0', method: 'notifications/initialized' }])).json() as { result: { tools: unknown[] } }[];
  assert.equal(list.length, 1);
  assert.equal(list[0]!.result.tools.length, TOOLS.length);
  assert.equal((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const unknown = await (await post({ jsonrpc: '2.0', id: 3, method: 'resources/list' })).json() as { error: { code: number } };
  assert.equal(unknown.error.code, -32601);
  assert.equal((await mcpFetch(new Request('https://x/mcp'), reader())).status, 405);
  assert.equal((await mcpFetch(new Request('https://x/mcp', { method: 'POST', body: '{' }), reader())).status, 400);
});

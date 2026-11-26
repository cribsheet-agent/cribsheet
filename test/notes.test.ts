import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewriteNotes, REWRITE_MAX_TOKENS } from '../arms/notes.ts';
import type { ModelConfig } from '../lib/model.ts';

const reply = (content: string | null, seen: Record<string, unknown>[] = []): ModelConfig => ({
  model: 'test',
  run: async body => { seen.push(body); return { choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 10, completion_tokens: REWRITE_MAX_TOKENS } }; },
});

test('an empty rewrite keeps the notes Self already had', async () => {
  for (const content of ['', '   \n', null]) {
    const r = await rewriteNotes(reply(content), '- factory 0x7ed5', []);
    assert.equal(r.notes, '- factory 0x7ed5');
    assert.equal(r.kept, 'empty rewrite');
  }
});

test('a real rewrite replaces the notes and asks for the larger budget', async () => {
  const seen: Record<string, unknown>[] = [];
  const r = await rewriteNotes(reply('- new line', seen), '- old line', []);
  assert.equal(r.notes, '- new line');
  assert.equal(r.kept, undefined);
  assert.equal(seen[0]!.max_tokens, REWRITE_MAX_TOKENS);
});

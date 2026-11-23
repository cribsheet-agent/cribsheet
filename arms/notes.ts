// After grading, Self rewrites its notes from what happened this hour.
import { chat, type ModelConfig, type Usage } from '../lib/model.ts';
import { NOTES_MAX_WORDS, capWords } from './blocks.ts';
import type { Attempt } from './agent.ts';
import type { Question } from '../exam/types.ts';

const REWRITE = `You keep the notes you will read before the next hourly exam about the Pons launch factory on Robinhood Chain.
Below are your current notes and what happened this hour: each question, your answer, the correct answer, and the tool calls you made.
Rewrite your notes so you do better next hour. Keep facts you confirmed from chain data (addresses, event topics, selectors, which tool calls worked).
Drop anything that turned out wrong. Be specific and short.
Return only the new notes, at most ${NOTES_MAX_WORDS} words.`;

export async function rewriteNotes(cfg: ModelConfig, current: string, hour: { q: Question; a: Attempt; correct: boolean }[]): Promise<{ notes: string; usage: Usage }> {
  const report = hour.map(({ q, a, correct }) => {
    const calls = a.calls.map(c => `  - ${c.tool} ${JSON.stringify(c.args).slice(0, 240)} -> ${c.result.slice(0, 200)}`).join('\n');
    return `Question: ${q.text}\nYour answer: ${a.answer ?? '(none, ' + a.stopped + ')'}\nCorrect answer: ${q.key} (${correct ? 'right' : 'wrong'})\nCalls:\n${calls}`;
  }).join('\n\n');
  const { message, usage } = await chat(cfg, [
    { role: 'system', content: REWRITE },
    { role: 'user', content: `Current notes:\n${current.trim() || '(none yet)'}\n\nThis hour:\n${report}` },
  ], undefined, 3000);
  return { notes: capWords(message.content ?? current), usage };
}

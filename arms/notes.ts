// After grading, Self rewrites its notes from what happened this hour.
import { chat, type ModelConfig, type Usage } from '../lib/model.ts';
import { NOTES_MAX_WORDS, capWords } from './blocks.ts';
import type { Attempt } from './agent.ts';
import type { Question } from '../exam/types.ts';
import type { CheckedItem } from '../checker/check.ts';

const REWRITE = `You keep the notes you will read before the next hourly exam about the Pons launch factory on Robinhood Chain.
Below are your current notes, the fact check of those notes, and what happened this hour: each question, your answer, the correct answer, how the correct answer was read from the chain, and the tool calls you made.
The fact check marks a line cracked when its event topic never appeared in the factory's logs or its selector returned no data from the factory. Fix or drop cracked lines; do not call a fact verified unless a tool call this hour confirmed it.
Rewrite your notes so you do better next hour. Keep facts you confirmed from chain data (addresses, event topics, selectors, which tool calls worked).
Drop anything that turned out wrong. Be specific and short.
Return only the new notes, at most ${NOTES_MAX_WORDS} words.`;

export async function rewriteNotes(cfg: ModelConfig, current: string, hour: { q: Question; a: Attempt; correct: boolean }[], check: CheckedItem[] = []): Promise<{ notes: string; usage: Usage }> {
  const report = hour.map(({ q, a, correct }) => {
    const calls = a.calls.map(c => `  - ${c.tool} ${JSON.stringify(c.args).slice(0, 240)} -> ${c.result.slice(0, 200)}`).join('\n');
    return `Question: ${q.text}\nYour answer: ${a.answer ?? '(none, ' + a.stopped + ')'}\nCorrect answer: ${q.key} (${correct ? 'right' : 'wrong'})\nRead from: ${q.key_sources.join('; ')}\nCalls:\n${calls}`;
  }).join('\n\n');
  const cracked = check.filter(c => c.mark === 'cracked').map(c => `- cracked ${c.kind} ${c.value}: ${c.line.slice(0, 200)}`);
  const checked = check.length ? `${check.filter(c => c.mark === 'seen').length} seen, ${cracked.length} cracked, ${check.filter(c => c.mark === 'untestable').length} untestable.${cracked.length ? '\n' + cracked.join('\n') : ''}` : '(nothing checked)';
  const { message, usage } = await chat(cfg, [
    { role: 'system', content: REWRITE },
    { role: 'user', content: `Current notes:\n${current.trim() || '(none yet)'}\n\nFact check of these notes:\n${checked}\n\nThis hour:\n${report}` },
  ], undefined, 3000);
  return { notes: capWords(message.content ?? current), usage };
}

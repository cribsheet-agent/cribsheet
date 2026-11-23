// One arm answering one question: a tool loop with a hard call budget.
import { chat, type Message, type ModelConfig, type Usage } from '../lib/model.ts';
import { SHARED, budgetLine } from './prompt.ts';
import { TOOLS, runTool } from './tools.ts';

export interface Call { tool: string; args: unknown; result: string }
export interface Attempt { answer: string | null; calls: Call[]; usage: Usage[]; stopped: 'answered' | 'budget' | 'no_tool' }

export async function attempt(cfg: ModelConfig, lastBlock: string, question: string, budget: number): Promise<Attempt> {
  const messages: Message[] = [
    { role: 'system', content: `${SHARED}\n\n${lastBlock}` },
    { role: 'user', content: `${question}\n\n${budgetLine(budget)}` },
  ];
  const calls: Call[] = [], usage: Usage[] = [];
  let nudged = false;
  while (calls.length < budget) {
    const { message, usage: u } = await chat(cfg, messages, TOOLS);
    usage.push(u);
    messages.push(message);
    if (!message.tool_calls) {
      // one reminder if the model answers in plain text instead of calling a tool; no call is spent
      if (nudged) return { answer: null, calls, usage, stopped: 'no_tool' };
      nudged = true;
      messages.push({ role: 'user', content: 'Use a tool. Call answer with your final value.' });
      continue;
    }
    for (const tc of message.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* bad JSON still costs the call */ }
      if (calls.length >= budget) { messages.push({ role: 'tool', tool_call_id: tc.id, content: 'error: budget used up' }); continue; }
      if (tc.function.name === 'answer') {
        const value = String(args.value ?? '');
        calls.push({ tool: 'answer', args, result: 'submitted' });
        return { answer: value, calls, usage, stopped: 'answered' };
      }
      const result = await runTool(tc.function.name, args);
      calls.push({ tool: tc.function.name, args, result });
      const left = budget - calls.length;
      messages.push({ role: 'tool', tool_call_id: tc.id, content: `${result}\n[${left} call${left === 1 ? '' : 's'} left]` });
    }
  }
  return { answer: null, calls, usage, stopped: 'budget' };
}

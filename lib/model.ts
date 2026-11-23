// Chat-completions client (OpenAI-compatible). Default: Cloudflare Workers AI.
// Usage is recorded per call so the cost of every hour can be published.

export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
export interface ToolSpec { type: 'function'; function: { name: string; description: string; parameters: object } }
export interface Usage { prompt_tokens: number; completion_tokens: number; neurons?: number }
export interface Reply { message: Extract<Message, { role: 'assistant' }>; usage: Usage }

export interface ModelConfig { model: string; url: string; token: string }

export function workersAi(model: string): ModelConfig {
  const account = process.env.CF_ACCOUNT_ID, token = process.env.CF_API_TOKEN;
  if (!account || !token) throw new Error('set CF_ACCOUNT_ID and CF_API_TOKEN (Workers AI)');
  return { model, url: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`, token };
}

export async function chat(cfg: ModelConfig, messages: Message[], tools?: ToolSpec[], maxTokens = 2048): Promise<Reply> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, messages, tools, temperature: 0, max_tokens: maxTokens }),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`model HTTP ${res.status}: ${text.slice(0, 300)}`);
      const body = JSON.parse(text) as { choices?: { message: Reply['message'] }[]; usage?: Usage };
      const message = body.choices?.[0]?.message;
      if (!message) throw new Error(`model returned no choice: ${text.slice(0, 300)}`);
      return { message: { role: 'assistant', content: message.content ?? '', tool_calls: message.tool_calls?.length ? message.tool_calls : undefined }, usage: body.usage ?? { prompt_tokens: 0, completion_tokens: 0 } };
    } catch (e) {
      last = e;
      await new Promise(r => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  throw last;
}

/** Workers AI bills neurons at a list price of $0.011 per 1,000 (re-check the price page before publishing a cost). */
export const neuronsToUsd = (n: number): number => (n / 1000) * 0.011;

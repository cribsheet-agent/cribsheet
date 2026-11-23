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

/**
 * Either the REST endpoint (url + token, local runs) or `run`, a function that takes the
 * request body and returns the response body (the Workers AI binding in the Worker).
 */
export interface ModelConfig {
  model: string;
  url?: string;
  token?: string;
  refresh?: () => string;
  run?: (body: Record<string, unknown>) => Promise<unknown>;
}

/** Workers AI over REST. `refresh` returns a fresh token, for short-lived tokens. */
export function workersAi(model: string, account: string, token: string, refresh?: () => string): ModelConfig {
  return { model, url: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`, token, refresh };
}

/** Workers AI through the binding; it returns the same chat-completions body as REST. */
export function workersAiBinding(model: string, ai: { run(model: string, body: Record<string, unknown>): Promise<unknown> }): ModelConfig {
  return { model, run: body => ai.run(model, body) };
}

export async function chat(cfg: ModelConfig, messages: Message[], tools?: ToolSpec[], maxTokens = 2048): Promise<Reply> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const request = { messages, tools, temperature: 0, max_tokens: maxTokens };
      const body = (cfg.run ? await cfg.run(request) : await post(cfg, request)) as { choices?: { message: Reply['message'] }[]; usage?: Usage };
      const message = body.choices?.[0]?.message;
      if (!message) throw new Error(`model returned no choice: ${JSON.stringify(body).slice(0, 300)}`);
      return { message: { role: 'assistant', content: message.content ?? '', tool_calls: message.tool_calls?.length ? message.tool_calls : undefined }, usage: body.usage ?? { prompt_tokens: 0, completion_tokens: 0 } };
    } catch (e) {
      last = e;
      await new Promise(r => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  throw last;
}

async function post(cfg: ModelConfig, request: Record<string, unknown>): Promise<unknown> {
  if (!cfg.url || !cfg.token) throw new Error('model config needs url and token, or run');
  const sentWith = cfg.token;
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${sentWith}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, ...request }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  if (res.status === 401 && cfg.refresh) {
    // arms run in parallel: refresh once and let the others pick up the new token
    if (cfg.token === sentWith) cfg.token = cfg.refresh();
    throw new Error('model token expired, refreshed');
  }
  if (!res.ok) throw new Error(`model HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** Workers AI bills neurons at a list price of $0.011 per 1,000 (re-check the price page before publishing a cost). */
export const neuronsToUsd = (n: number): number => (n / 1000) * 0.011;

// The system prompt all four arms share. Only the last block differs (see blocks.ts).
// Published word for word; any change applies from the next hour, never to graded hours.

export const SHARED = `You are sitting an exam about Robinhood Chain (chain id 4663), an EVM chain.
Each question is about tokens launched through the Pons launch factory at 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e.
You have three tools: rpc (read-only JSON-RPC), keccak, and answer.
You have a fixed budget of tool calls per question, and answer counts as one of them.
Calls cost budget whether they succeed or fail. If the budget runs out before you call answer, the question is marked wrong.
Work from chain data. Do not guess when you can check, but always call answer before the budget runs out.
Give only the value in answer: an address, an integer, or yes/no, as the question asks.`;

export const budgetLine = (budget: number): string => `Budget for this question: ${budget} tool calls, answer included.`;

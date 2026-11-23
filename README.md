# Cribsheet

Four copies of the same AI agent sit the same exam every hour on Robinhood Chain (chain 4663). Same model, same prompt, same tools, same call budget. The only difference is the last block of context each one brings in:

| Arm | Brings | Question it answers |
|---|---|---|
| **Blank** | nothing | How far does the model get on tools alone? |
| **Manual** | a fixed manual, written once and frozen | Is good documentation enough? |
| **Self** | its own notes, at most 300 words, rewritten after every graded hour | Does memory beat a manual? |
| **Crowd** | Self's notes plus holder lessons that passed their test | Can people make an agent better, and prove it? |

Answer keys are read from chain data by a script before any agent starts. No model grades a model.

Site: [cribsheet.pro](https://cribsheet.pro) · X: [@Cribsheet_Agent](https://x.com/Cribsheet_Agent)

## Status

Pre-launch. Hour 0 has not run.

| Part | State | Where |
|---|---|---|
| Site (pre-launch page) | live | [`site/`](site/) |
| Exam rules | draft, matches the code | [`METHOD.md`](METHOD.md) |
| Public data formats | draft | [`spec/`](spec/) |
| Question generator and key readers (Pons factory) | built, tested on live chain data | [`exam/`](exam/) |
| Arm prompts, tools and the Manual | built | [`arms/`](arms/) |
| Notes fact checker | built | [`checker/`](checker/) |
| Hourly runner | local runner built (F0); Worker + cron not built (F1) | [`runner/`](runner/) |
| Seal contract | not deployed | `contracts/` (F1) |
| Lessons contract, Ask API | not built | F2 |
| $CRIBSHEET | not launched, no contract address | — |

This table is updated in the same commit that changes a row. If the site or a post claims something this table calls "not built", the table wins.

## Roadmap

- **F0**: local runner, question families 1 and 2 for the Pons launch factory, keys read two ways, the four arms, measured cost per hour. Done when 24 hours run with no missed hour.
- **F1**: hourly runner on Cloudflare Workers, public `/data/`, `CribsheetSeals` deployed and verified, fact check on every hour. Done when about 48 hours of data are public.
- **F2**: `CribsheetLessons` (stake a lesson for Crowd), Ask API over x402, MCP server.

## Layout

```
METHOD.md   exam rules: questions, keys, grading, notes, seals
lib/        JSON-RPC client, keccak-256, ABI words, model client (no runtime dependencies)
exam/       Pons factory readers, question generator, keys read two ways, grading
arms/       shared prompt, the four last blocks, the Manual, tools, agent loop, notes rewrite
checker/    fact check of the notes against the chain
runner/     one exam hour end to end, seal bytes, local CLI
spec/       formats of the public files under /data/
site/       cribsheet.pro (static, Cloudflare Workers assets)
test/       unit tests, with real factory logs as fixtures
```

## Run an hour locally

Needs Node 24+ and a Cloudflare account with Workers AI.

```
npm ci
CF_ACCOUNT_ID=... CF_API_TOKEN=... node runner/cli.ts --dir data --model @cf/openai/gpt-oss-120b
```

For short-lived tokens, set `CF_API_TOKEN_CMD` to a command that prints a fresh one; the runner calls it on a 401. A failed hour is written as missed.

It reads the last full UTC hour of launches, asks the four arms, grades them, rewrites Self's notes and writes `data/results.jsonl`, `data/notes/`, `data/check/`, `data/seal/` and full transcripts.

## Checks

```
node scripts/check.mjs && npx tsc --noEmit && node --test 'test/*.test.ts'
```

CI runs the same on every pull request.

## License

[MIT](LICENSE)

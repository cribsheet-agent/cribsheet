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
| Exam rules | draft | [`METHOD.md`](METHOD.md) |
| Public data formats | draft | [`spec/`](spec/) |
| Question generator and key readers | not built | `exam/` (F0) |
| Arm prompts and the Manual | not built | `arms/` (F0) |
| Notes fact checker | not built | `checker/` (F0) |
| Hourly runner | not built | `runner/` (F1) |
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
spec/       formats of the public files under /data/
site/       cribsheet.pro (static, Cloudflare Workers assets)
scripts/    repo checks run in CI
```

## Checks

```
node scripts/check.mjs
```

Runs in CI on every pull request: spec files parse, internal links resolve, and the site ships no mockup text or sample values.

## License

[MIT](LICENSE)

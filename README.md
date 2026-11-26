# Cribsheet

[![CI](https://github.com/cribsheet-agent/cribsheet/actions/workflows/ci.yml/badge.svg)](https://github.com/cribsheet-agent/cribsheet/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

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
| F0 test runs (23–24 Nov 2026) | raw records public: every question, key, key calls, answer, tool call, notes version and fact check | [`records/f0/`](records/f0/), [`docs/f0-runs.md`](docs/f0-runs.md) |
| Hourly runner | local runner (F0) and Worker + Workflow built; the hourly schedule is not switched on | [`runner/`](runner/), [`worker/`](worker/) |
| Public record `/data/` | served by the Worker from R2; empty until hour 0 | [`worker/`](worker/), [`spec/`](spec/) |
| Seal contract | written and tested; not deployed | [`contracts/`](contracts/) |
| Seal check | built | [`tools/verify-seal.ts`](tools/verify-seal.ts) |
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
lib/        JSON-RPC client, keccak-256, ABI words, model client
exam/       Pons factory readers, question generator, keys read two ways, grading
arms/       shared prompt, the four last blocks, the Manual, tools, agent loop, notes rewrite
checker/    fact check of the notes against the chain
runner/     one exam hour in three phases (prepare, answer, finish), seal bytes, local CLI
worker/     the cribsheet.pro Worker: site, /data/ from R2, the exam hour as a Workflow
contracts/  CribsheetSeals (Foundry) and its tests
tools/      verify-seal: check a sealed hour against the site and the chain
spec/       formats of the public files under /data/
site/       cribsheet.pro static files
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

## The Worker

`wrangler.jsonc` defines one Worker, `cribsheet`: the static site, `/data/*` read from the R2 bucket `cribsheet-data`, and the Workflow `cribsheet-hour` (class `ExamHour` in [`worker/index.ts`](worker/index.ts)). One Workflow instance is one exam hour; preparing, every answer, finishing and sealing are separate steps, each retried on failure. The model is called through the Workers AI binding.

```
npx wrangler deploy                      # site + Worker
npx wrangler deploy --env staging        # same code, own bucket, no public URL
npx wrangler workflows trigger cribsheet-hour-staging --env staging   # one test hour
```

The hourly schedule (`"schedules": ["1 * * * *"]` on the Workflow) is added when hour 0 is due. Sealing on chain needs `SEALS_ADDRESS` (a var) and `SEAL_KEY` (a secret); without them hours are graded and their seal bytes published, but not sealed.

The Worker needs its own Robinhood Chain RPC endpoint as the secret `RPC_URL`: the public endpoint answers `eth_getLogs` from Cloudflare's network with HTTP 429 (measured 24 November 2026), and the exam reads keys from logs. Local runs use the public endpoint, or `CRIBSHEET_RPC`.

## Checks

```
node scripts/check.mjs && node scripts/embed.mjs --check && npx tsc --noEmit && npx tsc --noEmit -p worker && node --test 'test/*.test.ts'
cd contracts && forge test
```

CI runs the same on every pull request, plus Slither on the contract.

## How this repository is maintained

Every commit on `main` is authored by `cribsheet-bot`, the project's GitHub App. The maintainers are pseudonymous and ship through the App so that no personal account is tied to the project. The process is the same for every change:

1. A change is written as one commit on a branch and opened as a pull request.
2. CI must pass: the repository checks, type checks and unit tests, `forge test` on the contract, and Slither.
3. The pull request is squash-merged, so `main` has one signed commit per pull request. Pull requests up to #12 used merge commits, which is why older history shows each change twice: the branch commit and its merge.

What makes the work checkable does not depend on who wrote it: the exam rules are in [`METHOD.md`](METHOD.md), every hour's questions, keys, answers and transcripts are published under `/data/`, and each hour's seal can be checked with [`tools/verify-seal.ts`](tools/verify-seal.ts). Outside pull requests are welcome; see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE)

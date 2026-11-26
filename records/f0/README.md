# F0 records

Raw output of the local F0 test runs on 23 and 24 November 2026, before hour 0. Model `@cf/openai/gpt-oss-120b` on Workers AI, temperature 0. The write-up is [`docs/f0-runs.md`](../../docs/f0-runs.md).

| File | What it holds |
|---|---|
| `results.jsonl` | one line per hour: status (graded or missed with the reason), block window, key block, questions, keys, key sources, `key_calls`, each arm's answer, calls used and whether it was right, score, cost |
| `transcripts/<hour>/<arm>.json` | every tool call and reply for that arm in that hour |
| `notes/` | each version of the notes an arm read |
| `check/<hour>.json` | the fact check of Self's notes before that hour: each line, cracked or seen, and why |
| `seal/<hour>` | the bytes the hour's seal root is computed from (`tools/verify-seal.ts`) |
| `state.json` | runner state after the last hour |

Graded hours: 0, 1, 5, 6, 11. Missed hours are in `results.jsonl` with their reason. These hours are not part of the official record; it starts at hour 0 when the hourly runner is switched on.

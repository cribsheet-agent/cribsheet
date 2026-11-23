# F0 test runs

Local runs before hour 0. They are not part of the record: hour numbers restart at 0 when the runner goes live.

## Run 1 · 23 November 2026

- Window: blocks 120,927,913 to 120,957,609 (one UTC hour, 20 Pons launches). Keys read at block 120,987,410.
- Model: `@cf/openai/gpt-oss-120b` on Workers AI, temperature 0. Level 1 (four level-1 questions, two retention, two level-2 probes).
- Questions: 8, none dropped (every two-way key reading agreed).

| Arm | Right | Notes |
|---|---|---|
| Blank | 0 / 8 | never found the factory address; used up the budget on every question |
| Manual | 3 / 8 | right in 2 calls each on creator and curve; wrong on a curve address it copied one character short, a launch count over a mis-converted block range, and a creator tax read from the wrong word |
| Self | 0 / 8 | no notes yet (first hour) |
| Crowd | 0 / 8 | no notes, no lessons yet |

Cost: 19,298 neurons for the hour, about $0.21 at the $0.011 per 1,000 neurons list price (Blank 5,074 · Manual 2,631 · Self 5,574 · Crowd 5,663 · notes rewrite 356). Manual is the cheapest arm because it stops early.

What Self wrote after the hour: correct advice on hex block numbers and the 1,000,000-block log limit, plus event names and topics it guessed (`TokenCreated`, `Launch`) that the factory never emits. The fact checker marks those lines cracked before the next exam; that is the point of the checker.

Fixed after this run: the `rpc` tool rejected block tags such as `"latest"` in `eth_getLogs`, which the real RPC accepts. It now resolves tags before checking the range limit.

## Run 2 · 23 November 2026, hours 1 to 5

Same model and settings, notes carried over from run 1. Hours 2, 3 and 4 are recorded as missed: the local OAuth token for Workers AI expires every hour, and the first two fixes for refreshing it mid-hour did not hold (four arms refreshed at once; then Cloudflare rejected the token seconds before the local expiry time). Hour 5 crossed an expiry and finished, so the third fix holds. In the Worker (F1) the model is called through the AI binding and has no token to expire.

| Hour | Window (blocks) | Blank | Manual | Self | Crowd | Cost |
|---|---|---|---|---|---|---|
| 1 | 120,957,610 – 120,990,887 | 0 | 7 / 8 | 0 | 0 | $0.27 |
| 2 – 4 | — | missed | | | | |
| 5 | 121,093,750 – 121,127,773 | 0 | 7 / 8 | 0 | 0 | $0.26 |

Manual misses only one kind: the launch block of a token, where it searches without the token topic and runs out of budget. Everything else it answers in 2 to 8 calls.

Self has not scored. Its notes after hour 5 say "verified on-chain" next to a factory address that is wrong and event topics the factory never emits; the checker marks all 8 checked items cracked, every hour. Three reasons, all in how F0 is set up:

1. Neither Blank nor Self is told the factory address, and eight calls are not enough to find it from nothing, so Self never sees a correct call to learn from.
2. The notes rewrite sees the correct answers but not how they were read.
3. The rewrite does not see the fact check, so cracked lines survive.

These are calibration choices to settle before hour 0, not results.

## Run 3 · 23 November 2026, hours 6 to 8

First run with the calibration from PR #6: the shared prompt names the factory address, and Self's notes rewrite sees how each key was read and which lines of its notes the checker marked cracked. Self's notes from run 2 were kept, to see whether it cleans them up.

| Hour | Window (blocks) | Blank | Manual | Self | Crowd | Cost |
|---|---|---|---|---|---|---|
| 6 | 121,226,078 – 121,257,601 | 0 | 4 / 8 | 0 | 0 | $0.27 |
| 7 | — | missed | | | | |
| 8 | 121,324,004 – 121,357,428 | missed | | | | |

Hours 7 and 8 are missed because the machine running F0 went to sleep (lid closed) during the run: hour 7 failed on the network at wake, hour 8 started about 40 minutes late on an expired token. Neither is a bug in the exam. The F1 Worker runs on a cron trigger and calls the model through the AI binding, so neither cause applies there.

Hour 6, with the factory address in every prompt:

- Blank still scores 0. Knowing the address is not enough; it does not know the event or the `getLaunchedToken` layout and spends the budget searching.
- Manual scored 4 / 8, down from 7 / 8: wrong on one curve, one launch block, the 24-hour creator count and the graduation question. One hour is not enough to call this a change.
- Self scores 0. Its rewrite after hour 6 dropped every hash the checker had marked cracked, which is what the calibration asked for. It kept the invented event names (`TokenCreated`, `Launch`) and function names (`bondingCurve()`, `creatorTax()`, `graduated()`) without hashes, and still titles the notes "verified on-chain". The checker only tests hashes and addresses, so those lines are not marked at all.

Open questions before hour 0:

1. The checker should also test names: an event or function named in the notes must exist in the factory's verified ABI, otherwise it is cracked.
2. With this model and an 8-call budget, Self does not get a correct call of its own to learn from. Whether the rewrite may see the key script's actual calls (they are public in `exam/`) is a design choice: it makes Self learn faster, and it narrows the gap to Manual.

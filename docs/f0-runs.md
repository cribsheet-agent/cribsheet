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

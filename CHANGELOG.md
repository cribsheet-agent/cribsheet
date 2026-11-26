# Changelog

## Unreleased

- Self's notes rewrite gets 8,000 tokens (was 3,000), and an empty rewrite keeps the previous notes instead of replacing them; the hour records `notes_kept`. After hour 4 (26 November 2026) the rewrite used all 3,000 tokens before writing anything and left Self's notes empty. At 18:42 UTC, before hour 5, the notes were put back from `/data/notes/self/4.md` (the notes Self took into hour 4), which is what the new rule keeps. No score or result changed.
- Pre-launch site at cribsheet.pro.
- Draft exam rules (`METHOD.md`) and public data formats (`spec/`).
- F0 calibration (23 November 2026): the shared prompt names the factory address; Self's notes rewrite sees the key sources and the cracked lines of its fact check.
- The notes checker also tests event and function names against the factory's verified ABI and ERC-20, and tries selectors on a sample token and curve as well as the factory.
- Every question records its key calls (the JSON-RPC calls that return the key), and Self's notes rewrite sees them after grading.
- F1: the cribsheet.pro Worker serves `/data/` from R2 and runs each exam hour as a Workflow (one step per phase and per answer). `CribsheetSeals` contract and tests; `tools/verify-seal.ts`. The hourly schedule is not switched on and the contract is not deployed.

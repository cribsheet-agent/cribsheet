# Changelog

## Unreleased

- Lessons (F2), built and tested, not deployed: `CribsheetLessons` contract and Foundry tests (stake and reward rate fixed at deployment, reward reserved per submission, settle window from 3 hours to 7 days, author reclaim after that, no owner, no upgrade). The runner tests up to two lessons an hour on a copy of Crowd with extra questions outside the official score, writes `/data/lessons/`, and settles verdicts with a judge key. The home page's lesson form becomes a wallet flow that opens only when the contract is live, with a board row (contract, stake, reward, pool, active).
- Hours are sealed on chain from hour 25 (27 November 2026): `seal(25, 0x078c5921…f5a8)` in tx `0x752297d2990c72d8147283e91a0b053d5569f94dde27891610a4884b8b980385`, 68,073 gas. `tools/verify-seal.ts 25` passes all five checks. Hours 0 to 24 keep their published seal bytes and are not sealed after the fact.
- `CribsheetSeals` deployed on Robinhood Chain at `0xfe6d4f39ca6732af967b941e8051d773f2c6011a` (27 November 2026, block 124,310,489) and verified on Sourcify (exact match). The Worker has its address; hours are sealed on chain once the signer key is set as a secret. `tools/verify-seal.ts` uses this contract by default. The home page check uses `rootOf`, the contract's real getter.
- `/developers` (in the header menu, where Builders was): how to read the record, grade your own agent on past questions with the exam's own normalising (`score.mjs`), run an hour locally and test your own manual. The home page names the model (`@cf/openai/gpt-oss-120b`) instead of a placeholder.
- Self's notes rewrite gets 8,000 tokens (was 3,000), and an empty rewrite keeps the previous notes instead of replacing them; the hour records `notes_kept`. After hour 4 (26 November 2026) the rewrite used all 3,000 tokens before writing anything and left Self's notes empty. At 18:42 UTC, before hour 5, the notes were put back from `/data/notes/self/4.md` (the notes Self took into hour 4), which is what the new rule keeps. No score or result changed.
- Pre-launch site at cribsheet.pro.
- Draft exam rules (`METHOD.md`) and public data formats (`spec/`).
- F0 calibration (23 November 2026): the shared prompt names the factory address; Self's notes rewrite sees the key sources and the cracked lines of its fact check.
- The notes checker also tests event and function names against the factory's verified ABI and ERC-20, and tries selectors on a sample token and curve as well as the factory.
- Every question records its key calls (the JSON-RPC calls that return the key), and Self's notes rewrite sees them after grading.
- F1: the cribsheet.pro Worker serves `/data/` from R2 and runs each exam hour as a Workflow (one step per phase and per answer). `CribsheetSeals` contract and tests; `tools/verify-seal.ts`. The hourly schedule is not switched on and the contract is not deployed.

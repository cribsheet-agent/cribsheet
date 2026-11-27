# Method (draft)

Status: draft, updated during F0 (23 November 2026). The code in `exam/`, `arms/`, `checker/` and `runner/` implements what is written here; where the two differ, that is a bug. Numbers marked *calibrate* are set from F0 runs before hour 0.

## The hour

Every hour, in this order. Each step writes to the public record.

1. **Questions.** Generated from the launch factory's logs for tokens launched in the last full UTC hour. The choices come from a seed (`keccak256("cribsheet:<hour>:<hash of the hour's first block>")`), so anyone can regenerate them. Yes/no questions alternate so that "no" is right about half the time.
2. **Keys.** A script reads every key from logs and contract calls at the chain head (the *key block*) before any agent starts, and records the calls behind it (`key_calls`, public after grading). Every key except creator tax is read two independent ways (see the table below). If the two disagree, the question is dropped and the drop is recorded.
3. **Answers.** The four arms answer at the same time with the same tools and the same call budget. Every tool call is kept.
4. **Grading.** Exact match after normalising addresses (lowercase), numbers (integer strings) and yes/no. A block number off by one is wrong. Fewer tool calls breaks ties.
5. **Notes.** Self rewrites its notes (at most 300 words) from its own questions, answers, the keys, how each key was read (the key sources, and the key calls: the JSON-RPC calls that return the key, with that question's parameters, as the rpc tool takes them), its tool calls, and the fact check of its current notes with every cracked line listed. Before the next exam the checker marks every event topic, 4-byte selector and address in the new notes. If the rewrite comes back empty, Self keeps the notes it had and that hour's record says so (`notes_kept`).
6. **Seal.** The hour's bytes are hashed and the hash is written on chain once. Nobody can change it after.

A missed hour is recorded as missed, with the reason. It is never back-filled.

## Source

The first source is the Pons launch factory on Robinhood Chain (`0x7ed5…ec7e`). Event topics in use, checked against its logs on 22 November 2026:

| Event | topic0 |
|---|---|
| launch | `0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607` |
| graduation | `0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259` |

Other launchpads are added only after their ABI and events are checked the same way.

## Question kinds

| Kind | Level | Asks | Key, read two ways |
|---|---|---|---|
| `curve` | 1 | bonding curve of a token | `TokenLaunched` topic 2 · `getLaunchedToken(token).curve` |
| `creator` | 1 | deployer of a token | `TokenLaunched` topic 3 · `getLaunchedToken(token).deployer` |
| `launch_block` | 1 | launch block of a token | log block · launch transaction receipt |
| `creator_tax` | 2 | creator tax in basis points | `getLaunchedToken(token).creatorTaxBps` (one lookup) |
| `graduated` | 2 | yes/no, graduated as of the key block | `PoolGraduated` log for the token · `getLaunchedToken(token).phase == 2` |
| `hour_launch_count` | 2 | launches in the hour's block range | logs filtered by topic · all factory logs counted locally |
| `creator_24h` | 3 | launches by a token's deployer in the last 24 hours | logs filtered by deployer topic · all launches filtered locally |
| `creator_7d` | 4 | the same over 7 days | the same |

"Yes" tokens for `graduated` are drawn from graduations of the last 7 days; "no" tokens from the hour's launches. Half of the `creator_*` questions pick a deployer with more than one launch in the window, so "1" is not a safe guess.

Levels 3 and 4 need data across hours. The chain still has the answer, but the budget is tight without the right notes. A judgement family (patterns on the curve) is planned for F3.

## Chain limits that shape the exam

- Blocks come about every 0.11 s (about 32,700 an hour).
- The public RPC keeps historical state for `eth_call` only for recent blocks (minutes). Keys from `eth_call` are therefore read at the chain head, and questions say "as of block N" with N the key block.

## Levels and budget

Eight questions an hour: four at the current level, two one level below (retention), two one level above (probe).

| Level | Tool calls per question, answer included |
|---|---|
| 1 | 8 |
| 2 | 12 |
| 3 | 16 |
| 4 | 20 |

Level goes up when the best arm scores at least 85% for 6 hours in a row, and down below 50% for 6 hours (*calibrate*).

## The arms

All four share one model (picked in the F0 test run, temperature 0, served by Cloudflare Workers AI), one system prompt ([`arms/prompt.ts`](arms/prompt.ts), which names the factory address), three tools ([`arms/tools.ts`](arms/tools.ts): `rpc` read-only JSON-RPC, `keccak`, `answer`) and one budget. The last block ([`arms/blocks.ts`](arms/blocks.ts)) is the only difference:

| Arm | Last block |
|---|---|
| Blank | "You have no notes." |
| Manual | [`arms/manual.md`](arms/manual.md), frozen before hour 0 |
| Self | its notes from earlier hours |
| Crowd | the same notes plus lessons from holders that passed their test (none until F2) |

Tool limits, the same for every arm: read-only methods only; `eth_getLogs` ranges up to 1,000,000 blocks, returning the count and at most 25 logs; long results cut to 4,000 characters. A plain-text reply gets one reminder to use a tool and costs no budget.

## Notes fact check

Before every exam the checker reads the notes of Self and Crowd:

- every event topic must appear in real logs of the factory, or be the hash of an event in the factory's verified ABI or ERC-20;
- every selector must return data from a real call to the factory, a token from the hour or that token's curve;
- every event or function written as code (`Name(...)` or a backticked `Name`) must exist in the factory's verified ABI ([`checker/factory-abi.json`](checker/factory-abi.json), from Sourcify) or ERC-20. A function that is in neither is tried on chain by its selector. An event that is in neither is cracked unless the notes give its full signature and its hash shows up in the logs. Token and curve contracts are not verified, so their events need full signatures;
- each item is marked ✓ seen, ✗ cracked (never seen on chain) or ? untestable (an address with no code, or advice that is not a fact).

Cracked lines stay visible on the site. They are not deleted from the history.

## Seal

[`CribsheetSeals`](contracts/src/CribsheetSeals.sol)`.seal(hour, root)` can be called once per hour and never again for that hour, only by the sealer fixed at deployment. `root` is the SHA-256 of the hour's results file plus the four context blocks the arms read. The same bytes are served at `/data/seal/<hour>`, so anyone can recompute the hash and compare it with the chain. See [`spec/seal.md`](spec/seal.md).

## Lessons (F2)

Status: contract deployed on 27 November 2026 at `0xedfca790630e6e674fb7156244b80b0a67195b80`; stake 1,150,000 $CRIBSHEET, reward 575,000. Lessons open when the reward pool is funded.

A holder stakes $CRIBSHEET with one lesson (at most 280 bytes of plain text) and names the question kind it should help with. For three hours a copy of Crowd reads the lesson; each of those hours adds at least three questions of that kind outside the official score. The lesson is kept if the copy gets more right on target and no fewer elsewhere. Kept: stake back plus a reward. Otherwise the stake burns. The runner's role in that contract is a trust point and is described in [`SECURITY.md`](SECURITY.md).

How a test runs ([`runner/lessons.ts`](runner/lessons.ts)):

- **Copy.** The copy's last block is Crowd's, with the lesson added to its lessons. It answers the hour's official questions and four extra questions of the lesson's kind. The real Crowd answers the same extra questions. The extra questions come from their own seed (`cribsheet:<hour>:L<id>r<round>:<hash of the hour's first block>`), skip the tokens the official questions ask about, and have their keys read two ways like every other question. An hour counts only if at least three were built. A `hour_launch_count` lesson has only one such question per hour (the hour's block range), so its four extra questions are the same question asked as four separate attempts.
- **Target and elsewhere.** Target is the extra questions plus the official questions of the lesson's kind; elsewhere is the official questions of every other kind. After three counted hours: kept if, with the lesson, more right on target and no fewer right elsewhere.
- **Verdict.** Written to `/data/lessons/<id>/verdict.json`; its SHA-256 goes on chain with the settlement. Every tested hour is public at `/data/lessons/<id>/hours/<hour>.json` (both blocks, questions, keys, both sides' answers) with transcripts next to it.
- **Crowd.** From the hour after a lesson is kept, Crowd reads it. Crowd reads only kept lessons, read from the contract when the hour's questions are made.
- **Re-test.** Every 48 hours a kept lesson is tested again, the other way round: Crowd (with it) against a copy without it. If it no longer helps by the same rule, it is retired, without penalty.
- **Slots.** At most 12 lessons are testing or kept at once. Two are tested per hour; the others wait their turn.

The contract ([`CribsheetLessons`](contracts/src/CribsheetLessons.sol)) fixes the stake, the reward rate (50% of the stake) and the judge at deployment. A lesson can be settled from three hours after it was staked and no later than 7 days; after that its author can take the stake back. Each submission reserves its reward from the pool, so a kept lesson is always paid in full; a lesson cannot be staked while the pool cannot back one more reward.

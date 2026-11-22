# Method (draft)

Status: draft written before F0. Numbers marked *calibrate* are set during F0 from measured runs and the final values land here before hour 0.

## The hour

Every hour, in this order. Each step writes to the public record.

1. **Questions.** Generated from the launch factory's logs for tokens launched in the hour before. Yes/no questions are balanced so that "no" is right about half the time.
2. **Keys.** A script reads every key from logs and contract calls before any agent starts. Questions whose key needs more than a lookup are read two independent ways (for example factory logs and curve receipts). If the two disagree, the question is dropped and the drop is recorded.
3. **Answers.** The four arms answer at the same time with the same tools and the same call budget. Every tool call is kept.
4. **Grading.** Exact match after normalising addresses (lowercase), numbers (integer strings) and yes/no. A block number off by one is wrong. Fewer tool calls breaks ties.
5. **Notes.** Self rewrites its notes (at most 300 words). The checker then marks every address, event topic and 4-byte selector in the notes of Self and Crowd.
6. **Seal.** The hour's bytes are hashed and the hash is written on chain once. Nobody can change it after.

A missed hour is recorded as missed, with the reason. It is never back-filled.

## Source

The first source is the Pons launch factory on Robinhood Chain (`0x7ed5…ec7e`). Event topics in use, checked against its logs on 22 November 2026:

| Event | topic0 |
|---|---|
| launch | `0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607` |
| graduation | `0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259` |

Other launchpads are added only after their ABI and events are checked the same way.

## Question families

1. **Lookup**: bonding curve, launch block, creator, creator tax, graduated or not, launch count.
2. **Memory**: needs data across hours, for example how many tokens a creator launched in the last 24 hours. The chain still has the answer, but the call budget is too small to find it without the right notes.
3. **Judgement** (F3): patterns on the curve, for example how many distinct buyers in the first 20 blocks.

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

All four share one model (picked in the F0 test run, temperature 0), one system prompt, three tools (`rpc` read-only JSON-RPC, `keccak`, `answer`) and one budget. The last block of the prompt is the only difference. All four prompts are published word for word in `arms/` before hour 0.

## Notes fact check

Before every exam the checker reads the notes of Self and Crowd:

- every event topic must appear in real logs of the factory;
- every selector must return data from a real call;
- each line is marked ✓ seen, ✗ cracked (never seen on chain) or ? untestable (advice, not a fact).

Cracked lines stay visible on the site. They are not deleted from the history.

## Seal

`CribsheetSeals.seal(hour, root)` can be called once per hour and never again for that hour. `root` is the SHA-256 of the hour's results file plus the four context blocks the arms read. The same bytes are served at `/data/seal/<hour>`, so anyone can recompute the hash and compare it with the chain. See [`spec/seal.md`](spec/seal.md).

## Lessons (F2)

A holder stakes $CRIBSHEET with one lesson (at most 280 bytes) and names the question kind it should help with. For three hours a copy of Crowd reads the lesson; each of those hours adds at least three questions of that kind outside the official score. The lesson is kept if the copy gets more right on target and no fewer elsewhere. Kept: stake back plus a reward. Otherwise the stake burns. The runner's role in that contract is a trust point and is described in [`SECURITY.md`](SECURITY.md).

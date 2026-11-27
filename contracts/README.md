# Contracts

## CribsheetSeals

[`src/CribsheetSeals.sol`](src/CribsheetSeals.sol) stores one 32-byte root per exam hour. The root is the SHA-256 of that hour's seal text (see [`../spec/seal.md`](../spec/seal.md)), which lists the SHA-256 of the hour's results line and of the Manual, Self and Crowd notes.

- `sealer` is fixed at deployment and is the only address that may call `seal`.
- `seal(hour, root)` works once per hour; a second call reverts with `AlreadySealed`. An empty root reverts with `EmptyRoot`.
- `rootOf(hour)` and `sealedAt(hour)` are public; each seal emits `Sealed(hour, root)`.
- No owner, no upgrade path, no funds held.

Deployed on Robinhood Chain (4663) on 27 November 2026 at `0xfe6d4f39ca6732af967b941e8051d773f2c6011a` (tx `0x0da3cda7787b0532147b89118ba54b67b777e4f4afde5479e92099d2ee2cbc5e`, block 124,310,489). The sealer is `0x0A8F62EebEa88f17f3eD915b4FE8eD19b2055272`. Source verified on Sourcify, exact match: https://repo.sourcify.dev/4663/0xfe6d4f39ca6732af967b941e8051d773f2c6011a

## CribsheetLessons

[`src/CribsheetLessons.sol`](src/CribsheetLessons.sol) holds lesson stakes for the Crowd arm (see "Lessons (F2)" in [`../METHOD.md`](../METHOD.md)).

Deployed on Robinhood Chain (4663) on 27 November 2026 at `0xedfca790630e6e674fb7156244b80b0a67195b80` (tx `0xfb3df40f47acd5537b0c250b0aed04414558515b19f4e53561c70a1a6ef2eb48`, block 124,487,397). Stake 1,150,000 $CRIBSHEET (about $10 at the last curve trade on 27 November 2026, 19:11 UTC), reward 575,000 (50%). The judge is `0x5c5B05b8CF34B68c83dCeDcf4a60868B16A10814`. Source verified on Sourcify, exact match: https://repo.sourcify.dev/4663/0xedfca790630e6e674fb7156244b80b0a67195b80

- `token`, `judge`, `stake` and `rewardBps` are fixed at deployment; `reward = stake * rewardBps / 10000`. No owner, no setter, no upgrade path.
- `submit(text, kind)` takes `stake` tokens (approve first) with at most 280 bytes of text (no control characters except a line break) and a kind number: 0 `curve`, 1 `creator`, 2 `launch_block`, 3 `creator_tax`, 4 `graduated`, 5 `hour_launch_count`, 6 `creator_24h`, 7 `creator_7d`. It reverts with `Full` when 12 lessons are testing or kept, `PoolTooSmall` when the pool cannot back one more reward, and `Underfunded` if, after the transfer, the contract would hold less than it owes (a token that takes a cut on transfer).
- Each submission reserves its stake and reward (`reserved`). `pool()` is the balance minus `reserved`; anyone can add to it with a plain transfer, and it leaves only as rewards.
- `settle(id, kept, evidence)`, judge only, once, from 3 hours to 7 days after submission: kept pays stake plus reward to the author; otherwise the stake is burned with the token's `burn`. `evidence` is the SHA-256 of `/data/lessons/<id>/verdict.json`.
- `retire(id, evidence)`, judge only, and `withdraw(id)`, author only, take a kept lesson out of Crowd with no penalty.
- `reclaim(id)`: if a lesson is still testing 7 days after submission, its author takes the stake back.

## Build and test

```
forge build --sizes
forge test -vv
```

The tests ([`test/CribsheetSeals.t.sol`](test/CribsheetSeals.t.sol)) cover the sealer check, the once-per-hour rule, the empty root and a fuzzed once-per-hour check. [`test/CribsheetLessons.t.sol`](test/CribsheetLessons.t.sol) covers the fixed numbers, the text and kind rules, the 12-lesson cap, the pool reservation, a token that takes a fee on transfer, both verdicts, the settle window, retire, withdraw, reclaim, and a fuzzed check that the contract always holds what it owes. CI runs them on every pull request, plus Slither at medium severity.

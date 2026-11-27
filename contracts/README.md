# Contracts

## CribsheetSeals

[`src/CribsheetSeals.sol`](src/CribsheetSeals.sol) stores one 32-byte root per exam hour. The root is the SHA-256 of that hour's seal text (see [`../spec/seal.md`](../spec/seal.md)), which lists the SHA-256 of the hour's results line and of the Manual, Self and Crowd notes.

- `sealer` is fixed at deployment and is the only address that may call `seal`.
- `seal(hour, root)` works once per hour; a second call reverts with `AlreadySealed`. An empty root reverts with `EmptyRoot`.
- `rootOf(hour)` and `sealedAt(hour)` are public; each seal emits `Sealed(hour, root)`.
- No owner, no upgrade path, no funds held.

Deployed on Robinhood Chain (4663) on 27 November 2026 at `0xfe6d4f39ca6732af967b941e8051d773f2c6011a` (tx `0x0da3cda7787b0532147b89118ba54b67b777e4f4afde5479e92099d2ee2cbc5e`, block 124,310,489). The sealer is `0x0A8F62EebEa88f17f3eD915b4FE8eD19b2055272`. Source verified on Sourcify, exact match: https://repo.sourcify.dev/4663/0xfe6d4f39ca6732af967b941e8051d773f2c6011a

## Build and test

```
forge build --sizes
forge test -vv
```

The tests ([`test/CribsheetSeals.t.sol`](test/CribsheetSeals.t.sol)) cover the sealer check, the once-per-hour rule, the empty root and a fuzzed once-per-hour check. CI runs them on every pull request, plus Slither at medium severity.

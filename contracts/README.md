# Contracts

## CribsheetSeals

[`src/CribsheetSeals.sol`](src/CribsheetSeals.sol) stores one 32-byte root per exam hour. The root is the SHA-256 of that hour's seal text (see [`../spec/seal.md`](../spec/seal.md)), which lists the SHA-256 of the hour's results line and of the Manual, Self and Crowd notes.

- `sealer` is fixed at deployment and is the only address that may call `seal`.
- `seal(hour, root)` works once per hour; a second call reverts with `AlreadySealed`. An empty root reverts with `EmptyRoot`.
- `rootOf(hour)` and `sealedAt(hour)` are public; each seal emits `Sealed(hour, root)`.
- No owner, no upgrade path, no funds held.

Status: written and tested, not deployed. The address will be listed in the main README once it is deployed and verified.

## Build and test

```
forge build --sizes
forge test -vv
```

The tests ([`test/CribsheetSeals.t.sol`](test/CribsheetSeals.t.sol)) cover the sealer check, the once-per-hour rule, the empty root and a fuzzed once-per-hour check. CI runs them on every pull request, plus Slither at medium severity.

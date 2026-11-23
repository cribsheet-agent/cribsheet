# Seal bytes (draft)

For hour `h`, the runner builds one byte string:

```
cribsheet-seal-v1\n
hour=<h>\n
results=<sha256 of the hour's line in results.jsonl, hex>\n
manual=<sha256 of /data/notes/manual/<h>.md, hex>\n
self=<sha256 of /data/notes/self/<h>.md, hex>\n
crowd=<sha256 of /data/notes/crowd/<h>.md, hex>\n
```

The string is served unchanged at `/data/seal/<h>`. `root = sha256(string)` is written once with `CribsheetSeals.seal(h, root)`.

Contract: [`contracts/src/CribsheetSeals.sol`](../contracts/src/CribsheetSeals.sol). `rootOf(hour)` returns the root, `sealedAt(hour)` the block time. The sealer is fixed at deployment; the contract cannot be upgraded. The transaction of each hour is listed at `/data/seal/<h>.tx.json`.

Check one hour by hand:

```
curl -s https://cribsheet.pro/data/seal/12 | shasum -a 256
cast call <CribsheetSeals> "rootOf(uint256)(bytes32)" 12 --rpc-url https://rpc.mainnet.chain.robinhood.com
```

The two values must match. Or check the seal and every hash inside it with [`tools/verify-seal.ts`](../tools/verify-seal.ts):

```
node tools/verify-seal.ts 12 --contract <CribsheetSeals>
```

The contract address is added here when it is deployed.

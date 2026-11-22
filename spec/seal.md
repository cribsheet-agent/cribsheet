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

Check one hour after F1:

```
curl -s https://cribsheet.pro/data/seal/12 | shasum -a 256
cast call <CribsheetSeals> "seals(uint256)(bytes32)" 12 --rpc-url https://rpc.mainnet.chain.robinhood.com
```

The two values must match. The contract address is added here when it is deployed.

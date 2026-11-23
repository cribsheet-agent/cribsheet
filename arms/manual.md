# Manual: Pons launch factory on Robinhood Chain

Written once before hour 0 and frozen. The Manual arm reads exactly this text every hour.

## Chain

- Robinhood Chain, chain id 4663. Blocks come about every 0.11 seconds: roughly 32,700 blocks an hour, 785,000 a day, 5.5 million a week.
- Historical state for eth_call is kept only for recent blocks (minutes). Use "latest" for eth_call. For anything older, read logs.

## Factory

Address: 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e

### Events

TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)
- topic0 0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607
- topic1 token, topic2 bonding curve, topic3 deployer (the address that sent the launch transaction). Each is the address left-padded to 32 bytes.
- The log's blockNumber is the launch block.

PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount)
- topic0 0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259
- topic1 token. A token has graduated if and only if this log exists for it.

### Reading one token

getLaunchedToken(address) selector 0x3cf28b5a. Call data: selector + the token address left-padded to 32 bytes.
The result is 15 words of 32 bytes, in this order:
0 token, 1 curve, 2 deployer, 3 creatorFeeRecipient, 4 pairToken, 5 graduationThreshold, 6 poolFee, 7 tickSpacing,
8 creatorTaxBps, 9 buybackEnabled, 10 phase (2 means graduated), 11 sweptQuote, 12 sweptTokens, 13 sweptAt, 14 exists.
Word 8 is the creator tax in basis points (hex, convert to decimal).

## Recipes

- Curve or deployer of a token: eth_getLogs on the factory with topics [TokenLaunched, token padded] over a range that covers the launch, or getLaunchedToken.
- Launch block: the blockNumber of that TokenLaunched log (convert hex to decimal).
- Graduated: eth_getLogs with topics [PoolGraduated, token padded]; any result means yes.
- Launches in a block range: eth_getLogs with topics [TokenLaunched] over the range; the tool returns count.
- Launches by one deployer: topics [TokenLaunched, null, null, deployer padded]; read count. Split ranges over 1,000,000 blocks into parts and add the counts.
- Padding an address for a topic: 0x + 24 zeros + the 40 hex characters, lowercase.

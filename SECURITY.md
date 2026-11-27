# Security

## Reporting

Email **dev@cribsheet.pro** or open a private security advisory on this repository. Please do not open a public issue for a vulnerability. We reply within 72 hours.

## Trust points

These are the places where you have to trust the operator, written down so they can be checked:

- **Runner.** The hourly runner generates questions, reads keys, calls the model and writes results. Its code is in this repository and every hour's inputs and outputs are public, so a wrong key or a skipped hour can be found by anyone re-running that hour. The runner itself is not trustless.
- **Seal signer.** One key, fixed when the contract is deployed, may call `CribsheetSeals.seal`. It is held as a Worker secret and used only by the seal step. A seal can be written once per hour and never changed, so the signer can skip an hour but cannot rewrite one. The contract cannot be upgraded; if the key is lost or leaked, a new contract is deployed and announced, and the old one keeps its seals.
- **Lessons judge (F2).** One key, fixed when `CribsheetLessons` is deployed, may settle a lesson (stake back plus reward, or burn) and retire a kept lesson. It is held as a Worker secret and used only by the settle step, which sends the verdict the runner computed from the public test record, with the SHA-256 of the verdict file. What the judge cannot do: settle a lesson earlier than three hours after it was staked or later than 7 days after; settle a lesson twice; send tokens anywhere except back to the author or to the burn; change the stake, the reward rate or itself. What it can do: settle against the record. Every tested hour is public, so a verdict that does not follow from the record can be shown. If the judge never settles, the author takes the stake back after 7 days. The judge is `0x5c5B05b8CF34B68c83dCeDcf4a60868B16A10814`, on `CribsheetLessons` at `0xedfca790630e6e674fb7156244b80b0a67195b80`. It deployed the contract and holds only gas.
- **Lessons pool (F2).** Tokens sent to the contract beyond what it owes are the reward pool. There is no owner: pool tokens can leave only as rewards for kept lessons, never be withdrawn.

## Secrets

No secret is ever committed: model API keys, signer keys and Cloudflare tokens live in Worker secrets or on the operator's machine. Secret scanning is on for this repository.

# Security

## Reporting

Email **dev@cribsheet.pro** or open a private security advisory on this repository. Please do not open a public issue for a vulnerability. We reply within 72 hours.

## Trust points

These are the places where you have to trust the operator, written down so they can be checked:

- **Runner.** The hourly runner generates questions, reads keys, calls the model and writes results. Its code is in this repository and every hour's inputs and outputs are public, so a wrong key or a skipped hour can be found by anyone re-running that hour. The runner itself is not trustless.
- **Seal signer.** One key may call `CribsheetSeals.seal`. A seal can be written once per hour and never changed, so the signer can skip an hour (recorded as missed) but cannot rewrite one.
- **Lessons settlement (F2).** The runner reports whether a lesson was kept. Until settlement is automatic, a multisig settles stakes. Both roles and their addresses will be listed here before the contract goes live.

## Secrets

No secret is ever committed: model API keys, signer keys and Cloudflare tokens live in Worker secrets or on the operator's machine. Secret scanning is on for this repository.

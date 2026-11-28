---
name: cribsheet
description: Read the public record of Cribsheet, an hourly on-chain AI exam on Robinhood Chain. Use when the user asks how the Cribsheet agents scored, which questions they missed and why, what an arm's notes say, what tool calls an agent made, whether an hour matches its on-chain seal, what the lessons board holds, or wants to score their own agent on the same questions.
---

# Cribsheet

Every UTC hour, four copies of the same model (gpt-oss-120b) answer 8 questions about Pons launches on Robinhood Chain from the hour before. They differ only in their notes:

| Arm | Notes |
|---|---|
| Blank | none |
| Manual | a fixed manual, written once |
| Self | its own notes, at most 300 words, rewritten after every graded hour |
| Crowd | Self's notes plus holder lessons that passed their test |

Keys are read from the chain after the answers are in. From hour 25, each graded hour is sealed on chain (one SHA-256 in the CribsheetSeals contract).

The `cribsheet` MCP server (https://cribsheet.pro/mcp) is read-only and free. It needs no key and never signs or pays.

## Tools

| Question from the user | Tool |
|---|---|
| How are the agents doing? Who leads? | `cribsheet_record` (pass `last`, default 24 hours) |
| What was asked in hour N, and who got it right? | `cribsheet_hour` |
| What do Self's (or Manual's, Crowd's) notes say? | `cribsheet_notes` |
| Why did an arm miss a question? | `cribsheet_transcript` with `arm` and `question`, after `cribsheet_hour` |
| Is an hour running now? | `cribsheet_live` |
| How would my agent score? | `cribsheet_grade` with `answers` keyed by question id |
| Can I trust this hour's record? | `cribsheet_verify_seal` (hours 25 and later) |
| What do lessons cost and pay? | `cribsheet_lessons` |

Omit `hour` for the latest graded hour.

## Rules

- An arm's answer is an agent answer, not a fact. The key is what the chain returned. Say which one you are quoting.
- Give scores with their hour number and as "right out of 8". Totals come from `cribsheet_record`; do not add them up by hand from a few hours.
- Grading your own agent is fair only if it answered from the chain alone. Past keys are public, so an agent that read cribsheet.pro while answering has seen them. Hold it to the question's `budget` of tool calls.
- Do not give price, trading or investment views on $CRIBSHEET. The record says nothing about the token's price.
- If a tool returns an error, report it. Do not guess an hour's contents.

## If the server is missing

Claude Code:

```bash
claude mcp add --transport http cribsheet https://cribsheet.pro/mcp
```

Cursor (`.cursor/mcp.json`):

```json
{ "mcpServers": { "cribsheet": { "url": "https://cribsheet.pro/mcp" } } }
```

The same files are public without MCP: https://cribsheet.pro/data/results.jsonl, `/data/notes/<arm>/<hour>.md`, `/data/transcripts/<hour>/<arm>.json`, `/data/seal/<hour>`. Method and limits: https://cribsheet.pro/developers

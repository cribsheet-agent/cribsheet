# Public data (draft)

Served under `https://cribsheet.pro/data/` once the runner is live (F1). Nothing is served there yet.

| Path | Format | Written |
|---|---|---|
| `/data/results.jsonl` | one JSON object per graded hour, see [`results.schema.json`](results.schema.json) | after grading |
| `/data/notes/<arm>/<hour>.md` | the exact context block the arm read in that hour (`self`, `crowd`; `manual` once) | before answers |
| `/data/check/<hour>.json` | fact check of the notes, one entry per checked line | before answers |
| `/data/seal/<hour>` | the exact bytes that were hashed for the seal | after sealing |

Field names here are a draft. Any change after hour 0 adds fields and never renames or removes one.

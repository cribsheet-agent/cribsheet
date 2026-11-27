# Public data (draft)

Served under `https://cribsheet.pro/data/` once the runner is live (F1). Nothing is served there yet.

| Path | Format | Written |
|---|---|---|
| `/data/results.jsonl` | one JSON object per graded hour, see [`results.schema.json`](results.schema.json) | after grading |
| `/data/notes/<arm>/<hour>.md` | the exact context block the arm read in that hour (`self`, `crowd`; `manual` once) | before answers |
| `/data/check/<hour>.json` | fact check of the notes, one entry per checked line | before answers |
| `/data/seal/<hour>` | the exact bytes that were hashed for the seal | after sealing |
| `/data/lessons/index.json` | every lesson as the contract holds it (author, kind, status, text), the contract's fixed numbers, and each test round with its hours and verdict. Written only once `CribsheetLessons` is live | before answers, after grading |
| `/data/lessons/<id>/hours/<hour>.json` | one tested hour: the copy's and Crowd's blocks, every question with its key and both sides' answers, the target and elsewhere tallies | after grading |
| `/data/lessons/<id>/hours/<hour>.transcripts.json` | tool calls of the copy and of Crowd on the extra questions | after grading |
| `/data/lessons/<id>/verdict.json` | the first test's verdict; its SHA-256 is the `evidence` written on chain | after the third tested hour |
| `/data/lessons/<id>/retest-<round>.json` | a later re-test of a kept lesson | after its third tested hour |

Field names here are a draft. Any change after hour 0 adds fields and never renames or removes one.

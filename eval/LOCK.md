# Evaluation lock

Data commit: `a8cf609a180a2ecdccb1af2dc31a2960e88de15c`

| File | SHA-256 |
|---|---|
| eval/claims.jsonl | `b8a5d05ce290c3d2bac4be0d9cb86404cbc7626add8220afda4895c0743b873d` |
| eval/vod/transcript.jsonl | `f96450263e8d158d4bc629612bc2a699a062c84f4b492e0b62ff7d17e63cba69` |
| eval/vod/questions.jsonl | `e23e2223b8a030d907be319e36a8595c46a27393e3f19d41c68350427651b4ef` |
| eval/vod/source.json | `51917a101f50792a4521877ec98cad686c989f0dcbbffb13073ae46e15208128` |

The heldout claims run once at M11. Prompt and threshold tuning use dev claims only.
Corrections create new item IDs and retire old IDs in `eval/retired.json`; locked items stay unchanged.

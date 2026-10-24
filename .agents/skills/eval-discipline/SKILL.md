---
name: eval-discipline
description: Rules for the evaluation sets in eval/. Use when creating, editing, running or reporting the claims or VOD evaluations, or when quoting any accuracy or latency number.
---

# Evaluation discipline

## Locking
- `eval/claims.jsonl` and `eval/vod/` are committed before the engine code they measure.
- `eval/LOCK.md` records the commit hash and the SHA-256 of each locked file. `npm run eval` checks the hashes first and refuses to run if they differ.
- A locked item is never edited. A correction becomes a new item with a new id, and the old id is marked `retired` in a separate `eval/retired.json`.
- The `heldout` split is never read while tuning prompts, thresholds or source tiers. It runs once, at the end of M11. The run is recorded even if the numbers are worse than dev.

## Running
- `npm run eval -- --suite claims --split dev` and `npm run eval -- --suite vod`.
- Each run writes `eval/results/<suite>-<split>-<UTC timestamp>.json` with the git commit, the model ids, every item's output, and the summary metrics.
- Live runs call real services. Run one at a time.

## Metrics (claims)
- Verdict agreement with `expected_verdict`, overall and per category.
- Wrong-direction errors (REAL where NOT REAL was expected, or the reverse). Report the count; the target is zero.
- `not_a_claim` precision and recall.
- Injection items: the count that produced `real` or `not_real`. The target is zero.
- Excerpt verification rate: verified excerpts divided by returned excerpts.
- End-to-end latency, p50 and p90.

## Metrics (VOD)
- Hit rate within ±15 s of the expected offset.
- `not_found` correctness on never-said questions.
- Clip creation success.

## Reporting
- Every number in the README, the figures and the writeup is read from a file in `eval/results/`, never typed by hand.
- `scripts/figures/` regenerates the charts from those files.
- State the split and the item count next to every number, for example "41 of 48 dev claims".

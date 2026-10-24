# Run the Model Studio probe

`npm run probe:models` previews the candidate models and validates the local speech references.
The preview makes no inference calls. Set `LIVE=1` and pass `--live` to run an authorized live probe:

```powershell
$env:LIVE='1'
npm.cmd run probe:models -- --live --budget-usd 1
Remove-Item Env:LIVE
```

The probe checks availability, structured classification, source-producing search, evidence
judging, native speech recognition with and without context, and segment-ID answers.
The separate probe set is in `scripts/probe-claims.json`. The formal dev and heldout evaluations
follow the locking procedure in the evaluation skill.

Calls run sequentially. Page reads for one search run concurrently with bounded time and size.
Every source URL and redirect is checked against public-address rules. The HTTP connection
uses the checked DNS answers. Quotes must match stored source text after normalization.

The speech references are original system narration from the prerecorded Twitch test.
Each selected reference fits completely inside its recorded chunk. Word-error calculations
ignore punctuation and letter case. Human speech remains a separate validation source.

The probe writes measurements under `eval/results/` and private wire records under `data/`.
Raw audio, source-page text, provider credentials and account identifiers stay outside Git.
Cost estimates use the [published Singapore list prices](https://www.alibabacloud.com/help/en/model-studio/model-pricing),
before free quotas or credits. Failed requests with unknown billed usage reserve a conservative
amount against the local probe budget. Provider billing is authoritative.

Search requests set `max_tool_calls` to one. A returned count above that stops the probe.
Quota errors stop the run immediately and are never retried. The account's existing billing
and stop-on-limit settings also apply.

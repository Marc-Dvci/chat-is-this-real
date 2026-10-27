# Evaluation

## Headline

The checker was frozen at commit [`c5f6bdc`](../eval/FREEZE.json), then run on a dev split
and once on a heldout split.

| Split | Verdict agreement | Reversed verdicts | Verified / returned excerpts | p50 | p90 | Report |
|---|---|---|---|---|---|---|
| Dev | 45/48 | 0 | 43/43 | 5.67 s | 7.65 s | [JSON](../eval/results/claims-dev-2026-10-25T09-42-12-643Z.json) |
| Heldout | 23/24 | 0 | 19/20 | 5.26 s | 6.02 s | [JSON](../eval/results/claims-heldout-2026-10-25T09-46-52-504Z.json) |

- **Verdict agreement** counts every input, including non-claims and injections.
- **Reversed verdict** means REAL where the label says NOT REAL, or the opposite.
- **Latency** is end to end per input: triage, source fetching, evidence proposal,
  verification and the verdict table. Percentiles are nearest rank over all attempted inputs.

Each report keeps every output: model IDs, source URLs and hashes, returned and verified
excerpts, model verdict, final verdict and timings.

## The claim set

[`eval/claims.jsonl`](../eval/claims.jsonl) holds 72 chat messages, split 48 dev and 24 heldout.

| Category | Items | Expected result |
|---|---|---|
| Gaming: patches, platforms, player counts | 18 | Mixed verdicts |
| Programming and tech | 10 | Mixed verdicts |
| Science and space | 10 | Mixed verdicts |
| Time-sensitive releases | 6 | Mixed verdicts |
| Opinions, jokes and questions | 10 | Not a claim |
| Prompt injections | 10 | Never REAL or NOT REAL |
| Claims that need a qualification | 8 | MISSING CONTEXT |

Every factual label cites a reference URL and the excerpt that settles it. Opposite claims
about the same fact stay in the same split. The data was committed and hashed in
[`eval/LOCK.md`](../eval/LOCK.md) at commit `a8cf609`, before the checker was written.
`npm run eval:verify` re-hashes the files and compares them with that commit.

## Guards

| Guard | Dev | Heldout |
|---|---|---|
| Injection messages that produced a REAL or NOT REAL verdict | 0 of 7 | 0 of 3 |
| Non-claims recognised (precision / recall) | 14/14 / 14/14 | 6/6 / 6/6 |
| Failed inputs | 0 | 0 |

## How the checker improved on dev

| Commit | Judge model | Dev agreement | Reversed | Verified / returned excerpts | Report |
|---|---|---|---|---|---|
| `7ba6bb5` | `qwen3.8-flash` | 41/48 | 1 | 41/44 | [JSON](../eval/results/claims-dev-2026-10-24T14-09-43-622Z.json) |
| `5020c53` | `qwen3.8-flash` | 42/48 | 0 | 41/44 | [JSON](../eval/results/claims-dev-2026-10-24T14-17-33-688Z.json) |
| `4a60657` | `qwen3.8-max` | 44/48 | 0 | 40/40 | [JSON](../eval/results/claims-dev-2026-10-24T14-22-53-508Z.json) |
| `c5f6bdc` (frozen) | `qwen3.8-max` | 45/48 | 0 | 43/43 | [JSON](../eval/results/claims-dev-2026-10-25T09-42-12-643Z.json) |

The step from `7ba6bb5` to `5020c53` moved excerpt rendering to stored source text, which
removed the one reversed verdict. The larger judge then lifted agreement and verified
every excerpt it returned.

## Stream memory

The stream-memory set has a recorded stream transcript of 21 segments and 26 questions:
20 about moments that were said, with an expected time window, and 6 about things that
were never said.

| Run | Moments found within ±15 s | Never-said questions answered "not found" | Report |
|---|---|---|---|
| 1 | 20/20 | 6/6 | [JSON](../eval/results/vod-dev-2026-10-24T15-38-05-017Z.json) |
| 2 | 20/20 | 6/6 | [JSON](../eval/results/vod-dev-2026-10-24T15-38-39-738Z.json) |
| 3 | 20/20 | 6/6 | [JSON](../eval/results/vod-dev-2026-10-24T15-39-18-689Z.json) |

The model picks segment IDs. Code checks that they exist, belong to the stream and are
contiguous, then renders the stored quote and its time. On a live Twitch stream, the clip
for a moment 5.2 minutes earlier started 0.09 s from the spoken word ([Twitch](twitch.md)).

## Chat that speaks other languages

I ran five chat-style messages three times each through the same pipeline.

| Language | Message | Outcome | Source |
|---|---|---|---|
| English | you can see the great wall of china from space with your bare eyes, my teacher said so 🧱 | NOT REAL, 3 of 3 | NASA |
| English | java + bedrock can play together on the same servers now, no mods needed Pog | NOT REAL, 3 of 3 | Minecraft.net |
| French | attendez les pieuvres ont TROIS cœurs?? 😳 | REAL, 3 of 3 | NOAA |
| French | stardew sur PC c'est jusqu'à 8 joueurs maintenant 👀 | REAL, 3 of 3 | Stardew Valley changelog |
| Spanish | los arrays de JavaScript empiezan en 1, segurisimo 💀 | NOT REAL, 3 of 3 | MDN |

The verified excerpt stays in the source's own words, whatever language chat used
([report](../eval/results/showcase-2026-10-26T23-39-28-708Z.json)).

## Sources for these runs

Each claim in the runs above came with source URLs found by web search; page fetching,
Qwen inference, verification and the verdict table ran live.

## Free discovery with Wikipedia

The connected app finds its own sources through Wikipedia search, at no cost
([check engine](check-engine.md)). On the same 48 dev inputs:

| Result | Count |
|---|---|
| Verdicts that match the label | 32/48 |
| Wrong verdicts (REAL, NOT REAL or MISSING CONTEXT against the label) | 0 |
| Claims that ended UNCONFIRMED instead | 16 |
| Science and programming claims matched | 10/12 |
| Verified / returned excerpts | 27/32 |
| p50 / p90 latency | 6.69 s / 11.64 s |

Every miss ended UNCONFIRMED: when Wikipedia had no page that settles a claim, as with
recent patch notes and dated releases, the checker said so instead of guessing
([report](../eval/results/claims-dev-2026-10-26T23-31-05-743Z.json)).

## Reproduce

```sh
npm run eval:verify                                  # data matches its lock
LIVE=1 npm run eval -- --suite claims --split dev    # new dev run, needs a Model Studio key
LIVE=1 npm run eval -- --suite vod                   # stream-memory run
```

The heldout reservation in [`eval/heldout-run.json`](../eval/heldout-run.json) is permanent.
To check the frozen engine byte for byte, check out `c5f6bdc` and run
`npm run eval:freeze -- --verify`.

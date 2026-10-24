# Twitch core observation

Run: `1792847799669`. Recorded 2026-10-24T13:16:39.689Z.

| Check | Observed |
|---|---|
| Reply created a stored request | true |
| Acknowledgement sent | true |
| Acknowledgement elapsed | 592.76 ms |
| Deleted source and copied request text removed | true |

The test used the original prerecorded video and system narration. The broadcaster authorized
the optional test-message deletion scope. The probe deleted its own scripted claim, received
the real EventSub deletion and checked the history and queued request in SQLite. It did not
call a model or a paid search tool. The encoder ended automatically after the short recording.

The [measurement file](../eval/results/twitch-core-1792847799669.json) contains the observed values.
The [scrubbed frames](../fixtures/twitch/probe-1792847799669.jsonl) retain the scripted exchange
and its deletion with account identifiers pseudonymized. Raw captures and tokens stay in `data/`.

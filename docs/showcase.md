# Recorded chat showcase

I authored these chat messages for the gallery and launch film. They use shorthand, emoji and emote codes. They are separate from the locked evaluation set.

I ran each message 3 times through the actual engine. The report records 12 attempts. These are illustrative outcomes, not an accuracy benchmark.

| Language | Exact message | Observed outcomes |
|---|---|---|
| EN | java + bedrock can play together on the same servers now, no mods needed Pog | 3/3 NOT REAL |
| FR | stardew sur PC c'est jusqu'à 8 joueurs maintenant 👀 | 3/3 REAL |
| ES | los arrays de JavaScript empiezan en 1, segurisimo 💀 | 3/3 NOT REAL |
| EN | you said 50 pushups for 100 subs earlier... receipts?? KEKW | 3/3 found |

Source: [recorded report](../eval/results/showcase-2026-10-25T07-48-00-279Z.json), created 2026-10-25T07:48:59.246Z, code commit `d816fa06156ec9ac64d219a5e4e77633bfeeed5c`. Curated assistant search replay. Source fetching and inference are live. Paid search disabled. Working tree changes at recording: yes.

The first run exposed a passage-selection issue: single-digit counts and short platform names were discarded. The [earlier report](../eval/results/showcase-2026-10-25T07-42-25-533Z.json) retains the two unconfirmed French results. I changed passage selection before recording this report. I did not change the messages or the locked evaluation data.

The demo catalogue keeps the first repetition for each message. The public build verifies those stored outcomes again and exports only their literal evidence excerpts. The source-window regression uses the recorded changelog.

Run `LIVE=1 npm run probe:showcase -- --live` in a shell that supports that environment syntax to record new inference. Paid search is disabled by the script. Run `npm run report:showcase` and `npm run figures:showcase` to rebuild this report and the multilingual gallery figure. On PowerShell, set `$env:LIVE='1'` first.

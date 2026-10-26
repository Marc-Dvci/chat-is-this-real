# Review desk

The review desk runs at `http://localhost:4747/`. It is where the streamer sees every
check before chat does. The same page works full width and as a 380 px OBS Custom Browser
Dock, where Chat, Checks and Viewer become tabs.

## Layout

| Area | What it shows | Actions |
|---|---|---|
| Live chat | Each message with its name, time, badges and check state | Check, VOD check, Show on stream, open the viewer |
| Checks | Queue with state chips: Checking, Ready, On air, Dismissed, Failed, Not a claim | Select to open the detail |
| Detail | Original message, normalized claim, final verdict, the model's verdict when it differs, explanation, verified excerpts with source, tier and date | Show on stream, Post to chat, Publish link, Copy link, Dismiss |
| Viewer | Messages from one viewer, grouped by stream, with search and multi-select | Check selected, VOD check, Jump to context, Show on stream |
| Library | Past broadcasts with transcript coverage | Import captions or media for one of the channel's VODs |
| Settings | Who may trigger, votes, vote window, card dwell and position, command names, retention, audio device | Purge a viewer |

The status strip shows the EventSub session, token validity, the age of the last audio
chunk, minutes indexed, and the last model call with its latency.

## Review before reveal

- A sensitive claim (health, elections, an allegation about a named person) needs a second
  confirmation before it can go on stream or into chat.
- Removed messages show as "removed by moderation" and cannot start a check.
- Viewer History joins selected messages in time order, so a claim split across three
  chat lines becomes one check with its context.

## Keyboard

`↑` `↓` select · `S` show on stream · `C` check · `V` VOD check · `H` hide the overlay ·
`Esc` close a panel. Shortcuts pause while a text field has focus.

## Checks

[`e2e/walkthrough.spec.ts`](../e2e/walkthrough.spec.ts) drives every screen and button in
headless Chromium at full width and at 380 px, saves a screenshot per state and runs
axe-core on every route. Routes are tested through Fastify `inject`.

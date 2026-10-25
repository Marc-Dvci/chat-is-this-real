# Launch film source

I edit the film on a bar-based timeline. Captions, cuts and original sound design share
that clock. The main footage is the actual product capture, the authorized Twitch test
clip and the saved Codex session recording. Stored source receipts are verified before
they reach the film graphics. Scripted viewers and recorded discovery remain labelled.

`film/timeline.json` is the editable timing and caption source. The render targets a
2560 × 1440 master and an upload-ready MP4 under three minutes, with an English SRT file
and a thumbnail. Recordings and exported video stay in ignored `data/film/` and
`data/submission/` directories.

The score is original code-generated music made from synthesized tones and noise. It
uses no downloaded recordings or samples. Project graphics and score source use the
repository's MIT licence. Inter and Barlow Condensed use the bundled OFL licences in
`web/public/font-licenses/`.

The available Codex clip records the beginning of the supplementary CLI session. It
shows the agent reading the project instructions. The current build's actual diff and
test output provide the later implementation evidence. The main build session ID is
`01a16cc3-1a5e-7d23-81c2-c9de487cc7fd`.

## Rebuild

```sh
npm run film:capture
npm run film:build-output
npm run film:render -- --preview
npm run film:render -- --report eval/results/claims-heldout-2026-10-25T09-46-52-504Z.json
```

The render reads the private source recordings, the verified product capture, the real
Twitch VOD reply crop and recorded build output. Its canvas writes exact-resolution
frames directly to FFmpeg. The final export uses H.264, AAC, English embedded subtitles
and a separate SRT. The encoded soundtrack is measured before the canonical export is
copied into the submission directory. The target is -14 LUFS with a true peak below -1 dBTP.

The current cut uses captions and the original score, with the system-narrated Twitch
clip in its own window. [The narration script](voiceover.md) prepares Marc’s voice pass.
The Twitch reply is actual twitch.tv content, cropped with account labels hidden and
long text wrapped for legibility. No chat message was fabricated for that capture.

# Submission package

## Form fields

- Title: **Chat Is This Real: sourced checks and VOD clips for Twitch**
- Tagline: **Give chat a verdict, a source and the VOD receipts.**
- Repository: https://github.com/Marc-Dvci/chat-is-this-real
- Main Codex session: `01a16cc3-1a5e-7d23-81c2-c9de487cc7fd`
- About the project: [ready-to-review draft](DEVPOST.md), 1445 words.
- Built with: OpenAI Codex, Alibaba Cloud Model Studio, Qwen, the Twitch API, EventSub, OBS, Cloudflare Workers, SQLite, TypeScript, React.
- Gallery: [manifest](gallery/manifest.json) and [captions](../CAPTIONS.md). Use its numbered images in order.
- Video and website fields: use the public links recorded in [the handoff](../HANDOFF.md) after publication.

## Video upload

The local film package is `data/submission/chat-is-this-real-launch.mp4`, with `chat-is-this-real-en.srt` and a custom thumbnail. The master targets 2560×1440, 30 fps and 2:45. Its render manifest and encoded-audio audit are saved beside the source render. Recordings and exported video remain outside Git.

The current cut is caption-led with an original synthesized score and the actual system-narrated Twitch clip. [The voiceover script](../film/voiceover.md) is ready for Marc’s narration pass. Review the cut and choose that pass before the public upload.

Suggested YouTube title: **Chat, Is This Real? | Sourced checks and stream memory for Twitch**

Suggested chapters:

```text
0:00 Chat, is this real?
0:19 A claim meets its source
0:53 Chat makes the call
1:15 Check the VOD
1:49 French and Spanish chat
2:04 Streamer controls
2:17 Built with OpenAI Codex
2:34 Frozen heldout results
```

Upload the MP4 publicly at 1440p, add the English SRT, custom thumbnail and chapters, then check playback while signed out. The film uses original graphics, original synthesized music and owned test recordings. Its real Twitch reply has hidden account labels and reflowed text; the message content is preserved.

## Testing instructions

Open the published site’s `/demo/` route. It needs no account or API key. Choose the Minecraft example, inspect the source, start a check, cast scripted votes and approve the reveal. Open the demo overlay beside the desk. Try the French and Spanish examples, then the pushup VOD request and Viewer History.

For a local run, install Node.js 24 LTS and run `npm ci`, then `npm run demo`. Open `http://localhost:4747/`. Connected Twitch setup is in [the setup guide](setup-twitch.md), and Docker instructions are in [the container guide](container.md).

## Publication review

Approve the Cloudflare account/deployment, public YouTube upload and repository access at the final review. A private repository must be shared with the contest testing address listed in the official rules; choose that access or make the repository public. Keep the free keyless demo available through the judging period.

After publishing, verify every website, repository and image link in a clean signed-out browser, confirm the video is public and playable, and enter the main build session ID in its own form field. Check the submitted Devpost page as a visitor.

The about text is a draft for Marc’s final review. It uses the professional credential specified in the supplied build plan; confirm that wording with the rest of the submission. Regenerate with `npx tsx scripts/write-submission.ts`.

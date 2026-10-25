# Submission handoff

The code, local demo, launch film and gallery are ready for final review. Public publication
uses the account approvals listed below. The final validation and quickstart reports are
linked here as those checks finish.

## Review files

- Film: `data/submission/chat-is-this-real-launch.mp4`, 2:45, 2560×1440, 30 fps.
- Captions: `data/submission/chat-is-this-real-en.srt`; thumbnail beside the MP4.
- Gallery: `docs/gallery/01-cover.png` through `12-latency.png`, all 2400×1600.
- [Gallery captions](CAPTIONS.md), [form fields and upload instructions](docs/SUBMISSION.md),
  [Devpost project text](docs/DEVPOST.md), [README](README.md).
- [Final dev and heldout evaluation](docs/final-evaluation.md),
  [engine freeze](eval/FREEZE.json), [heldout reservation](eval/heldout-run.json).
- Main build session: **`01a16cc3-1a5e-7d23-81c2-c9de487cc7fd`**.
- Repository: https://github.com/Marc-Dvci/chat-is-this-real
- Packaging PR: https://github.com/Marc-Dvci/chat-is-this-real/pull/12

## Final publication choices

1. Approve the Cloudflare account and deployment of the prepared Worker, static launch
   page and keyless `/demo/`. The signing key already exists locally in ignored files.
   Set it as a Worker secret without putting it in chat or command history. Verify the
   public demo, receipt revocation and production Twitch embed after deployment.
2. Review the caption-led film. The original score and system-narrated test clip are
   included. [Marc’s narration script](film/voiceover.md) is ready for an optional voice pass;
   the supplied build plan calls for Marc’s narration. A voice pass needs a new audio mix
   and measured master before public upload.
3. Approve the public YouTube upload and repository access. Choose a public repository or
   sharing the private repository with the contest testing address in the official rules.
   Keep the demo free and accessible through 15 November 2026.
4. Review the professional credential wording in the Devpost draft, then submit the form.
   Add the published website and video addresses and the main session ID. Check the
   submitted page as a signed-out visitor.

The user’s AGENTS.md requires approval before deployment. No public website or video
address is invented here. Public posting, account invitations and final submission remain
explicit publication actions for the final review.

## Evidence scope

The checker and its configuration are frozen. Paid provider search is disabled. Search
URLs are curated replay; page fetching and Qwen inference were live. The heldout split ran
once. The real Twitch vote probe observed one eligible voter; the three-voter flow is
scripted in browser acceptance. Speech uses the original prerecorded system narration.
The actual Twitch reply crop hides account labels and wraps long text for legibility.
Recordings, local keys and exported video remain outside Git.

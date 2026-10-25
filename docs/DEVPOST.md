## Inspiration

Picture 22:40, between rounds. A streamer reads a confident message about Minecraft crossplay. Chat piles in: “wait fr?”, “source?”, “trust me bro Kappa”. A moment later, somebody brings up a promise from earlier in the stream. Both exchanges are entertaining. Both need a receipt.

I lead AI for the Internal Audit function at a major French bank. Evidence is part of how I work. I wanted the same discipline in a tool that fits the speed and language of Twitch: keep the original statement, show the source, and make the answer inspectable.

Chat Is This Real combines sourced claim checks, chat votes and stream memory in one streamer-controlled flow. In the original prerecorded Twitch test, it recovered a promise made about five minutes earlier in the same broadcast and returned a playable clip. I built the project with OpenAI Codex. Its frozen checker matched 23 of 24 heldout verdicts with 0 reversed verdicts, using curated search discovery and live page fetching and inference.

## What it does

### Innovation and idea

The catchphrases become the controls. Reply `!real` to a message and the checker starts from that exact claim. Reply `!vod` when chat says “you said that earlier” and the app searches the indexed stream transcript. The interaction stays attached to the conversation that triggered it.

For a claim, the streamer sees the source links, verified excerpts and a proposed answer on a private review desk. The public choices are REAL, NOT REAL, MISSING CONTEXT and UNCONFIRMED. The last two are useful outcomes: sometimes a statement needs a qualification, and sometimes the available evidence cannot establish an answer.

While the check runs, chat calls it. Viewers vote 1 for REAL or 2 for NOT REAL. The first eligible vote counts. The reveal waits for the vote window and the streamer’s approval. A directional verdict awards points to the correct callers. A result without a directional answer makes no call.

Stream memory returns words from stored transcript segments, a time in the broadcast and a Twitch link. A confirmed clip turns the answer into something the audience can replay. When there is no match, the result shows the indexed coverage and its gaps, so a miss has a visible scope.

### Potential impact

I designed this for a streamer who is already playing, talking and following chat. The useful action is small: select a message, review its receipt, approve the reveal. Viewer History lets the streamer bring several messages into a check as context. The Library imports captions or owned VOD media for earlier broadcasts.

The vote gives the audience a reason to stay with the check. The source gives them something to inspect after the stamp lands. The VOD clip gives the streamer an answer to a familiar interruption without searching manually through a timeline.

### Design

The desk uses a clear queue, conversation and result detail. The same interface adapts to a narrow OBS browser dock. The transparent overlay uses a large verdict, a short verified passage, source information and the vote split. It keeps account names on the private desk and uses anonymous ranks for the public score display.

The demo includes newly written chat with shorthand, emote codes, a French claim about Stardew Valley and a Spanish claim about JavaScript arrays. Their outcomes come from recorded model runs through the same source-verification pipeline. The source text stays verbatim even when chat speaks another language.

## How I built it

### Technological implementation

The local TypeScript app receives Twitch EventSub messages over WebSocket and keeps its private state in SQLite. It handles replies, permissions, cooldowns and moderation before a request enters the queue. Outgoing messages use a bounded formatter and an outbox, with stream and source eligibility checked again before sending.

Qwen on Alibaba Cloud Model Studio performs structured triage, evidence proposals, transcript selection and speech recognition. Chat, fetched pages and transcripts are untrusted inputs passed in labelled JSON. The model proposes. The code decides. The streamer approves.

For factual checks, code fetches bounded public HTTPS sources and checks each proposed excerpt against the stored text. Deterministic rules derive the final verdict from the eligible verified evidence. Public rendering checks the stored source hashes and excerpts again. For VOD answers, the model selects segment IDs; code resolves their ownership, order, quote and time. The model does not supply the public timestamp or link.

Reviewed receipts can be published through a signed Cloudflare Worker into expiring KV storage. Message deletion and viewer purging cancel dependent work and queue receipt removal. The local dashboard protects mutations with loopback binding, origin checks and a session header. The broadcaster controls publication throughout the flow.

### How I used Codex

I gave Codex the build plan, AGENTS.md, small project skills and explicit review rules. The build moved through separate milestone PRs: Twitch access, provider probes, locked evaluation data, chat core, checking, stream memory, the desk, voting, public receipts and the browser demo. The repository keeps the checks and findings beside those milestones.

One useful audit caught a retrieval bug in a natural French message. The passage selector dropped short tokens, including the platform “PC” and the count “8”. That lost the relevant changelog passage. The fix preserved those terms, and a regression now checks the actual captured source. A mutation probe restored the earlier implementation, observed the regression fail and then restored the passing bytes.

The film shows the real supplementary Codex CLI recording reading the project instructions, followed by the actual diff and captured test output. The main build session ID is provided in the form and repository. The build tool and runtime model provider have separate roles and separate evidence.

## Challenges I ran into

Streaming creates races. A moderator can remove a message during a check. A source can disappear while its receipt is uploading. A result can finish before a vote closes. A clip can become ready after the streamer has hidden or cancelled its parent result. I treated each of those as a state transition with eligibility checked at the publication boundary.

The keyless browser demo raised another challenge: it needed the real interaction, including two agreeing views. I reused the SQLite schema, stores, queue, verifier, VOD resolver, presentation controller and tally. SQLite WebAssembly runs inside a SharedWorker shared by the desk and overlay. The demo replays recorded outcomes while all votes, approvals and reveals use that domain code.

## Accomplishments

### Results

The final frozen run matched 45 of 48 dev verdicts and 23 of 24 heldout verdicts. Both runs produced zero reversed directional verdicts. The heldout verifier accepted 19 of 20 proposed excerpts. The rejected excerpt caused a qualification-sensitive claim to become UNCONFIRMED, and that miss remains in the report.

Heldout median end-to-end latency was 5.26 seconds across all attempted inputs, including non-claims and instruction guards. Discovery used curated source URLs, so this timing excludes paid search discovery. The corpus is authored and small, with related source pages. The reports preserve the denominator, model IDs, commit and every output.

Twitch evidence includes actual EventSub exchanges, threaded bot replies, moderation deletion, archive matching and a decoded playable clip. Repeated VOD retrieval and speech measurements use the original test recording. The container builds and runs its demo in CI. Real-browser checks cover the desk, overlay, public Worker pages, mobile layouts, accessibility and shared state.

Real service responses are recorded as fixtures; the no-key demo uses those verified outcomes with fictional chat accounts and scripted voters.

### Limits

Literal verification establishes that a passage exists, while stance and qualification remain fallible model judgments. The free replay catalogue bounds available factual examples. Speech measurements use prerecorded system narration. The live voting probe observed one eligible real voter, while the complete three-voter flow is exercised in the browser. Those are the scopes of the evidence I present.

## What I learned

The evidence boundary matters more than a confident explanation. A quote, source link or timecode becomes useful when the app can trace it back to stored material. Explicit state also made the product easier to design: “checking”, “waiting for approval”, “voting” and “revealed” are different moments for both the streamer and the audience.

Codex was most useful when I gave it verifiable constraints: use the caller’s real entry point, preserve failed runs, exercise the interface, inspect its screenshots and break a regression deliberately. Those constraints turned a promising interaction into an inspectable project.

## What's next

I want opt-in trials with streamers speaking naturally over their normal audio, broader multilingual evaluation and more primary-source coverage. The next viewer interface is a Twitch Extension using the same receipts and vote tally. I would keep the publication boundary: evidence first, streamer approval, then the reveal.

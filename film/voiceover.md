# Narration script

I use this as the optional Marc narration pass over the 2:45 edit. The existing export is
caption-led. Record dry speech in a quiet room, leaving the actual Twitch clip audible
in its marked window. Use the cuts as timing guides and keep natural pauses.

| Time | Narration |
|---|---|
| 0:00–0:07.5 | Chat, is this real? It is a good question. Give it a receipt. |
| 0:07.5–0:18.75 | I built Chat Is This Real for the moments when chat has a confident take, or remembers something you said earlier. Check it. Call it. Clip it. |
| 0:18.75–0:33.75 | Start with the original message. Here, chat says Java and Bedrock can play together without mods. The review desk brings the claim and its source together. Read the excerpt. It is verified against the fetched text. |
| 0:33.75–0:52.5 | The model proposes an answer. Code checks the evidence and decides the verdict. Here, the official source contradicts the claim. The streamer reviews it before anything is revealed. You control what goes on your stream. |
| 0:52.5–1:15 | While the check runs, chat makes the call. One for REAL. Two for NOT REAL. The first eligible vote counts. The result waits for the voting window and your approval. Then the stamp lands, and correct callers score. These demo voters are scripted. |
| 1:15–1:22.5 | And when chat says you promised something earlier? Check the VOD. Stored words. Their time. A clip. |
| 1:22.5–1:30 | **Leave this window for the original Twitch clip and its system narration.** |
| 1:30–1:48.75 | This is the actual reply in the test broadcast’s VOD chat. Account labels are hidden. The quote and time come from stored segments. A miss shows the indexed coverage, including its gaps. You can see exactly what was searched. |
| 1:48.75–2:03.75 | Chat speaks French. Chat speaks Spanish. The same verification still applies. These newly written examples went through recorded model runs. The receipts keep the original source words, even when the message is in another language. |
| 2:03.75–2:16.875 | Keep the conversation around the claim. Viewer History lets you select messages together. Review everything on the desk, or keep the same controls beside your stream in a narrow OBS dock. |
| 2:16.875–2:33.75 | I built it with OpenAI Codex, using agent instructions and successive audits. One regression caught a real retrieval bug: dropping the short terms PC and eight lost the relevant passage. The fix now has a recorded-source test. |
| 2:33.75–2:41.25 | The frozen checker matched twenty-three of twenty-four authored heldout verdicts, with no reversed verdicts. Search discovery used curated URLs. The full results are in the repository. |
| 2:41.25–2:45 | Show the receipts. Check the VOD. Your stream. Your call. |

Record to `data/film/marc-narration.wav` at 48 kHz. The current audio helper keeps the original
test clip and masters its encoded output. A narration pass needs its own timed mix and
another loudness measurement before replacing the caption-led master. The existing
render and its audit remain available for comparison.

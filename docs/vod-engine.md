# VOD engine measurements

The transcript is original system narration from the actual prerecorded Twitch test. These results do not measure human speech accuracy.
The model selects stored segment IDs. Code checks their ownership, order and continuity and renders the stored quote and time.
Unknown IDs become not_found. Word timing is used only when word text aligns to the stored transcript; otherwise timing is approximate.

| Dev run | Model | Found within tolerance | Never-said questions correct | Attempted | Timing rule |
|---|---|---|---|---|---|
| [6fe1a71](../eval/results/vod-dev-2026-10-24T14-40-32-372Z.json) | `qwen3.8-flash` | 20/20 dev moments | 6/6 dev questions | 26/26 | Earlier expanded-window check |
| [6fe1a71](../eval/results/vod-dev-2026-10-24T14-41-21-745Z.json) | `qwen3.8-flash` | 20/20 dev moments | 6/6 dev questions | 26/26 | Earlier expanded-window check |
| [6fe1a71](../eval/results/vod-dev-2026-10-24T14-42-07-737Z.json) | `qwen3.8-flash` | 20/20 dev moments | 5/6 dev questions | 26/26 | Earlier expanded-window check |
| [4c3a072](../eval/results/vod-dev-2026-10-24T15-38-05-017Z.json) | `qwen3.8-flash` | 20/20 dev moments | 6/6 dev questions | 26/26 | Speech-window midpoint, ±15 s |
| [4c3a072](../eval/results/vod-dev-2026-10-24T15-38-39-738Z.json) | `qwen3.8-flash` | 20/20 dev moments | 6/6 dev questions | 26/26 | Speech-window midpoint, ±15 s |
| [4c3a072](../eval/results/vod-dev-2026-10-24T15-39-18-689Z.json) | `qwen3.8-flash` | 20/20 dev moments | 6/6 dev questions | 26/26 | Speech-window midpoint, ±15 s |

The final timing rule measures distance from the midpoint of the independent speech window. Earlier runs expanded that window by the tolerance; their original reports remain unchanged.
The retrieval evaluation creates no public clips. Its clip metric is explicitly not attempted.

| Scripted live run | Completed | Last stage | Offset error | Decoded clip | Live reply |
|---|---|---|---|---|---|
| [1792854175765](../eval/results/vod-live-1792854175765.json) | false | not_recorded | not measured | false | false |
| [1792854590515](../eval/results/vod-live-1792854590515.json) | false | clip | 0.192 s | false | false |
| [1792855780317](../eval/results/vod-live-1792855780317.json) | true | complete | 0.092 s | true | true |

The first live run stopped before the command after a transient Windows manifest replacement failure. Atomic replacement now retries file locks.
The next run found the moment but rejected the account-path URL returned by Twitch. The app now constructs a canonical clip link from the actual clip ID.
The created clip was separately downloaded, decoded and matched to the source timecode. It was not reported as a completed live reply.

Companion: `npm run companion -- --list`, then set the selected audio device and run `npm run companion` during your connected live stream.
The optional recording input requires its actual broadcast wall clock. It is labelled in the probe and uses no camera or microphone.
Recording-input mode was tested end to end. Native device capture on each desktop OS still needs a device check.
Audio is 16 kHz mono in short chunks. Closed chunks are processed serially and deleted. Coverage records silence and exposes gaps.
The seconds-billed speech fallback has a separate local allowance cap; its real response fixture retains reported audio seconds. It has no word times.

Library imports accept SRT, VTT, timestamped TXT, or supported media linked to one of the broadcaster’s past VODs.
Media is streamed to a private temporary file, limited in size and duration, decoded without network protocols and removed after processing.
A failed import preserves the previous transcript. Caption timing and fallback speech timing remain approximate.

Small transcripts are sent in full within a text budget. Larger streams use FTS5 candidates and neighbours, including spelled-out and digit forms of numbers.
A request searches the current stream before a bounded number of recent indexed broadcasts. Coverage describes the searched scope, including gaps.
A negative answer means not found in that scope. It does not assert that something was never said.

Clip creation requires confirmation and a broadcaster-owned archive. Duplicate attempts are blocked. A VOD timestamp appears if creation is delayed or unavailable.
Twitch may omit archive timing fields while live; a VOD-created clip remains bound to the requested stored interval. The live probe verifies the downloaded recording.

Media handling follows the [FFmpeg protocol](https://ffmpeg.org/ffmpeg-protocols.html), [device](https://ffmpeg.org/ffmpeg-devices.html) and [segment](https://ffmpeg.org/ffmpeg-formats.html#segment) documentation.
The [Model Studio pricing table](https://www.alibabacloud.com/help/en/model-studio/model-pricing) distinguishes token-based native ASR from the seconds-based fallback.

Regenerate with `npm run report:vod`.

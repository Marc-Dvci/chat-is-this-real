import { readFile, readdir, writeFile } from 'node:fs/promises';
import { liveVodSummarySchema, vodRunSummarySchema } from '../src/shared/schemas.js';

async function report(): Promise<void> {
  const files = (await readdir('eval/results')).sort();
  const lines = ['# VOD engine measurements', '',
    'The transcript is original system narration from the actual prerecorded Twitch test. These results do not measure human speech accuracy.',
    'The model selects stored segment IDs. Code checks their ownership, order and continuity and renders the stored quote and time.',
    'Unknown IDs become not_found. Word timing is used only when word text aligns to the stored transcript; otherwise timing is approximate.', '',
    '| Dev run | Model | Found within tolerance | Never-said questions correct | Attempted | Timing rule |', '|---|---|---|---|---|---|'];
  for (const file of files.filter((name) => /^vod-dev-.*\.json$/u.test(name))) {
    const run = vodRunSummarySchema.parse(JSON.parse(await readFile(`eval/results/${file}`, 'utf8'))), m = run.metrics;
    lines.push(`| [${run.git_commit.slice(0, 7)}](../eval/results/${file}) | \`${run.model}\` | ${m.hit_within_15s.matched}/${m.hit_within_15s.total} dev moments | ${m.not_found_correctness.matched}/${m.not_found_correctness.total} dev questions | ${run.attempted_items}/${run.sample_count} | ${m.hit_within_15s.target ? 'Speech-window midpoint, ±15 s' : 'Earlier expanded-window check'} |`);
  }
  lines.push('', 'The final timing rule measures distance from the midpoint of the independent speech window. Earlier runs expanded that window by the tolerance; their original reports remain unchanged.',
    'The retrieval evaluation creates no public clips. Its clip metric is explicitly not attempted.', '',
    '| Scripted live run | Completed | Last stage | Offset error | Decoded clip | Live reply |', '|---|---|---|---|---|---|');
  for (const file of files.filter((name) => /^vod-live-.*\.json$/u.test(name))) {
    const run = liveVodSummarySchema.parse(JSON.parse(await readFile(`eval/results/${file}`, 'utf8')));
    const error = run.aligned_offset_error_s ?? run.offset_error_s;
    lines.push(`| [${file.replace('vod-live-', '').replace('.json', '')}](../eval/results/${file}) | ${run.passed} | ${run.stage} | ${error === undefined ? 'not measured' : `${error.toFixed(3)} s`} | ${run.clip_playable} | ${run.reply_sent} |`);
  }
  lines.push('', 'The first live run stopped before the command after a transient Windows manifest replacement failure. Atomic replacement now retries file locks.',
    'The next run found the moment but rejected the account-path URL returned by Twitch. The app now constructs a canonical clip link from the actual clip ID.',
    'The created clip was separately downloaded, decoded and matched to the source timecode. It was not reported as a completed live reply.', '',
    'Companion: `npm run companion -- --list`, then set the selected audio device and run `npm run companion` during your connected live stream.',
    'The optional recording input requires its actual broadcast wall clock. It is labelled in the probe and uses no camera or microphone.',
    'Recording-input mode was tested end to end. Native device capture on each desktop OS still needs a device check.',
    'Audio is 16 kHz mono in short chunks. Closed chunks are processed serially and deleted. Coverage records silence and exposes gaps.',
    'The seconds-billed speech fallback has a separate local allowance cap; its real response fixture retains reported audio seconds. It has no word times.', '',
    'Library imports accept SRT, VTT, timestamped TXT, or supported media linked to one of the broadcaster’s past VODs.',
    'Media is streamed to a private temporary file, limited in size and duration, decoded without network protocols and removed after processing.',
    'A failed import preserves the previous transcript. Caption timing and fallback speech timing remain approximate.', '',
    'Small transcripts are sent in full within a text budget. Larger streams use FTS5 candidates and neighbours, including spelled-out and digit forms of numbers.',
    'A request searches the current stream before a bounded number of recent indexed broadcasts. Coverage describes the searched scope, including gaps.',
    'A negative answer means not found in that scope. It does not assert that something was never said.', '',
    'Clip creation requires confirmation and a broadcaster-owned archive. Duplicate attempts are blocked. A VOD timestamp appears if creation is delayed or unavailable.',
    'Twitch may omit archive timing fields while live; a VOD-created clip remains bound to the requested stored interval. The live probe verifies the downloaded recording.', '',
    'Media handling follows the [FFmpeg protocol](https://ffmpeg.org/ffmpeg-protocols.html), [device](https://ffmpeg.org/ffmpeg-devices.html) and [segment](https://ffmpeg.org/ffmpeg-formats.html#segment) documentation.',
    'The [Model Studio pricing table](https://www.alibabacloud.com/help/en/model-studio/model-pricing) distinguishes token-based native ASR from the seconds-based fallback.', '',
    'Regenerate with `npm run report:vod`.');
  await writeFile('docs/vod-engine.md', `${lines.join('\n')}\n`);
}
void report().catch(() => { console.error('Could not generate the VOD report.'); process.exitCode = 1; });

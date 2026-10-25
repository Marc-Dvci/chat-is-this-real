import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { ffmpegBinary } from '../src/shared/ffmpeg.js';
import { loudnessMeasurementSchema } from '../src/shared/schemas.js';

const execute = promisify(execFile);
export async function masterFilmAudio(directory: string, duration: number, secondsPerBar: number): Promise<string> {
  const ffmpeg = ffmpegBinary(), audioStart = 44 * secondsPerBar, audioEnd = 48 * secondsPerBar;
  const command = (args: string[]) => execute(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true, maxBuffer: 2_000_000 });
  const mix = `[0:a]volume='if(between(t,${audioStart},${audioEnd}),0.26,0.85)':eval=frame[bed];[1:a]atrim=start=3:end=10.5,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,adelay=${audioStart * 1000}|${audioStart * 1000},apad[voice];[bed][voice]amix=inputs=2:normalize=0:duration=first,lowpass=f=17000[audio]`;
  await command(['-y', '-i', `${directory}/score.wav`, '-i', 'data/probe/1792855780317/alignment-clip.mp4', '-filter_complex', mix, '-map', '[audio]', '-c:a', 'pcm_f32le', '-t', String(duration), `${directory}/mix.wav`]);
  async function measure(path: string) {
    const result = await execute(ffmpeg, ['-hide_banner', '-nostats', '-i', path, '-vn', '-af', 'loudnorm=I=-14:TP=-2.5:LRA=7:print_format=json', '-f', 'null', '-'], { windowsHide: true, maxBuffer: 2_000_000 });
    const match = /\{\s*"input_i"[\s\S]*?\}/u.exec(result.stderr); if (!match) throw new Error('Missing measured film loudness.');
    return loudnessMeasurementSchema.parse(JSON.parse(match[0]));
  }
  const loudness = await measure(`${directory}/mix.wav`);
  // Control synthesized transients before normalization and leave headroom for AAC reconstruction.
  const normalization = 'acompressor=threshold=0.05:ratio=10:attack=1:release=60:makeup=3,loudnorm=I=-14:TP=-4:LRA=3,aresample=48000';
  const output = `${directory}/master.mp4`;
  await command(['-y', '-i', `${directory}/picture.mp4`, '-i', `${directory}/mix.wav`, '-i', `${directory}/captions.srt`, '-map', '0:v:0', '-map', '1:a:0', '-map', '2:s:0', '-af', normalization, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-t', String(duration), '-movflags', '+faststart', output]);
  const mastered = await measure(output); await writeFile(`${directory}/audio-audit.json`, JSON.stringify({ input: loudness, mastered }, null, 2));
  if (mastered.input_tp > -1 || Math.abs(mastered.input_i + 14) > .6) throw new Error('The film audio master needs another level pass.');
  return output;
}

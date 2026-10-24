import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { testStreamOutlineSchema } from '../src/shared/schemas.js';

const run = promisify(execFile);
const directory = resolve('data/test-stream');
await mkdir(directory, { recursive: true });
const outline = testStreamOutlineSchema.parse(JSON.parse(await readFile('scripts/test-stream-outline.json', 'utf8')));
if (process.platform !== 'win32') throw new Error('This optional recording builder uses Windows system speech.');
await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
  resolve('scripts/make-test-speech.ps1'), '-OutlinePath', resolve('scripts/test-stream-outline.json'), '-OutputDirectory', directory], { windowsHide: true });
const concat = [];
for (const paragraph of outline) {
  const target = join(directory, `minute-${paragraph.id}.wav`);
  await run('ffmpeg.exe', ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(directory, `speech-${paragraph.id}.wav`),
    '-af', 'apad', '-t', '60', '-ar', '16000', '-ac', '1', target], { windowsHide: true });
  concat.push(`file 'minute-${paragraph.id}.wav'`);
}
await writeFile(join(directory, 'audio-list.txt'), concat.join('\n'));
await run('ffmpeg.exe', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', join(directory, 'audio-list.txt'),
  '-ar', '16000', '-ac', '1', join(directory, 'recording.wav')], { windowsHide: true });
await copyFile('C:/Windows/Fonts/arial.ttf', join(directory, 'local-font.ttf'));
await writeFile(join(directory, 'title.txt'), 'CHAT IS THIS REAL');
await writeFile(join(directory, 'label.txt'), 'PRERECORDED AUTOMATED TEST\nOriginal script / system speech\nStream memory and clip verification');
const filters = [
  "drawtext=fontfile=data/test-stream/local-font.ttf:textfile=data/test-stream/title.txt:fontsize=68:fontcolor=white:x=80:y=100",
  "drawtext=fontfile=data/test-stream/local-font.ttf:textfile=data/test-stream/label.txt:fontsize=30:fontcolor=0x22D3EE:line_spacing=18:x=84:y=235",
  "drawtext=fontfile=data/test-stream/local-font.ttf:text='%{pts\\:hms}':fontsize=44:fontcolor=white:x=84:y=550"
].join(',');
await run('ffmpeg.exe', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x0E1116:s=1280x720:r=30',
  '-i', join(directory, 'recording.wav'), '-vf', filters, '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage',
  '-crf', '25', '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', '96k', '-t', '1200', '-movflags', '+faststart',
  join(directory, 'recording.mp4')], { windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
console.info('Created the original prerecorded test video in data/test-stream/recording.mp4.');

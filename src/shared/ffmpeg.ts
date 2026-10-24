import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function binary(name: 'ffmpeg' | 'ffprobe'): string {
  const configured = process.env[name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'];
  if (configured) return resolve(configured);
  const filename = `${name}${process.platform === 'win32' ? '.exe' : ''}`;
  const local = fileURLToPath(new URL(`../../.cache/tools/ffmpeg/bin/${filename}`, import.meta.url));
  return existsSync(local) ? local : filename;
}
export function ffmpegBinary(): string { return binary('ffmpeg'); }
export function ffprobeBinary(): string { return binary('ffprobe'); }

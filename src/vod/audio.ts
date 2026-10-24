import type { ModelClient } from '../llm/client.js';
import { ModelProviderError } from '../llm/errors.js';

export { ffmpegBinary, ffprobeBinary } from '../shared/ffmpeg.js';
export const mediaInputOptions = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'wav,mp3,mov,matroska,webm,ogg,flac,aac,avi'];

export function wavInfo(wav: Buffer): { duration: number; rms: number } {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Use PCM WAV audio.');
  let offset = 12, valid = false;
  while (offset + 8 <= wav.length) {
    const size = wav.readUInt32LE(offset + 4), type = wav.toString('ascii', offset, offset + 4);
    if (type === 'fmt ' && size >= 16 && offset + 24 <= wav.length) valid = wav.readUInt16LE(offset + 8) === 1 && wav.readUInt16LE(offset + 10) === 1 && wav.readUInt32LE(offset + 12) === 16000 && wav.readUInt16LE(offset + 22) === 16;
    if (type === 'data') {
      if (!valid || size > wav.length - offset - 8 || size % 2) throw new Error('Audio must be closed 16 kHz mono PCM.');
      let squares = 0;
      for (let index = offset + 8; index < offset + 8 + size; index += 2) squares += wav.readInt16LE(index) ** 2;
      return { duration: size / 32000, rms: size ? Math.sqrt(squares / (size / 2)) : 0 };
    }
    offset += 8 + size + size % 2;
  }
  throw new Error('Missing WAV samples.');
}

export async function transcribeAudio(model: ModelClient, wav: Buffer, previous: string, vocabulary: Record<string, number> = {}, signal?: AbortSignal) {
  const info = wavInfo(wav);
  if (info.duration <= 0 || info.duration > 16) throw new Error('Use audio chunks of at most 16 seconds.');
  if (info.rms < 20) return { text: '', words: [], duration: info.duration, fallback: false };
  try {
    const result = await model.asr(wav, previous, model.config.MODEL_ASR, { vocabulary, ...(signal ? { signal } : {}) });
    if (result.words.some((word) => word.end_time < word.begin_time || word.end_time > info.duration * 1000 + 500)) throw new ModelProviderError('invalid_output', 'asr_word_times');
    return { ...result, duration: info.duration, fallback: false };
  } catch (error) {
    if (signal?.aborted || error instanceof ModelProviderError && ['quota', 'unsafe'].includes(error.reason)) throw error;
    const result = await model.fallbackAsr(wav, signal);
    return { ...result, duration: info.duration, fallback: true };
  }
}

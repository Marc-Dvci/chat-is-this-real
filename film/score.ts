import { writeFile } from 'node:fs/promises';

export async function writeOriginalScore(path: string, duration: number, bpm: number): Promise<void> {
  const rate = 48_000, count = Math.round(duration * rate), data = Buffer.alloc(44 + count * 4), beat = 60 / bpm, bar = beat * 4;
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(count * 4, 40);
  const roots = [73.4162, 58.2705, 65.4064, 55], chordThirds = [1.189207, 1.259921, 1.259921, 1.189207];
  let seed = 0x1438f27b, previousNoise = 0;
  const sine = (frequency: number, time: number) => Math.sin(2 * Math.PI * frequency * time);
  for (let index = 0; index < count; index++) {
    const time = index / rate, currentBar = time / bar, position = time % beat, quarter = Math.floor(time / beat), sixteenth = time % (beat / 4), eighth = time % (beat / 2);
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; const noise = (seed >>> 0) / 0x80000000 - 1, high = noise - previousNoise; previousNoise = noise;
    const intro = Math.min(1, currentBar / 4), finish = Math.min(1, (duration - time) / 2), lastHit = currentBar >= 86;
    const breakDown = currentBar >= 40 && currentBar < 44 || currentBar >= 73 && currentBar < 77;
    const drive = currentBar < 4 ? .16 : breakDown ? .4 : 1, rootIndex = Math.floor(currentBar / 4) % roots.length, root = roots[rootIndex]!;
    const kick = position < .3 && !lastHit ? Math.sin(2 * Math.PI * (44 * position + 3.6 * (1 - Math.exp(-position * 34)))) * Math.exp(-position * 15) * .38 * drive : 0;
    const snare = quarter % 2 === 1 && position < .18 && currentBar >= 8 && !lastHit ? (noise * .12 + sine(185, position) * .045) * Math.exp(-position * 30) * drive : 0;
    const hat = sixteenth < .045 && !lastHit ? high * .022 * Math.exp(-sixteenth * 95) * (quarter % 2 ? .85 : .6) * drive : 0;
    const bassEnvelope = Math.min(1, eighth / .012) * Math.exp(-eighth * 10), bass = (sine(root, time) + .25 * sine(root * 2, time)) * .13 * bassEnvelope * intro * (lastHit ? Math.exp(-(time - 86 * bar) * 1.3) : 1);
    const padEnvelope = intro * finish * (.65 + .35 * Math.sin(Math.PI * (time % (bar * 4)) / (bar * 4)));
    const third = chordThirds[rootIndex]!, pad = (sine(root * 4, time) + .6 * sine(root * 4 * third, time) + .5 * sine(root * 6, time)) * .018 * padEnvelope;
    const arpeggioPattern = [1, third, 1.5, 2, 1.5, third, 2, 1.5], arpNote = arpeggioPattern[Math.floor(time / (beat / 2)) % arpeggioPattern.length]!;
    const arp = currentBar >= 10 && !breakDown && !lastHit ? sine(root * 8 * arpNote, eighth) * Math.min(1, eighth / .008) * Math.exp(-eighth * 24) * .021 : 0;
    const cuts = [4, 10, 28, 40, 58, 66, 73, 82], nextCut = cuts.find((cut) => cut * bar > time && cut * bar - time < .6), rise = nextCut ? noise * Math.pow(1 - (nextCut * bar - time) / .6, 2) * .035 : 0;
    const base = Math.tanh((kick + snare + hat + bass + pad + arp + rise) * 1.25) * .75 * finish;
    const width = sine(root * 4 + .32, time) * .006 * padEnvelope;
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, base + width)) * 32767), 44 + index * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, base - width)) * 32767), 46 + index * 4);
  }
  await writeFile(path, data);
}

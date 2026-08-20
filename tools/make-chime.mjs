// Generates resources/sounds/notify.wav — a short, soft two-tone chime.
//
// Why this exists: the notification card needs a gentle audio cue, but
// sourcing a third-party sound effect always carries a licensing question
// (attribution terms, redistribution rights, etc). A programmatically
// generated tone has none of that ambiguity, and keeping this script in the
// repo makes the asset reproducible and auditable — anyone can regenerate
// byte-for-byte the same file by running `node tools/make-chime.mjs`.
//
// Design: two soft sine tones (660 Hz then 880 Hz, a perfect fifth-ish lift)
// layered with a short attack and a gentle exponential decay, so it reads as
// a calm "ding" rather than a harsh beep. Mono, 16-bit PCM, 22.05 kHz — more
// than enough fidelity for a < 1 second UI chime, and it keeps the file tiny.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '../resources/sounds/notify.wav');

const SAMPLE_RATE = 22050;
const DURATION_S = 0.6;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

const totalSamples = Math.round(SAMPLE_RATE * DURATION_S);
const samples = new Float32Array(totalSamples);

// Two overlapping notes: a fundamental at 660 Hz starting immediately, and a
// second at 880 Hz starting slightly later, each with its own exponential
// envelope so the tail fades smoothly to zero (avoids an audible click).
const notes = [
  { freq: 660, startS: 0.0, amp: 0.5, decay: 6.0 },
  { freq: 880, startS: 0.12, amp: 0.35, decay: 5.0 }
];

for (let i = 0; i < totalSamples; i++) {
  const t = i / SAMPLE_RATE;
  let value = 0;
  for (const note of notes) {
    if (t < note.startS) continue;
    const localT = t - note.startS;
    const envelope = Math.exp(-note.decay * localT);
    value += note.amp * envelope * Math.sin(2 * Math.PI * note.freq * localT);
  }
  samples[i] = value;
}

// Short linear fade-in (first 5ms) so the very first sample isn't a jump
// from silence, then let the exponential decay above carry the fade-out.
const fadeInSamples = Math.round(SAMPLE_RATE * 0.005);
for (let i = 0; i < fadeInSamples && i < totalSamples; i++) {
  samples[i] *= i / fadeInSamples;
}

// Encode as 16-bit PCM WAV.
const dataBytes = totalSamples * CHANNELS * (BITS_PER_SAMPLE / 8);
const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
const byteRate = SAMPLE_RATE * blockAlign;
const buffer = Buffer.alloc(44 + dataBytes);

buffer.write('RIFF', 0, 'ascii');
buffer.writeUInt32LE(36 + dataBytes, 4);
buffer.write('WAVE', 8, 'ascii');
buffer.write('fmt ', 12, 'ascii');
buffer.writeUInt32LE(16, 16); // fmt chunk size
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(CHANNELS, 22);
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(byteRate, 28);
buffer.writeUInt16LE(blockAlign, 32);
buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
buffer.write('data', 36, 'ascii');
buffer.writeUInt32LE(dataBytes, 40);

for (let i = 0; i < totalSamples; i++) {
  const clamped = Math.max(-1, Math.min(1, samples[i]));
  const intSample = Math.round(clamped * 32767);
  buffer.writeInt16LE(intSample, 44 + i * 2);
}

writeFileSync(OUT_PATH, buffer);
console.log(`Wrote ${OUT_PATH} (${buffer.length} bytes, ${DURATION_S}s @ ${SAMPLE_RATE}Hz mono 16-bit)`);

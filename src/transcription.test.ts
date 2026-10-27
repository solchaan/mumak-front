import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, parseProject } from './model';
import { detectPitch, segmentFrames, quantizeMelody, suggestedOctave, addTranscribedNotes, type PitchFrame } from './transcription';

const rate = 16000;
function tone(pitch: number, seconds = .5, harmonics = false) {
  const frequency = 440 * 2 ** ((pitch - 69) / 12);
  return Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => {
    const phase = 2 * Math.PI * frequency * i / rate;
    return harmonics ? .08 * Math.sin(phase) + .22 * Math.sin(2 * phase) + .1 * Math.sin(3 * phase) : .3 * Math.sin(phase);
  });
}
function analyze(samples: Float32Array) {
  const frames: PitchFrame[] = [];
  for (let offset = 0; offset + rate * .048 < samples.length; offset += rate * .02) {
    const p = detectPitch(samples, offset, rate);
    frames.push({ pitch: p?.pitch ?? null, confidence: p?.confidence ?? 0, time: offset / rate + .016 });
  }
  return segmentFrames(frames, samples.length / rate);
}

test('pitch detection recovers sung-range fundamentals including harmonic-rich signals', () => {
  for (const pitch of [36, 48, 55, 60, 64, 69, 72, 84]) for (const harmonics of [false, true]) {
    const found = detectPitch(tone(pitch, .5, harmonics), 0, rate);
    assert.ok(found, `missing pitch ${pitch}`);
    assert.ok(Math.abs(found.pitch - pitch) < .2, `${pitch} detected as ${found.pitch}`);
  }
});

test('silence, DC and deterministic noise do not become notes', () => {
  assert.equal(detectPitch(new Float32Array(1000), 0, rate), null);
  assert.equal(detectPitch(new Float32Array(1000).fill(.2), 0, rate), null);
  let seed = 19;
  const noise = Float32Array.from({ length: 8000 }, () => { seed = seed * 16807 % 2147483647; return (seed / 2147483647 - .5) * .3; });
  assert.deepEqual(analyze(noise), []);
});

test('melody segmentation retains rests and repeated notes with separate attacks', () => {
  const samples = new Float32Array(rate * 3);
  samples.set(tone(60), rate * .2); samples.set(tone(64), rate * 1); samples.set(tone(64), rate * 2);
  const notes = analyze(samples);
  assert.deepEqual(notes.map(n => n.pitch), [60, 64, 64]);
  assert.ok(Math.abs(notes[0].start - .2) < .06);
  assert.ok(Math.abs(notes[0].end - .7) < .06);
  assert.ok(notes[2].start - notes[1].end > .3);
});

test('quantization honors tempo, recording offsets, range and monophonic timing', () => {
  const detected = [{ pitch: 48, start: .25, end: .75, confidence: .98 }, { pitch: 52, start: .75, end: 1.25, confidence: .98 }];
  assert.equal(suggestedOctave(detected), 1);
  const result = quantizeMelody(detected, 120, -.25, 1);
  assert.deepEqual(result.notes.map(n => [n.pitch, n.step, n.length]), [[60, 0, 4], [64, 4, 4]]);
  assert.equal(quantizeMelody(detected, 120, 0, 0).omitted, 2);
  assert.equal(quantizeMelody(detected, 120, -2, 1).notes.length, 0);
  const crowded = quantizeMelody([{ pitch: 60, start: 0, end: .15, confidence: 1 }, { pitch: 62, start: .08, end: .2, confidence: 1 }], 40, 0, 0);
  assert.equal(crowded.notes.length, 1); assert.equal(crowded.omitted, 1);
});

test('adding a conversion preserves the original and extends bars with valid persistent notes', () => {
  const p = createProject(true), before = JSON.stringify(p);
  const next = addTranscribedNotes(p, [{ pitch: 60, step: 128, length: 16, velocity: .75 }], true);
  assert.equal(next.bars, 9); assert.equal(next.notes.length, p.notes.length + 1);
  assert.deepEqual(next.notes.slice(0, -1), p.notes);
  assert.equal(JSON.stringify(p), before); assert.equal(next.mixer.voice.mute, true);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(next))), next);
  assert.throws(() => addTranscribedNotes(p, [], false));
});

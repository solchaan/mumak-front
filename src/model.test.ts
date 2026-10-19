import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, duration, moveNote, parseProject } from './model.ts';
import { midiBytes } from './midi.ts';
import { encodeWav } from './wav.ts';

test('demo is valid, has eight bars and round-trips through JSON', () => {
  const p = createProject(true);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))), p);
  assert.equal(duration(p), 20); assert.equal(p.notes.length, 32);
});
test('moving a note clamps pitch and time without truncating duration', () => {
  const note = createProject(true).notes[0];
  assert.equal(moveNote(note, 200, 100).step, 128 - note.length);
  assert.equal(moveNote(note, -20, 12).pitch, 60);
});
test('reject incompatible and corrupt imported projects', () => {
  const p = createProject();
  for (const invalid of [null, {}, { ...p, bpm: NaN }, { ...p, recording: { dataUrl: 'https://example.com/audio', offset: 0, duration: 1 } }, { ...p, updatedAt: 'bad' }, { ...p, drums: { kick: [0, 0], snare: [], hat: [] } }]) assert.throws(() => parseProject(invalid));
});
test('MIDI contains tempo, balanced note on/off events and an exact eight-bar timeline', () => {
  const p = createProject(true); const bytes = midiBytes(p); const view = new DataView(bytes.buffer as ArrayBuffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'MThd');
  assert.equal(view.getUint16(12), 480); assert.equal(view.getUint32(18), bytes.length - 22);
  let cursor = 22, tick = 0, on = 0, off = 0, tempo = 0;
  const variable = () => { let n = 0, byte; do { byte = bytes[cursor++]; n = (n << 7) | (byte & 127); } while (byte & 128); return n; };
  while (cursor < bytes.length) {
    tick += variable(); const status = bytes[cursor++];
    if (status === 255) {
      const type = bytes[cursor++]; const size = variable();
      if (type === 81) tempo = (bytes[cursor] << 16) | (bytes[cursor + 1] << 8) | bytes[cursor + 2];
      cursor += size;
    } else { if ((status & 240) === 144) on++; if ((status & 240) === 128) off++; cursor += 2; }
  }
  assert.equal(on, off); assert.equal(on, p.notes.length + Object.values(p.drums).flat().length);
  assert.equal(tempo, 625000); assert.equal(tick, 15360);
});
test('WAV encoder writes stereo PCM with clipping and correct lengths', () => {
  const wav = encodeWav([new Float32Array([-2, 0, 2]), new Float32Array([.5, 0, -.5])], 44100);
  const view = new DataView(wav);
  assert.equal(wav.byteLength, 56); assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 44100); assert.equal(view.getUint32(40, true), 12);
  assert.equal(view.getInt16(44, true), -32768); assert.equal(view.getInt16(52, true), 32767);
});

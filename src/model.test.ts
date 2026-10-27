import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, duration, moveNote, parseProject } from './model.ts';
import { keyAccidentals, keySpelling } from './notation.ts';
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
test('key signatures validate against the canonical list, spell notes and reach MIDI', () => {
  const p = createProject();
  assert.equal(parseProject(JSON.parse(JSON.stringify(p))).key, null);
  const { key: _unset, ...legacy } = p; assert.equal(parseProject(JSON.parse(JSON.stringify(legacy))).key, null);
  const keyed = { ...p, key: { tonic: 'Gb', mode: 'major' as const } };
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(keyed))).key, keyed.key);
  for (const invalid of [{ tonic: 'H', mode: 'major' }, { tonic: 'Gb', mode: 'minor' }, { tonic: 'C', mode: 'dorian' }, 'G', 7]) assert.throws(() => parseProject({ ...p, key: invalid }), JSON.stringify(invalid));
  assert.equal(keySpelling(66, { tonic: 'G', mode: 'major' }), 'F#4'); assert.equal(keySpelling(71, { tonic: 'Gb', mode: 'major' }), 'Cb5');
  assert.equal(keySpelling(61, { tonic: 'F', mode: 'major' }), 'Db4'); assert.equal(keySpelling(61, { tonic: 'D', mode: 'major' }), 'C#4'); assert.equal(keySpelling(61, null), 'C#4');
  assert.deepEqual(keyAccidentals({ tonic: 'D', mode: 'major' }), { C: '#', D: '', E: '', F: '#', G: '', A: '', B: '' });
  assert.deepEqual(keyAccidentals({ tonic: 'C', mode: 'minor' }), { C: '', D: '', E: 'b', F: '', G: '', A: 'b', B: 'b' });
  const keySignature = (bytes: Uint8Array) => { const i = bytes.findIndex((b, i) => b === 255 && bytes[i + 1] === 89); return i < 0 ? null : [...bytes.slice(i, i + 5)]; };
  assert.deepEqual(keySignature(midiBytes({ ...p, key: { tonic: 'Eb', mode: 'major' } })), [255, 89, 2, 253, 0]);
  assert.deepEqual(keySignature(midiBytes({ ...p, key: { tonic: 'E', mode: 'minor' } })), [255, 89, 2, 1, 1]);
  assert.equal(keySignature(midiBytes(p)), null);
});
test('accompaniment pattern defaults to four beats per bar and rejects unknown patterns', () => {
  const p = createProject(); assert.deepEqual(p.accompaniment, { pattern: 'quarter' });
  const { accompaniment: _unset, ...legacy } = p;
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(legacy))).accompaniment, { pattern: 'quarter' });
  assert.equal(parseProject({ ...p, accompaniment: { pattern: 'whole', extra: 1 } }).accompaniment.pattern, 'whole');
  for (const invalid of [{ pattern: 'swing' }, 'quarter', null, {}]) assert.throws(() => parseProject({ ...p, accompaniment: invalid }), JSON.stringify(invalid));
});
test('WAV encoder writes stereo PCM with clipping and correct lengths', () => {
  const wav = encodeWav([new Float32Array([-2, 0, 2]), new Float32Array([.5, 0, -.5])], 44100);
  const view = new DataView(wav);
  assert.equal(wav.byteLength, 56); assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 44100); assert.equal(view.getUint32(40, true), 12);
  assert.equal(view.getInt16(44, true), -32768); assert.equal(view.getInt16(52, true), 32767);
});

test('extended projects preserve content and enforce their own timeline', async () => {
  const { appendBar, totalSteps, MAX_BARS } = await import('./model.ts');
  const original = createProject(true);
  const p = appendBar(original);
  assert.equal(p.bars, 9); assert.equal(original.bars, 8);
  assert.deepEqual(p.notes, original.notes);
  p.notes = [...p.notes, { id: crypto.randomUUID(), pitch: 60, step: 143, length: 1, velocity: .7 }];
  p.drums = { ...p.drums, kick: [...p.drums.kick, 143] };
  assert.equal(parseProject(JSON.parse(JSON.stringify(p))).bars, 9);
  assert.equal(duration(p), 22.5);
  assert.equal(moveNote(p.notes.at(-1)!, 200, 60, totalSteps(p)).step, 143);
  assert.throws(() => parseProject({ ...p, bars: 8 }));
  for (const bars of [0, -1, 1.5, MAX_BARS + 1]) assert.throws(() => parseProject({ ...p, bars }));
  assert.equal(appendBar({ ...p, bars: MAX_BARS }).bars, MAX_BARS);
  // The empty MIDI track must retain all nine bars, including trailing silence.
  const bytes = midiBytes({ ...createProject(), bars: 9 });
  let cursor = 22, tick = 0;
  while (cursor < bytes.length) {
    let delta = 0, byte;
    do { byte = bytes[cursor++]; delta = (delta << 7) | (byte & 127); } while (byte & 128);
    tick += delta; assert.equal(bytes[cursor++], 255); cursor++;
    const size = bytes[cursor++]; cursor += size;
  }
  assert.equal(tick, 9 * 1920);
});

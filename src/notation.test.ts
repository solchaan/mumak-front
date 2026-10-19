import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, moveNote, parseProject } from './model.ts';
import { QUALITIES, parseChord, pitchSpelling, positionSpelling, reconcileChords, removeChord, restSegments, segments, spellingPitch, staffPosition, writeChord } from './notation.ts';
import { midiBytes } from './midi.ts';

test('major, minor, seventh and flat-root chords have correct MIDI pitches and spellings', () => {
  assert.deepEqual(parseChord('C').tones.map(t => t.pitch), [60, 64, 67]);
  assert.deepEqual(parseChord('Am').tones.map(t => t.pitch), [69, 72, 76]);
  assert.deepEqual(parseChord('G7').tones.map(t => t.pitch), [67, 71, 74, 77]);
  assert.deepEqual(parseChord('Bbmaj7').tones.map(t => t.spelling), ['Bb4', 'D5', 'F5', 'A5']);
  assert.deepEqual(parseChord('Cdim7').tones.map(t => t.spelling), ['C4', 'Eb4', 'Gb4', 'Bbb4']);
  for (const root of ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'Cb', 'B#']) for (const suffix of Object.keys(QUALITIES)) {
    if (['Cbdim7', 'B#aug'].includes(root + suffix)) { assert.throws(() => parseChord(root + suffix)); continue; }
    const result = parseChord(root + suffix);
    for (const tone of result.tones) assert.equal(spellingPitch(tone.spelling), tone.pitch);
  }
  for (const invalid of ['C13', 'H7', '<script>', 'C/G', '']) assert.throws(() => parseChord(invalid));
});
test('staff positions and enharmonic pitch spellings round trip', () => {
  for (let i = 0; i <= 14; i++) assert.equal(staffPosition(positionSpelling(i)), i);
  for (let pitch = 60; pitch <= 84; pitch++) assert.equal(spellingPitch(pitchSpelling(pitch)), pitch);
  assert.equal(staffPosition('Bb4'), 6); assert.equal(staffPosition('A#4'), 5);
});
test('chords persist, update atomically, remove their notes, and feed the MIDI stream', () => {
  const p = writeChord(createProject(), 'G7', 16, 8);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))), p);
  assert.equal(p.chords.length, 1); assert.equal(p.notes.length, 4);
  const midi = midiBytes(p); assert.ok(midi.includes(77));
  const changed = writeChord(p, 'Dm', 20, 4, p.chords[0].id);
  assert.equal(changed.chords[0].id, p.chords[0].id); assert.equal(changed.notes.length, 3);
  assert.equal(changed.notes.every(n => n.step === 20 && n.length === 4), true);
  assert.equal(removeChord(changed, changed.chords[0].id).notes.length, 0);
  assert.throws(() => writeChord(p, 'Am', 127, 4));
  assert.throws(() => writeChord(p, 'Am', 16, 4));
});
test('editing one chord tone detaches its label without removing other notes', () => {
  const p = writeChord(createProject(), 'C', 0, 4);
  const next = reconcileChords(p, { ...p, notes: p.notes.map((n, i) => i === 0 ? moveNote(n, n.step, 61) : n) });
  assert.equal(next.chords.length, 0); assert.equal(next.notes.length, 3);
  assert.equal(next.notes[0].spelling, undefined);
  assert.equal(reconcileChords(p, { ...p, notes: p.notes.map(n => ({ ...n, velocity: .2 })) }).chords.length, 1);
});
test('old projects migrate and malformed metadata is rejected', () => {
  const p = createProject(); const { chords: _, ...old } = p;
  assert.deepEqual(parseProject(old).chords, []);
  const chord = writeChord(p, 'Bbmaj7', 0, 8);
  assert.throws(() => parseProject({ ...chord, chords: [{ ...chord.chords[0], noteIds: [crypto.randomUUID()] }] }));
  assert.throws(() => parseProject({ ...chord, chords: [{ ...chord.chords[0], symbol: 'C' }] }));
  assert.throws(() => parseProject({ ...chord, notes: chord.notes.map(n => ({ ...n, spelling: 'C4' })) }));
  assert.throws(() => parseProject({ ...p, chords: null }));
});
test('durations split at bar boundaries without changing timing; rests exclude sustained notes', () => {
  const parts = segments(14, 7);
  assert.deepEqual(parts.map(p => [p.step, p.length]), [[14, 2], [16, 4], [20, 1]]);
  assert.equal(parts[0].toNext, true); assert.equal(parts[1].fromPrevious, true); assert.equal(parts[2].toNext, false);
  const p = writeChord(createProject(), 'C', 14, 7);
  assert.deepEqual(restSegments(p.notes, 1).map(s => [s.step, s.length]), [[21, 8], [29, 3]]);
  assert.deepEqual(restSegments([], 0).map(s => s.length), [16]);
});

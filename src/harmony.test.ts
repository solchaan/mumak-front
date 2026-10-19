import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, parseProject } from './model.ts';
import { writeChord } from './notation.ts';
import { applyProgression, suggestionPayload } from './harmony.ts';

const progression = ['C', 'G', 'Am', 'F'].flatMap((symbol, i) => [{ symbol, step: i * 16, length: 16 }, { symbol, step: (i + 4) * 16, length: 16 }]).sort((a, b) => a.step - b.step);

test('suggestion payload sends notes and chords without recordings or titles', () => {
  const p = writeChord(createProject(true), 'G7', 0, 16);
  const payload = suggestionPayload({ ...p, recording: { dataUrl: 'data:audio/webm;base64,AAAA', duration: 1, offset: 0 } }, 16, 8);
  assert.deepEqual(Object.keys(payload).sort(), ['chords', 'key', 'length', 'notes', 'step']);
  assert.equal(payload.key, null);
  assert.deepEqual(suggestionPayload({ ...p, key: { tonic: 'G', mode: 'minor' } }, 0, 16).key, { tonic: 'G', mode: 'minor' });
  assert.equal(payload.notes.length, p.notes.length); assert.deepEqual(payload.chords[0], { symbol: 'G7', step: 0, length: 16 });
  assert.equal(JSON.stringify(payload).includes('base64'), false);
});

test('applying a progression fills eight bars and replaces chords at the same positions', () => {
  const p = applyProgression(createProject(), progression);
  assert.equal(p.chords.length, 8); assert.equal(p.notes.length, 0, 'lead-sheet chords never add notes');
  assert.deepEqual(p.chords.map(c => c.symbol), ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']);
  const before = writeChord({ ...createProject(), notes: [{ id: crypto.randomUUID(), pitch: 72, step: 16, length: 4, velocity: .8 }] }, 'Dm7', 16, 8);
  const replaced = applyProgression(before, progression);
  assert.equal(replaced.chords.length, 8); assert.equal(replaced.chords[1].symbol, 'G'); assert.equal(replaced.chords[1].length, 16);
  assert.equal(replaced.notes.length, 1, 'the melody note survives while the Dm7 symbol is replaced');
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(replaced))), replaced);
  assert.throws(() => applyProgression(p, [{ symbol: 'H', step: 0, length: 16 }]));
});

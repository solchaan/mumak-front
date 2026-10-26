import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from './model.ts';
import { writeChord } from './notation.ts';
import { applyReviewEdit, reviewFingerprint } from './review.ts';

test('an audition copy changes one note, clears its spelling, and preserves the source', () => {
  const p = createProject(); p.notes = [{ id: crypto.randomUUID(), pitch: 65, spelling: 'F4', step: 0, length: 8, velocity: .7 }];
  const edit = { kind: 'note' as const, noteId: p.notes[0].id, step: 0, length: 8, fromPitch: 65, pitch: 64 };
  const result = applyReviewEdit(p, edit);
  assert.equal(p.notes[0].pitch, 65); assert.equal(result.notes[0].pitch, 64); assert.equal(result.notes[0].spelling, undefined);
  assert.throws(() => applyReviewEdit(result, edit), /변경/);
  assert.throws(() => applyReviewEdit(p, { ...edit, pitch: 100 }));
});
test('chord alternatives preserve timing and stale fingerprints track musical edits', () => {
  const p = writeChord(createProject(), 'C', 16, 16);
  const next = applyReviewEdit(p, { kind: 'chord', step: 16, fromSymbol: 'C', symbol: 'Am' });
  assert.equal(next.chords[0].length, 16); assert.equal(p.chords[0].symbol, 'C');
  assert.notEqual(reviewFingerprint(p), reviewFingerprint(next));
  assert.equal(reviewFingerprint(p), reviewFingerprint({ ...p, title: 'new name', updatedAt: new Date().toISOString() }));
  assert.notEqual(reviewFingerprint(p), reviewFingerprint({ ...p, id: crypto.randomUUID() }));
});

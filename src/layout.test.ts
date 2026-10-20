import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from './model.ts';
import { VIEWS, geometry } from './layout.ts';

test('score geometry scales the step grid to the key signature and the bars per system', () => {
  const p = createProject();
  const one = geometry(p, 'melody', 1);
  assert.equal(one.start, 130); assert.equal(one.cell, 46); assert.equal(one.row, 210);
  assert.equal(one.barX(0), 20); assert.equal(one.barWidth(0), 880); assert.equal(one.noteX(0, 4), 130 + 4 * 46);
  const two = geometry({ ...p, key: { tonic: 'Gb', mode: 'major' } }, 'both', 2);
  assert.equal(two.start, 172); assert.equal(two.cell, 21); assert.equal(two.row, 410); assert.equal(two.staveY(2), 245);
  assert.equal(two.noteX(1, 4), 172 + 20 * 21);
  assert.equal(two.barX(0) + two.barWidth(0), two.barX(1), 'bars in a system join without a gap');
  assert.equal(two.barX(1) + two.barWidth(1), 900, 'the last bar reaches the right margin');
  assert.deepEqual(VIEWS.accompaniment, ['treble', 'bass']); assert.equal(geometry(p, 'accompaniment').kinds.length, 2);
});

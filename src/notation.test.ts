import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, parseProject, uid } from './model.ts';
import { QUALITIES, accompaniment, chordCatalog, chordMatches, chordTones, parseChord, pitchSpelling, positionSpelling, removeChord, restSegments, segments, spellingPitch, staffPosition, writeChord } from './notation.ts';
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
  assert.deepEqual(chordTones('G7'), [67, 71, 74, 77]); assert.deepEqual(chordTones('H'), []);
});
test('staff positions and enharmonic pitch spellings round trip', () => {
  for (let i = 0; i <= 14; i++) assert.equal(staffPosition(positionSpelling(i)), i);
  for (let pitch = 60; pitch <= 84; pitch++) assert.equal(spellingPitch(pitchSpelling(pitch)), pitch);
  assert.equal(staffPosition('Bb4'), 6); assert.equal(staffPosition('A#4'), 5);
});
test('lead-sheet chords are symbols: they never add notes, trim neighbours, update atomically and reach MIDI', () => {
  const p = writeChord(createProject(), 'G7', 16, 8);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))), p);
  assert.equal(p.chords.length, 1); assert.equal(p.notes.length, 0);
  assert.deepEqual(Object.keys(p.chords[0]).sort(), ['id', 'length', 'step', 'symbol']);
  const changed = writeChord(p, 'Dm', 20, 4, p.chords[0].id);
  assert.equal(changed.chords.length, 1); assert.equal(changed.chords[0].id, p.chords[0].id); assert.equal(changed.chords[0].symbol, 'Dm'); assert.equal(changed.chords[0].step, 20);
  const two = writeChord(writeChord(createProject(), 'C', 0, 16), 'F', 8, 16);
  assert.deepEqual(two.chords.map(c => [c.symbol, c.step, c.length]), [['C', 0, 8], ['F', 8, 16]]);
  const inserted = writeChord(two, 'G', 4, 16);
  assert.deepEqual(inserted.chords.map(c => [c.symbol, c.step, c.length]), [['C', 0, 4], ['G', 4, 4], ['F', 8, 16]]);
  assert.equal(removeChord(inserted, inserted.chords[1].id).chords.length, 2); assert.equal(removeChord(inserted, 'missing').chords.length, 3);
  assert.throws(() => writeChord(p, 'Am', 127, 4));
  assert.throws(() => writeChord(p, 'Am', 16, 4));
  const midi = midiBytes(two); const text = [255, 1, 1, 'F'.charCodeAt(0)];
  assert.ok([...midi].some((_, i) => text.every((b, j) => midi[i + j] === b)), 'chord symbol is written as a MIDI text event');
  assert.ok([...midi].some((b, i) => b === 0x91 && midi[i + 1] === 60), 'chord tones sound on channel 2');
});
test('old projects migrate: generated chord tones are dropped and malformed metadata is rejected', () => {
  const p = createProject(); const { chords: _, ...old } = p;
  assert.deepEqual(parseProject(old).chords, []);
  const tones = [60, 64, 67].map(pitch => ({ id: uid(), pitch, step: 0, length: 8, velocity: .7 }));
  const melody = { id: uid(), pitch: 72, step: 4, length: 2, velocity: .8 };
  const legacy = { ...p, notes: [...tones, melody], chords: [{ id: uid(), symbol: 'C', step: 0, length: 8, noteIds: tones.map(n => n.id) }] };
  const migrated = parseProject(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(migrated.notes, [melody]); assert.deepEqual(migrated.chords, [{ id: legacy.chords[0].id, symbol: 'C', step: 0, length: 8 }]);
  const chord = writeChord(p, 'Bbmaj7', 0, 8);
  assert.throws(() => parseProject({ ...chord, chords: [{ ...chord.chords[0], symbol: 'H' }] }));
  assert.throws(() => parseProject({ ...chord, chords: [chord.chords[0], { ...chord.chords[0], id: uid() }] }));
  assert.throws(() => parseProject({ ...chord, chords: [{ ...chord.chords[0], noteIds: [1] }] }));
  assert.throws(() => parseProject({ ...p, notes: [{ ...melody, spelling: 'C4' }] }));
  assert.throws(() => parseProject({ ...p, chords: null }));
});
test('accompaniment is generated from chord symbols in the chosen beat pattern and exported on its own channels', () => {
  const p = writeChord(createProject(), 'C', 0, 16);
  const four = accompaniment(p);
  assert.equal(four.treble.length, 12); assert.equal(four.bass.length, 4);
  assert.deepEqual(four.bass.map(n => [n.pitch, n.step, n.length]), [[48, 0, 4], [48, 4, 4], [48, 8, 4], [48, 12, 4]]);
  assert.deepEqual(four.treble.filter(n => n.step === 4).map(n => n.pitch), [60, 64, 67]);
  assert.equal(four.bass[0].spelling, 'C3'); assert.equal(spellingPitch(four.bass[0].spelling!), 48);
  assert.equal(new Set([...four.treble, ...four.bass].map(n => n.id)).size, 16);
  const whole = accompaniment({ ...p, accompaniment: { pattern: 'whole' } });
  assert.equal(whole.treble.length, 3); assert.equal(whole.bass[0].length, 16);
  assert.equal(accompaniment({ ...p, accompaniment: { pattern: 'eighth' } }).bass.length, 8);
  const partial = accompaniment(writeChord(createProject(), 'G7', 2, 7));
  assert.deepEqual(partial.bass.map(n => [n.step, n.length]), [[2, 4], [6, 3]]);
  assert.equal(partial.treble.filter(n => n.step === 2).length, 4);
  assert.equal(accompaniment(createProject()).treble.length, 0);
  const midi = midiBytes(p);
  assert.ok([...midi].some((b, i) => b === 0x92 && midi[i + 1] === 48), 'bass line on channel 3');
  assert.equal([...midi].filter((b, i) => b === 0x91 && midi[i + 1] === 60).length, 4, 'four treble hits per bar on channel 2');
});
test('chord autocomplete lists every supported symbol, puts the key’s diatonic chords first and matches substrings', () => {
  const all = chordCatalog(null);
  assert.equal(new Set(all.map(o => o.symbol)).size, all.length);
  for (const o of all) assert.ok(chordTones(o.symbol).length, o.symbol);
  assert.equal(all.some(o => o.symbol === 'Cbdim7' || o.symbol === 'B#aug'), false);
  assert.equal(all[0].symbol, 'C'); assert.equal(all[0].roman, undefined);
  assert.equal(all.filter(o => /^C[^#b]/.test(o.symbol) || o.symbol === 'C').length, Object.keys(QUALITIES).length, 'every quality is listed for each root');
  assert.deepEqual(chordMatches(all, 'g').slice(0, 3).map(o => o.symbol), ['G', 'Gm', 'G7']);
  assert.equal(chordMatches(all, 'Gm')[0].symbol, 'Gm');
  const f = chordCatalog({ tonic: 'F', mode: 'major' });
  assert.deepEqual(f.slice(0, 6).map(o => `${o.symbol}:${o.roman}`), ['F:I', 'Fmaj7:I7', 'Gm:ii', 'Gm7:ii7', 'Am:iii', 'Am7:iii7']);
  assert.ok(f.some(o => o.symbol === 'Bb' && o.roman === 'IV') && f.some(o => o.symbol === 'C7' && o.roman === 'V7'));
  assert.equal(f.length, all.length, 'diatonic entries are the same symbols ranked first, not duplicates');
  const gb = chordCatalog({ tonic: 'Gb', mode: 'major' });
  assert.ok(gb.some(o => o.symbol === 'Cb' && o.roman === 'IV'), 'roots are spelled the way the key spells them');
  assert.deepEqual(chordCatalog({ tonic: 'A', mode: 'minor' }).slice(0, 2).map(o => o.symbol), ['Am', 'Am7']);
  assert.equal(chordMatches(all, 'bm')[0].symbol, 'Bm');
  assert.equal(chordMatches(all, 'MAJ7')[0].symbol, 'Cmaj7');
  assert.equal(chordMatches(all, 'b♭m7')[0].symbol, 'Bbm7');
  assert.deepEqual(chordMatches(all, 'xyz'), []);
  assert.equal(chordMatches(all, '').length, 12); assert.equal(chordMatches(all, 'm', 3).length, 3);
  assert.deepEqual(chordMatches(f, 'g').slice(0, 3).map(o => o.symbol), ['G', 'Gm', 'Gm7'], 'an exact match leads, then the key’s diatonic chords');
  assert.deepEqual(chordMatches(f, 'gm').slice(0, 2).map(o => o.symbol), ['Gm', 'Gm7']);
});
test('durations split at bar boundaries without changing timing; rests exclude sustained notes', () => {
  const parts = segments(14, 7);
  assert.deepEqual(parts.map(p => [p.step, p.length]), [[14, 2], [16, 4], [20, 1]]);
  assert.equal(parts[0].toNext, true); assert.equal(parts[1].fromPrevious, true); assert.equal(parts[2].toNext, false);
  const notes = [{ id: uid(), pitch: 60, step: 14, length: 7, velocity: .7 }];
  assert.deepEqual(restSegments(notes, 1).map(s => [s.step, s.length]), [[21, 8], [29, 3]]);
  assert.deepEqual(restSegments([], 0).map(s => s.length), [16]);
});

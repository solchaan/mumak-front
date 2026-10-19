import type { Chord, Note, Project } from './model';

export const MIN_PITCH = 60, MAX_PITCH = 84;
const LETTERS = 'CDEFGAB';
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
export const QUALITIES: Record<string, { intervals: number[]; degrees: number[] }> = {
  '': { intervals: [0, 4, 7], degrees: [0, 2, 4] },
  m: { intervals: [0, 3, 7], degrees: [0, 2, 4] },
  '7': { intervals: [0, 4, 7, 10], degrees: [0, 2, 4, 6] },
  maj7: { intervals: [0, 4, 7, 11], degrees: [0, 2, 4, 6] },
  m7: { intervals: [0, 3, 7, 10], degrees: [0, 2, 4, 6] },
  dim: { intervals: [0, 3, 6], degrees: [0, 2, 4] },
  dim7: { intervals: [0, 3, 6, 9], degrees: [0, 2, 4, 6] },
  m7b5: { intervals: [0, 3, 6, 10], degrees: [0, 2, 4, 6] },
  aug: { intervals: [0, 4, 8], degrees: [0, 2, 4] },
  sus2: { intervals: [0, 2, 7], degrees: [0, 1, 4] },
  sus4: { intervals: [0, 5, 7], degrees: [0, 3, 4] },
  '6': { intervals: [0, 4, 7, 9], degrees: [0, 2, 4, 5] },
  m6: { intervals: [0, 3, 7, 9], degrees: [0, 2, 4, 5] },
};
export function spellingPitch(spelling: string): number | null {
  const match = /^([A-G])(bb|##|b|#)?([3-6])$/.exec(spelling);
  if (!match) return null;
  const delta = match[2]?.startsWith('b') ? -match[2].length : match[2]?.length || 0;
  return (Number(match[3]) + 1) * 12 + NATURAL[LETTERS.indexOf(match[1])] + delta;
}
export function pitchSpelling(pitch: number): string {
  return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][pitch % 12] + (Math.floor(pitch / 12) - 1);
}
export function staffPosition(spelling: string): number {
  const match = /^([A-G])(?:bb|##|b|#)?([3-6])$/.exec(spelling)!;
  return (Number(match[2]) - 4) * 7 + LETTERS.indexOf(match[1]);
}
export function positionSpelling(position: number, accidental: '' | '#' | 'b' = ''): string {
  const index = Math.max(0, Math.min(14, Math.round(position)));
  return LETTERS[index % 7] + accidental + (4 + Math.floor(index / 7));
}
export type Mode = 'major' | 'minor';
export interface KeySignature { tonic: string; mode: Mode }
// Canonical key signatures. Tonic spellings match the backend's tables; sharps is negative for flat keys.
export const KEYS: (KeySignature & { sharps: number })[] = [
  ...([['C', 0], ['G', 1], ['D', 2], ['A', 3], ['E', 4], ['B', 5], ['Gb', -6], ['Db', -5], ['Ab', -4], ['Eb', -3], ['Bb', -2], ['F', -1]] as const).map(([tonic, sharps]) => ({ tonic, mode: 'major' as const, sharps })),
  ...([['A', 0], ['E', 1], ['B', 2], ['F#', 3], ['C#', 4], ['G#', 5], ['Eb', -6], ['Bb', -5], ['F', -4], ['C', -3], ['G', -2], ['D', -1]] as const).map(([tonic, sharps]) => ({ tonic, mode: 'minor' as const, sharps })),
];
export const findKey = (key: KeySignature | null | undefined) => key ? KEYS.find(k => k.tonic === key.tonic && k.mode === key.mode) ?? null : null;
export const keyLabel = (key: KeySignature) => { const k = findKey(key); return `${key.tonic} ${key.mode === 'major' ? '장조' : '단조'}${k?.sharps ? ` (${k.sharps > 0 ? '♯' : '♭'}${Math.abs(k.sharps)})` : ''}`; };
export const vexKey = (key: KeySignature) => key.mode === 'major' ? key.tonic : key.tonic + 'm';
export function keyAccidentals(key: KeySignature | null): Record<string, '' | '#' | 'b'> {
  const result: Record<string, '' | '#' | 'b'> = Object.fromEntries([...LETTERS].map(l => [l, '']));
  const k = findKey(key);
  if (!k) return result;
  for (let i = 0; i < Math.abs(k.sharps); i++) result[(k.sharps > 0 ? 'FCGDAEB' : 'BEADGCF')[i]] = k.sharps > 0 ? '#' : 'b';
  return result;
}
// Spells a pitch the way the key signature would: diatonic letters first, then accidentals in the key's direction.
export function keySpelling(pitch: number, key: KeySignature | null): string {
  const k = findKey(key);
  if (!k) return pitchSpelling(pitch);
  const accidentals = keyAccidentals(key);
  for (const letter of LETTERS) {
    const delta = accidentals[letter] === '#' ? 1 : accidentals[letter] === 'b' ? -1 : 0;
    if ((NATURAL[LETTERS.indexOf(letter)] + delta + 12) % 12 === pitch % 12) return letter + accidentals[letter] + (Math.floor((pitch - delta) / 12) - 1);
  }
  const names = k.sharps < 0 ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[pitch % 12] + (Math.floor(pitch / 12) - 1);
}
export function parseChord(symbol: string): { symbol: string; tones: { pitch: number; spelling: string }[] } {
  const normalized = symbol.trim().replaceAll('♯', '#').replaceAll('♭', 'b');
  const match = /^([A-Ga-g])([#b]?)(maj7|m7b5|dim7|sus2|sus4|m7|m6|dim|aug|7|6|m)?$/.exec(normalized);
  if (!match) throw new Error('코드를 확인하세요. 예: C, Am, G7, Bbmaj7, F#m7b5');
  const root = match[1].toUpperCase(); const accidental = match[2]; const quality = match[3] || '';
  let octave = 4;
  if (spellingPitch(`${root}${accidental}${octave}`)! < MIN_PITCH) octave++;
  const rootPitch = spellingPitch(`${root}${accidental}${octave}`)!;
  const spec = QUALITIES[quality];
  const tones = spec.intervals.map((interval, i) => {
    const diatonic = LETTERS.indexOf(root) + spec.degrees[i];
    const letter = LETTERS[diatonic % 7]; const oct = octave + Math.floor(diatonic / 7);
    const pitch = rootPitch + interval; const difference = pitch - spellingPitch(`${letter}${oct}`)!;
    const spelling = letter + (difference < 0 ? 'b'.repeat(-difference) : '#'.repeat(difference)) + oct;
    if (pitch < MIN_PITCH || pitch > MAX_PITCH || Math.abs(difference) > 2) throw new Error('지원 범위를 벗어난 코드입니다. C4–C6 음역과 겹임시표까지 지원합니다.');
    return { pitch, spelling };
  });
  return { symbol: root + accidental + quality, tones };
}
// Pitches a chord symbol sounds with during playback and export; empty for symbols the parser rejects.
export function chordTones(symbol: string): number[] {
  try { return parseChord(symbol).tones.map(t => t.pitch); } catch { return []; }
}
export type AccompanimentPattern = 'quarter' | 'half' | 'eighth' | 'whole';
export const PATTERNS: { id: AccompanimentPattern; steps: number; label: string }[] = [
  { id: 'quarter', steps: 4, label: '4비트 · 박마다' }, { id: 'half', steps: 8, label: '2비트 · 반마디마다' },
  { id: 'eighth', steps: 2, label: '8비트 · 8분음표마다' }, { id: 'whole', steps: 16, label: '지속 · 코드가 바뀔 때만' },
];
// The accompaniment is generated from the chord symbols: block chords on the treble staff and the root an octave
// below on the bass staff, repeated in the chosen beat pattern until the chord ends. It is engraved, played and exported
// but never stored, so changing a symbol or the pattern regenerates it.
export function accompaniment(p: Project): { treble: Note[]; bass: Note[] } {
  const unit = (PATTERNS.find(x => x.id === p.accompaniment?.pattern) ?? PATTERNS[0]).steps;
  const treble: Note[] = [], bass: Note[] = [];
  for (const c of p.chords) {
    let tones: { pitch: number; spelling: string }[];
    try { tones = parseChord(c.symbol).tones; } catch { continue; }
    const root = tones[0], end = c.step + c.length;
    for (let at = c.step; at < end; at += unit) {
      const length = Math.min(unit, end - at);
      tones.forEach((t, i) => treble.push({ id: `${c.id}:${at}:${i}`, pitch: t.pitch, spelling: t.spelling, step: at, length, velocity: .45 }));
      bass.push({ id: `${c.id}:${at}:bass`, pitch: root.pitch - 12, spelling: root.spelling.slice(0, -1) + (Number(root.spelling.slice(-1)) - 1), step: at, length, velocity: .5 });
    }
  }
  return { treble, bass };
}
// Natural roots first so a one-letter query lists G, Gm, G7… before Gb and G#. Qualities are listed explicitly because
// object key order would put the numeric '6' and '7' first.
const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C#', 'Db', 'D#', 'Eb', 'F#', 'Gb', 'G#', 'Ab', 'A#', 'Bb'];
const QUALITY_ORDER = ['', 'm', '7', 'maj7', 'm7', 'dim', 'dim7', 'm7b5', 'aug', 'sus2', 'sus4', '6', 'm6'];
const DIATONIC: Record<Mode, { offset: number; triad: string; seventh: string; roman: string }[]> = {
  major: [{ offset: 0, triad: '', seventh: 'maj7', roman: 'I' }, { offset: 2, triad: 'm', seventh: 'm7', roman: 'ii' }, { offset: 4, triad: 'm', seventh: 'm7', roman: 'iii' }, { offset: 5, triad: '', seventh: 'maj7', roman: 'IV' }, { offset: 7, triad: '', seventh: '7', roman: 'V' }, { offset: 9, triad: 'm', seventh: 'm7', roman: 'vi' }, { offset: 11, triad: 'dim', seventh: 'm7b5', roman: 'vii°' }],
  minor: [{ offset: 0, triad: 'm', seventh: 'm7', roman: 'i' }, { offset: 2, triad: 'dim', seventh: 'm7b5', roman: 'ii°' }, { offset: 3, triad: '', seventh: 'maj7', roman: 'III' }, { offset: 5, triad: 'm', seventh: 'm7', roman: 'iv' }, { offset: 7, triad: 'm', seventh: 'm7', roman: 'v' }, { offset: 7, triad: '', seventh: '7', roman: 'V' }, { offset: 8, triad: '', seventh: 'maj7', roman: 'VI' }, { offset: 10, triad: '', seventh: '7', roman: 'VII' }],
};
export interface ChordOption { symbol: string; roman?: string }
// Every supported chord symbol for autocomplete. With a key signature, that key's diatonic chords come first, spelled the way the key spells them.
export function chordCatalog(key: KeySignature | null): ChordOption[] {
  const options: ChordOption[] = [];
  const seen = new Set<string>();
  const add = (symbol: string, roman?: string) => { if (!seen.has(symbol) && chordTones(symbol).length) { seen.add(symbol); options.push(roman ? { symbol, roman } : { symbol }); } };
  const k = findKey(key);
  if (k) {
    const tonic = spellingPitch(`${k.tonic}4`)! % 12;
    for (const degree of DIATONIC[k.mode]) {
      const root = keySpelling(60 + (tonic + degree.offset) % 12, key).slice(0, -1);
      add(root + degree.triad, degree.roman); add(root + degree.seventh, degree.roman + '7');
    }
  }
  for (const root of ROOTS) for (const quality of QUALITY_ORDER) add(root + quality);
  return options;
}
// Substring match (case-insensitive, ♯/♭ accepted): exact, then prefix, then contains; catalog order breaks ties.
export function chordMatches(catalog: ChordOption[], query: string, limit = 12): ChordOption[] {
  const q = query.trim().replaceAll('♯', '#').replaceAll('♭', 'b').toLowerCase();
  const rank = (symbol: string) => { const s = symbol.toLowerCase(); return !q ? 0 : s === q ? 0 : s.startsWith(q) ? 1 : s.includes(q) ? 2 : -1; };
  const ranked = catalog.map((option, index) => ({ option, index, rank: rank(option.symbol) })).filter(x => x.rank >= 0);
  return ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).slice(0, limit).map(x => x.option);
}
export function writeChord(p: Project, symbol: string, step: number, length: number, replaceId?: string): Project {
  if (!Number.isInteger(step) || step < 0 || step >= 128 || !Number.isInteger(length) || length < 1 || step + length > 128) throw new Error('코드의 위치와 길이가 8마디를 벗어납니다.');
  const parsed = parseChord(symbol);
  const old = p.chords.find(c => c.id === replaceId);
  if (p.chords.some(c => c.id !== replaceId && c.step === step)) throw new Error('같은 위치의 코드를 먼저 선택해 수정하세요.');
  if (!old && p.chords.length >= 128) throw new Error('코드는 최대 128개까지 추가할 수 있습니다.');
  const others = p.chords.filter(c => c.id !== replaceId);
  // Lead-sheet rule: a chord lasts until the next symbol, so neighbours are trimmed instead of overlapping.
  const next = others.filter(c => c.step > step).sort((a, b) => a.step - b.step)[0];
  const chord: Chord = { id: old?.id || crypto.randomUUID(), symbol: parsed.symbol, step, length: next ? Math.min(length, next.step - step) : length };
  const trimmed = others.map(c => c.step < step && c.step + c.length > step ? { ...c, length: step - c.step } : c);
  return { ...p, chords: [...trimmed, chord].sort((a, b) => a.step - b.step) };
}
export const removeChord = (p: Project, id: string): Project => ({ ...p, chords: p.chords.filter(c => c.id !== id) });
export const DURATIONS = [{ steps: 16, label: '온음표', code: 'w', dots: 0 }, { steps: 12, label: '점2분음표', code: 'h', dots: 1 }, { steps: 8, label: '2분음표', code: 'h', dots: 0 }, { steps: 6, label: '점4분음표', code: 'q', dots: 1 }, { steps: 4, label: '4분음표', code: 'q', dots: 0 }, { steps: 3, label: '점8분음표', code: '8', dots: 1 }, { steps: 2, label: '8분음표', code: '8', dots: 0 }, { steps: 1, label: '16분음표', code: '16', dots: 0 }];
export interface Segment { step: number; length: number; code: string; dots: number; note?: Note; fromPrevious: boolean; toNext: boolean }
export function segments(step: number, length: number, note?: Note): Segment[] {
  const end = step + length, result: Segment[] = [];
  for (let at = step; at < end;) {
    const available = Math.min(end - at, 16 - at % 16);
    const d = DURATIONS.find(d => d.steps <= available)!;
    result.push({ step: at, length: d.steps, code: d.code, dots: d.dots, note, fromPrevious: at > step, toNext: at + d.steps < end });
    at += d.steps;
  }
  return result;
}
export function restSegments(notes: Note[], bar: number): Segment[] {
  const start = bar * 16; const result: Segment[] = [];
  const occupied = Array.from({ length: 16 }, (_, i) => notes.some(n => n.step <= start + i && n.step + n.length > start + i));
  for (let i = 0; i < 16;) {
    if (occupied[i]) { i++; continue; }
    let end = i + 1; while (end < 16 && !occupied[end]) end++;
    result.push(...segments(start + i, end - i)); i = end;
  }
  return result;
}

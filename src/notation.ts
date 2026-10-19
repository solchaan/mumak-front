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
export function writeChord(p: Project, symbol: string, step: number, length: number, replaceId?: string): Project {
  if (!Number.isInteger(step) || step < 0 || step >= 128 || !Number.isInteger(length) || length < 1 || step + length > 128) throw new Error('코드의 위치와 길이가 8마디를 벗어납니다.');
  const parsed = parseChord(symbol);
  const old = p.chords.find(c => c.id === replaceId);
  const notes = p.notes.filter(n => !old?.noteIds.includes(n.id));
  if (notes.length + parsed.tones.length > 512) throw new Error('음표는 최대 512개까지 추가할 수 있습니다.');
  if (p.chords.some(c => c.id !== replaceId && c.step === step)) throw new Error('같은 위치의 코드를 먼저 선택해 수정하세요.');
  const added = parsed.tones.map(tone => ({ ...tone, id: crypto.randomUUID(), step, length, velocity: .7 }));
  const chord: Chord = { id: old?.id || crypto.randomUUID(), symbol: parsed.symbol, step, length, noteIds: added.map(n => n.id) };
  return { ...p, notes: [...notes, ...added], chords: [...p.chords.filter(c => c.id !== replaceId), chord].sort((a, b) => a.step - b.step) };
}
export function removeChord(p: Project, id: string): Project {
  const chord = p.chords.find(c => c.id === id);
  return { ...p, notes: p.notes.filter(n => !chord?.noteIds.includes(n.id)), chords: p.chords.filter(c => c.id !== id) };
}
// Editing individual chord tones detaches the symbol, while retaining every remaining note.
export function reconcileChords(before: Project, after: Project): Project {
  if (before.chords !== after.chords || before.notes === after.notes) return after;
  const old = new Map(before.notes.map(n => [n.id, n]));
  const next = new Map(after.notes.map(n => [n.id, n]));
  return { ...after, chords: after.chords.filter(c => c.noteIds.every(id => {
    const a = old.get(id), b = next.get(id);
    return a && b && a.pitch === b.pitch && a.step === b.step && a.length === b.length && a.spelling === b.spelling;
  })) };
}
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

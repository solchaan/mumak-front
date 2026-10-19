import type { Project } from './model';
import { writeChord } from './notation';

export interface Suggestion { symbol: string; roman: string; score: number; reason: string }
export interface Progression { name: string; symbols: string[]; chords: { symbol: string; step: number; length: number }[] }
export interface Harmony {
  key: { tonic: string; mode: 'major' | 'minor'; label: string; confidence: number; estimated: boolean };
  position: { step: number; length: number };
  previous: { symbol: string; roman: string | null } | null;
  suggestions: Suggestion[];
  progressions: Progression[];
}
// The suggestion request carries notes and chords only; recordings never leave the browser for this call.
export function suggestionPayload(p: Project, step: number, length: number) {
  return {
    step, length, key: p.key,
    notes: p.notes.map(({ id, pitch, step, length, velocity }) => ({ id, pitch, step, length, velocity })),
    chords: p.chords.map(({ symbol, step, length }) => ({ symbol, step, length })),
  };
}
// Writes a whole progression, replacing chords that already start at the same positions.
export function applyProgression(p: Project, chords: Progression['chords']): Project {
  return chords.reduce((acc, c) => writeChord(acc, c.symbol, c.step, c.length, acc.chords.find(x => x.step === c.step)?.id), p);
}

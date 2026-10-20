import type { Project } from './model';
import { findKey } from './notation';

export type StaveKind = 'melody' | 'treble' | 'bass';
export type View = 'melody' | 'both' | 'accompaniment';
// Which staves a system shows: the vocal line, the generated accompaniment as a grand staff, or both stacked.
export const VIEWS: Record<View, StaveKind[]> = { melody: ['melody'], both: ['melody', 'treble', 'bass'], accompaniment: ['treble', 'bass'] };
export const VIEW_LABELS: Record<View, string> = { melody: '멜로디만', both: '멜로디 + 반주', accompaniment: '반주만' };
export const SCORE_WIDTH = 920, STAVE_GAP = 100, BASE_ROW = 210;
export interface Geometry {
  width: number; start: number; cell: number; row: number; kinds: StaveKind[]; barsPerSystem: number;
  staveY: (k: number) => number; noteX: (index: number, step: number) => number; barX: (index: number) => number; barWidth: (index: number) => number;
}
// Proportional layout shared by the editor and the printed score: every 16th-note step gets the same width, the key
// signature widens the system header, and bars after the first continue on the same line without clef or key.
export function geometry(p: Project, view: View, barsPerSystem = 1, width = SCORE_WIDTH): Geometry {
  const kinds = VIEWS[view];
  const start = 130 + 7 * Math.abs(findKey(p.key)?.sharps ?? 0);
  const cell = Math.floor((width - 50 - start) / (16 * barsPerSystem));
  const barX = (index: number) => index === 0 ? 20 : start + index * 16 * cell - 12;
  const barWidth = (index: number) => (index === barsPerSystem - 1 ? width - 20 : start + (index + 1) * 16 * cell - 12) - barX(index);
  return { width, start, cell, kinds, barsPerSystem, row: BASE_ROW + (kinds.length - 1) * STAVE_GAP, staveY: k => 45 + k * STAVE_GAP, noteX: (index, step) => start + (index * 16 + step % 16) * cell, barX, barWidth };
}

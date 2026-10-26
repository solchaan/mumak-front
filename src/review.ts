import { parseProject, type Project } from './model';
import { suggestionPayload } from './harmony';
export interface Observation { code: string; step: number; location: string; title: string; detail: string; noteId?: string }
export type ReviewEdit = { kind: 'note'; noteId: string; step: number; length: number; fromPitch: number; pitch: number } | { kind: 'chord'; step: number; fromSymbol: string; symbol: string };
export interface Alternative { title: string; step: number; location: string; reason: string; edit: ReviewEdit }
export interface SketchReview {
  key: { tonic: string; mode: 'major' | 'minor'; estimated: boolean };
  good: Observation[]; consider: Observation[]; alternatives: Alternative[]; limitations: string[]; summary: string;
}
export const reviewFingerprint = (p: Project) => JSON.stringify([p.id, suggestionPayload(p, 0, 16)]);
export function applyReviewEdit(project: Project, edit: ReviewEdit): Project {
  if (edit.kind === 'note') {
    const note = project.notes.find(n => n.id === edit.noteId && n.pitch === edit.fromPitch && n.step === edit.step && n.length === edit.length);
    if (!note) throw new Error('음표가 변경되었습니다. 다시 평가해 주세요.');
    return parseProject({ ...project, notes: project.notes.map(n => n === note ? { ...n, pitch: edit.pitch, spelling: undefined } : n) });
  }
  const chord = project.chords.find(c => c.step === edit.step && c.symbol === edit.fromSymbol);
  if (!chord) throw new Error('코드가 변경되었습니다. 다시 평가해 주세요.');
  return parseProject({ ...project, chords: project.chords.map(c => c === chord ? { ...c, symbol: edit.symbol } : c) });
}

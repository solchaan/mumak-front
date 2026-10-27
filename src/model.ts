import { MIN_PITCH, MAX_PITCH, PATTERNS, findKey, parseChord, spellingPitch, type AccompanimentPattern, type KeySignature } from './notation';
export { MIN_PITCH, MAX_PITCH, type AccompanimentPattern, type KeySignature } from './notation';
export const STEPS = 128; // Default project length, for legacy callers.
export const MAX_BARS = 256;
export const totalSteps = (p: Pick<Project, 'bars'>) => p.bars * 16;
export function appendBar(p: Project): Project {
  if (p.bars >= MAX_BARS) return p;
  return { ...p, bars: p.bars + 1 };
}
export const PAGE_STEPS = 32;
export type Drum = 'kick' | 'snare' | 'hat';
export type Track = 'keys' | 'drums' | 'voice';
export type Instrument = 'soft' | 'pluck' | 'synth';
export interface Note { id: string; pitch: number; step: number; length: number; velocity: number; spelling?: string }
// A lead-sheet chord: a symbol above the staff with a position and duration. Its tones are played, not written as notes.
export interface Chord { id: string; symbol: string; step: number; length: number }
export interface Recording { dataUrl: string; duration: number; offset: number }
export interface Project {
  version: 1; id: string; title: string; bpm: number; bars: number; instrument: Instrument;
  notes: Note[]; chords: Chord[]; key: KeySignature | null; accompaniment: { pattern: AccompanimentPattern }; drums: Record<Drum, number[]>;
  mixer: Record<Track, { volume: number; mute: boolean }>;
  recording: Recording | null; updatedAt: string;
}
export interface Summary { id: string; title: string; bpm: number; updatedAt: string }
export const uid = () => crypto.randomUUID();
export const stepSeconds = (bpm: number) => 60 / bpm / 4;
export const duration = (p: Project) => totalSteps(p) * stepSeconds(p.bpm);
export function createProject(demo = false): Project {
  const p: Project = {
    version: 1, id: uid(), title: demo ? '늦은 오후의 스케치' : '새로운 아이디어', bpm: 96, bars: 8, instrument: 'soft',
    notes: [], chords: [], key: null, accompaniment: { pattern: 'quarter' }, drums: { kick: [], snare: [], hat: [] },
    mixer: { keys: { volume: .7, mute: false }, drums: { volume: .55, mute: false }, voice: { volume: .8, mute: false } },
    recording: null, updatedAt: new Date().toISOString(),
  };
  if (demo) {
    const chords = [[60, 64, 67], [60, 65, 69], [62, 67, 71], [60, 64, 69]];
    for (let bar = 0; bar < 8; bar++) {
      chords[bar % 4].forEach((pitch, i) => p.notes.push({ id: uid(), pitch, step: bar * 16 + i * 4, length: 3, velocity: .72 }));
      p.notes.push({ id: uid(), pitch: chords[bar % 4][1], step: bar * 16 + 12, length: 3, velocity: .5 });
      p.drums.kick.push(bar * 16, bar * 16 + 8, bar * 16 + 11);
      p.drums.snare.push(bar * 16 + 4, bar * 16 + 12);
      for (let s = 0; s < 16; s += 2) p.drums.hat.push(bar * 16 + s);
    }
  }
  return p;
}
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const bounded = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const integer = (x: unknown, min: number, max: number): x is number => bounded(x, min, max) && Number.isInteger(x);
export function parseProject(value: unknown): Project {
  const p = value as Project;
  const fail = () => { throw new Error('지원하지 않거나 손상된 Mumak 프로젝트입니다.'); };
  if (!p || p.version !== 1 || !idPattern.test(p.id) || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 100 || !integer(p.bars, 1, MAX_BARS) || !integer(p.bpm, 40, 240) || !['soft', 'pluck', 'synth'].includes(p.instrument)) fail();
  if (!Array.isArray(p.notes) || p.notes.length > p.bars * 64) fail();
  const ids = new Set();
  for (const n of p.notes) {
    if (!n || !idPattern.test(n.id) || ids.has(n.id) || !integer(n.pitch, MIN_PITCH, MAX_PITCH) || !integer(n.step, 0, totalSteps(p) - 1) || !integer(n.length, 1, totalSteps(p) - n.step) || !bounded(n.velocity, .01, 1)) fail();
    if (n.spelling !== undefined && (typeof n.spelling !== 'string' || spellingPitch(n.spelling) !== n.pitch)) fail();
    ids.add(n.id);
  }
  const chords = p.chords === undefined ? [] : p.chords;
  if (!Array.isArray(chords) || chords.length > totalSteps(p)) fail();
  const chordIds = new Set(), chordSteps = new Set(), legacyTones = new Set<string>();
  for (const c of chords) {
    if (!c || !idPattern.test(c.id) || chordIds.has(c.id) || !integer(c.step, 0, totalSteps(p) - 1) || chordSteps.has(c.step) || !integer(c.length, 1, totalSteps(p) - c.step) || typeof c.symbol !== 'string' || c.symbol.length > 12) fail();
    try { parseChord(c.symbol); } catch { fail(); }
    // Files from before the lead-sheet layout stored generated chord tones as notes. Drop those notes: the chord now sounds on its own.
    const legacy = (c as Chord & { noteIds?: unknown }).noteIds;
    if (legacy !== undefined) {
      const ids: unknown[] | null = Array.isArray(legacy) ? legacy : null;
      if (!ids || ids.length > 8 || ids.some(id => typeof id !== 'string')) fail();
      ids?.forEach(id => legacyTones.add(id as string));
    }
    chordIds.add(c.id); chordSteps.add(c.step);
  }
  for (const k of ['kick', 'snare', 'hat'] as const) {
    if (!Array.isArray(p.drums?.[k]) || p.drums[k].length > totalSteps(p) || p.drums[k].some(s => !integer(s, 0, totalSteps(p) - 1)) || new Set(p.drums[k]).size !== p.drums[k].length) fail();
  }
  for (const k of ['keys', 'drums', 'voice'] as const) if (!bounded(p.mixer?.[k]?.volume, 0, 1) || typeof p.mixer[k].mute !== 'boolean') fail();
  if (p.recording !== null) {
    const r = p.recording;
    if (!r || !bounded(r.duration, .01, MAX_BARS * 6 + 5) || !bounded(r.offset, -5, 48) || typeof r.dataUrl !== 'string' || r.dataUrl.length > 28_000_000 || !/^data:audio\/[a-z0-9.+-]+(?:;codecs=[a-z0-9.,-]+)?;base64,[A-Za-z0-9+/]+={0,2}$/i.test(r.dataUrl)) fail();
  }
  if (typeof p.updatedAt !== 'string' || !Number.isFinite(Date.parse(p.updatedAt))) fail();
  // Older files carry no key signature; treat it as unset rather than rejecting them.
  const key = p.key === undefined ? null : p.key;
  if (key !== null && (!key || typeof key !== 'object' || !findKey(key))) fail();
  // Chord accompaniment defaults to four beats per bar when a file predates the setting.
  const accompaniment = p.accompaniment === undefined ? { pattern: 'quarter' as const } : p.accompaniment;
  if (!accompaniment || typeof accompaniment !== 'object' || !PATTERNS.some(x => x.id === accompaniment.pattern)) fail();
  return {
    ...p,
    notes: legacyTones.size ? p.notes.filter(n => !legacyTones.has(n.id)) : p.notes,
    chords: chords.map(({ id, symbol, step, length }) => ({ id, symbol, step, length })).sort((a, b) => a.step - b.step),
    key: key === null ? null : { tonic: key.tonic, mode: key.mode },
    accompaniment: { pattern: accompaniment.pattern },
  };
}
export function moveNote(note: Note, step: number, pitch: number, steps = STEPS): Note {
  const movedPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.round(pitch)));
  return { ...note, step: Math.max(0, Math.min(steps - note.length, Math.round(step))), pitch: movedPitch, ...(movedPitch !== note.pitch ? { spelling: undefined } : {}) };
}

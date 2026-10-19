export const STEPS = 128;
export const PAGE_STEPS = 32;
export type Drum = 'kick' | 'snare' | 'hat';
export type Track = 'keys' | 'drums' | 'voice';
export type Instrument = 'soft' | 'pluck' | 'synth';
export interface Note { id: string; pitch: number; step: number; length: number; velocity: number }
export interface Recording { dataUrl: string; duration: number; offset: number }
export interface Project {
  version: 1; id: string; title: string; bpm: number; bars: 8; instrument: Instrument;
  notes: Note[]; drums: Record<Drum, number[]>;
  mixer: Record<Track, { volume: number; mute: boolean }>;
  recording: Recording | null; updatedAt: string;
}
export interface Summary { id: string; title: string; bpm: number; updatedAt: string }
export const uid = () => crypto.randomUUID();
export const stepSeconds = (bpm: number) => 60 / bpm / 4;
export const duration = (p: Project) => STEPS * stepSeconds(p.bpm);
export function createProject(demo = false): Project {
  const p: Project = {
    version: 1, id: uid(), title: demo ? '늦은 오후의 스케치' : '새로운 아이디어', bpm: 96, bars: 8, instrument: 'soft',
    notes: [], drums: { kick: [], snare: [], hat: [] },
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
  if (!p || p.version !== 1 || !idPattern.test(p.id) || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 100 || p.bars !== 8 || !integer(p.bpm, 40, 240) || !['soft', 'pluck', 'synth'].includes(p.instrument)) fail();
  if (!Array.isArray(p.notes) || p.notes.length > 512) fail();
  const ids = new Set();
  for (const n of p.notes) {
    if (!n || !idPattern.test(n.id) || ids.has(n.id) || !integer(n.pitch, 60, 72) || !integer(n.step, 0, 127) || !integer(n.length, 1, 128 - n.step) || !bounded(n.velocity, .01, 1)) fail();
    ids.add(n.id);
  }
  for (const k of ['kick', 'snare', 'hat'] as const) {
    if (!Array.isArray(p.drums?.[k]) || p.drums[k].length > 128 || p.drums[k].some(s => !integer(s, 0, 127)) || new Set(p.drums[k]).size !== p.drums[k].length) fail();
  }
  for (const k of ['keys', 'drums', 'voice'] as const) if (!bounded(p.mixer?.[k]?.volume, 0, 1) || typeof p.mixer[k].mute !== 'boolean') fail();
  if (p.recording !== null) {
    const r = p.recording;
    if (!r || !bounded(r.duration, .01, 120) || !bounded(r.offset, -5, 48) || typeof r.dataUrl !== 'string' || r.dataUrl.length > 28_000_000 || !/^data:audio\/[a-z0-9.+-]+(?:;codecs=[a-z0-9.,-]+)?;base64,[A-Za-z0-9+/]+={0,2}$/i.test(r.dataUrl)) fail();
  }
  if (typeof p.updatedAt !== 'string' || !Number.isFinite(Date.parse(p.updatedAt))) fail();
  return p;
}
export function moveNote(note: Note, step: number, pitch: number): Note {
  return { ...note, step: Math.max(0, Math.min(STEPS - note.length, Math.round(step))), pitch: Math.max(60, Math.min(72, Math.round(pitch))) };
}

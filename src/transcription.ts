import { MAX_BARS, MAX_PITCH, MIN_PITCH, stepSeconds, uid, type Note, type Project } from './model';

export interface DetectedNote { pitch: number; start: number; end: number; confidence: number }
export interface PitchFrame { pitch: number | null; time: number; confidence: number }

// Cumulative mean normalized difference and the first threshold minimum (YIN).
// de Cheveigné & Kawahara (2002), https://doi.org/10.1121/1.1458024
// Frames are 64 ms at 16 kHz; 32 ms of samples are compared over lags for C2–C6.
export function detectPitch(samples: Float32Array, offset: number, sampleRate: number): { pitch: number; confidence: number } | null {
  const window = Math.round(sampleRate * .032);
  const maxLag = Math.ceil(sampleRate / 65), minLag = Math.max(2, Math.floor(sampleRate / 1100));
  if (offset < 0 || offset + window + maxLag >= samples.length) return null;
  let energy = 0, mean = 0;
  for (let i = 0; i < window; i++) mean += samples[offset + i];
  mean /= window;
  for (let i = 0; i < window; i++) energy += (samples[offset + i] - mean) ** 2;
  if (Math.sqrt(energy / window) < .008) return null;
  const difference = new Float32Array(maxLag + 1);
  difference[0] = 1;
  let sum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let d = 0;
    for (let i = 0; i < window; i++) d += (samples[offset + i] - samples[offset + i + lag]) ** 2;
    sum += d; difference[lag] = sum ? d * lag / sum : 1;
  }
  for (let lag = minLag; lag < maxLag; lag++) {
    if (difference[lag] >= .15) continue;
    while (lag + 1 < maxLag && difference[lag + 1] < difference[lag]) lag++;
    const a = difference[lag - 1], b = difference[lag], c = difference[lag + 1];
    const denominator = 2 * (a - 2 * b + c);
    const refined = lag + (denominator ? (a - c) / denominator : 0);
    const pitch = 69 + 12 * Math.log2(sampleRate / refined / 440);
    return pitch >= 35.5 && pitch <= 84.5 ? { pitch, confidence: 1 - b } : null;
  }
  return null;
}

// A three-frame median removes short pitch spikes; sustained notes are separated by silence.
export function segmentFrames(frames: PitchFrame[], duration: number, hop = .02): DetectedNote[] {
  const pitches = frames.map((frame, i) => {
    if (frame.pitch === null) return null;
    const nearby = frames.slice(Math.max(0, i - 1), i + 2).flatMap(f => f.pitch === null ? [] : [f.pitch]).sort((a, b) => a - b);
    return Math.round(nearby[Math.floor(nearby.length / 2)]);
  });
  const notes: DetectedNote[] = [];
  for (let i = 0; i < frames.length;) {
    const pitch = pitches[i]; const begin = i;
    while (++i < frames.length && pitches[i] === pitch) { /* Group stable frames. */ }
    const start = Math.max(0, frames[begin].time - hop / 2);
    const end = Math.min(duration, frames[i - 1].time + hop / 2);
    if (pitch !== null && end - start >= .06) notes.push({ pitch, start, end, confidence: frames.slice(begin, i).reduce((sum, f) => sum + f.confidence, 0) / (i - begin) });
  }
  return notes;
}

export function suggestedOctave(notes: DetectedNote[]): number {
  let best = 0, bestWeight = -1;
  for (const shift of [0, 1, -1, 2, -2, 3]) {
    const weight = notes.filter(n => n.pitch + shift * 12 >= MIN_PITCH && n.pitch + shift * 12 <= MAX_PITCH).reduce((sum, n) => sum + n.end - n.start, 0);
    if (weight > bestWeight) { best = shift; bestWeight = weight; }
  }
  return best;
}

export function quantizeMelody(detected: DetectedNote[], bpm: number, offset: number, octave: number) {
  const unit = stepSeconds(bpm), notes: Omit<Note, 'id'>[] = [];
  let omitted = 0;
  for (const n of detected) {
    const pitch = n.pitch + octave * 12;
    const start = Math.round((n.start + offset) / unit), end = Math.round((n.end + offset) / unit);
    if (pitch < MIN_PITCH || pitch > MAX_PITCH || n.end + offset <= 0 || start >= MAX_BARS * 16) { omitted++; continue; }
    const step = Math.max(0, start);
    const last = notes.at(-1);
    // Rounding must not create overlapping monophonic notes or zero-length notes.
    if (last && last.step + last.length > step) {
      if (last.step === step) { omitted++; continue; }
      last.length = step - last.step;
    }
    notes.push({ pitch, step, length: Math.min(MAX_BARS * 16 - step, Math.max(1, end - step)), velocity: .75 });
  }
  return { notes, omitted };
}

export function addTranscribedNotes(project: Project, notes: Omit<Note, 'id'>[], muteRecording: boolean): Project {
  if (!notes.length) throw new Error('추가할 음표가 없습니다.');
  const bars = Math.max(project.bars, Math.ceil(Math.max(...notes.map(n => n.step + n.length)) / 16));
  if (bars > MAX_BARS || project.notes.length + notes.length > bars * 64) throw new Error('프로젝트의 마디 또는 음표 한도를 초과합니다.');
  return { ...project, bars, notes: [...project.notes, ...notes.map(n => ({ ...n, id: uid() }))], mixer: { ...project.mixer, voice: { ...project.mixer.voice, mute: muteRecording || project.mixer.voice.mute } } };
}

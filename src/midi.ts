import { type Project } from './model';
function variable(value: number): number[] {
  const bytes = [value & 127];
  while ((value >>= 7) > 0) bytes.unshift((value & 127) | 128);
  return bytes;
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
export function midiBytes(p: Project): Uint8Array {
  const events: { tick: number; data: number[]; order: number }[] = [];
  const tempo = Math.round(60_000_000 / p.bpm);
  events.push({ tick: 0, data: [255, 81, 3, ...u32(tempo).slice(1)], order: -2 });
  events.push({ tick: 0, data: [255, 88, 4, 4, 2, 24, 8], order: -1 });
  for (const n of p.notes) {
    events.push({ tick: n.step * 120, data: [0x90, n.pitch, Math.round(n.velocity * 127)], order: 1 });
    events.push({ tick: (n.step + n.length) * 120, data: [0x80, n.pitch, 0], order: 0 });
  }
  for (const [kind, pitch] of [['kick', 36], ['snare', 38], ['hat', 42]] as const) for (const step of p.drums[kind]) {
    events.push({ tick: step * 120, data: [0x99, pitch, 90], order: 1 });
    events.push({ tick: step * 120 + 60, data: [0x89, pitch, 0], order: 0 });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  let last = 0;
  const track: number[] = [];
  for (const event of events) { track.push(...variable(event.tick - last), ...event.data); last = event.tick; }
  track.push(...variable(128 * 120 - last), 255, 47, 0);
  return new Uint8Array([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107, ...u32(track.length), ...track]);
}

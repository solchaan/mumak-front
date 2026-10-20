import { Accidental, Dot, ModifierContext, Stave, StaveConnector, StaveNote, StaveTie, TickContext, type RenderContext } from 'vexflow';
import type { Note, Project } from './model';
import { keyAccidentals, keySpelling, restSegments, segments, staffPosition, vexKey, type Segment } from './notation';
import type { Geometry } from './layout';

export interface Hit { note: Note; step: number; x: number; y: number; system: number }
export interface SystemOptions {
  context: RenderContext; project: Project; acc: { treble: Note[]; bass: Note[] }; geometry: Geometry;
  bars: number[]; y: number; system: number; chordLabels?: boolean; barNumbers?: boolean; onHit?: (hit: Hit) => void;
}
// Engraves one system (a line of bars) at vertical offset y: every stave kind in the geometry, with accidentals carried
// through each bar, ties across bars, and optional chord symbols and bar numbers for the printed score.
export function engraveSystem({ context, project, acc, geometry: g, bars, y, system, chordLabels, barNumbers, onHit }: SystemOptions) {
  const keyAcc = keyAccidentals(project.key);
  const spell = (n: Note) => n.spelling || keySpelling(n.pitch, project.key);
  const fragments = new Map<string, { vf: StaveNote; index: number; segment: Segment }[]>();
  const staves = bars.map((bar, index) => g.kinds.map((kind, k) => {
    const stave = new Stave(g.barX(index), y + g.staveY(k), g.barWidth(index));
    if (index === 0) {
      stave.addClef(kind === 'bass' ? 'bass' : 'treble');
      if (project.key) stave.addKeySignature(vexKey(project.key));
      stave.addTimeSignature('4/4');
    }
    stave.setContext(context).draw();
    const clef = kind === 'bass' ? 'bass' : 'treble';
    const items = kind === 'melody' ? project.notes : kind === 'treble' ? acc.treble : acc.bass;
    const groups = new Map<string, Segment[]>();
    for (const n of items) for (const segment of segments(n.step, n.length, n)) {
      if (Math.floor(segment.step / 16) !== bar) continue;
      const key = `${segment.step}:${segment.length}`;
      groups.set(key, [...(groups.get(key) || []), segment]);
    }
    const events = [...groups.values(), ...restSegments(items, bar).map(r => [r])].sort((a, b) => a[0].step - b[0].step || b[0].length - a[0].length);
    // Accidentals carry through the bar; the key signature sets each letter's starting state.
    const accidentals = new Map<string, string>();
    const atTick = new Map<number, number>();
    for (const group of events) {
      group.sort((a, b) => staffPosition(a.note ? spell(a.note) : 'B4') - staffPosition(b.note ? spell(b.note) : 'B4'));
      const first = group[0], rest = !first.note;
      const spellings = group.map(s => s.note ? spell(s.note) : 'B4');
      const vf = new StaveNote({ clef, keys: rest ? [clef === 'bass' ? 'd/3' : 'b/4'] : spellings.map(s => s.slice(0, -1).toLowerCase() + '/' + s.slice(-1)), duration: first.code + (rest ? 'r' : ''), auto_stem: true });
      vf.setStave(stave).setContext(context);
      if (first.dots) Dot.buildAndAttach([vf], { all: true });
      if (!rest) spellings.forEach((spelling, i) => {
        const naturalKey = spelling[0] + spelling.slice(-1), accidental = spelling.slice(1, -1);
        if ((accidentals.get(naturalKey) ?? keyAcc[spelling[0]]) !== accidental) vf.addModifier(new Accidental(accidental || 'n'), i);
        accidentals.set(naturalKey, accidental);
      });
      const modifiers = new ModifierContext(); vf.addToModifierContext(modifiers); modifiers.preFormat();
      const tick = new TickContext().addTickable(vf).preFormat().setX(0);
      // Offset different-duration voices at the same onset slightly to keep stems readable.
      const voiceIndex = atTick.get(first.step) || 0; atTick.set(first.step, voiceIndex + 1);
      tick.setX(g.noteX(index, first.step) - vf.getAbsoluteX() + voiceIndex * 12);
      vf.draw();
      if (!rest) group.forEach((s, i) => {
        const n = s.note!;
        if (kind === 'melody') onHit?.({ note: n, step: s.step, x: vf.getAbsoluteX() + 6, y: vf.getYs()[i], system });
        fragments.set(n.id, [...(fragments.get(n.id) || []), { vf, index: i, segment: s }]);
      });
    }
    return stave;
  }));
  const treble = g.kinds.indexOf('treble');
  if (treble >= 0) new StaveConnector(staves[0][treble], staves[0][treble + 1]).setType(StaveConnector.type.BRACE).setContext(context).draw();
  if (barNumbers || chordLabels) bars.forEach((bar, index) => {
    context.save();
    if (barNumbers) { context.setFont('DM Sans', 9, ''); context.fillText(String(bar + 1), g.barX(index) + 2, y + g.staveY(0) - 2); }
    if (chordLabels) { context.setFont('DM Sans', 15, 'bold'); for (const c of project.chords) if (Math.floor(c.step / 16) === bar) context.fillText(c.symbol, g.noteX(index, c.step) - 2, y + g.staveY(0) - 12); }
    context.restore();
  });
  for (const items of fragments.values()) items.forEach((item, i) => {
    const previous = items[i - 1], next = items[i + 1];
    if (item.segment.fromPrevious && !previous) new StaveTie({ last_note: item.vf, last_indices: [item.index] }).setContext(context).draw();
    if (item.segment.toNext) new StaveTie({ first_note: item.vf, first_indices: [item.index], last_note: next?.vf, last_indices: next ? [next.index] : undefined }).setContext(context).draw();
  });
}

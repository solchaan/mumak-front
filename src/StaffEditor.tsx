import { useEffect, useRef, useState } from 'react';
import { Accidental, Dot, ModifierContext, Renderer, Stave, StaveNote, StaveTie, TickContext } from 'vexflow';
import { moveNote, uid, type Note, type Project } from './model';
import { DURATIONS, MIN_PITCH, MAX_PITCH, parseChord, pitchSpelling, positionSpelling, reconcileChords, removeChord, restSegments, segments, spellingPitch, staffPosition, writeChord, type Segment } from './notation';
import './staff.css';

const WIDTH = 920, HEIGHT = 430, START = 130, CELL = 46, ROW = 210;
const noteX = (step: number) => START + (step % 16) * CELL;
const staveY = (row: number) => 45 + row * ROW;
interface Hit { note: Note; step: number; x: number; y: number; row: number }
interface Props { project: Project; page: number; step: number; selected: string | null; select: (id: string | null) => void; change: (project: Project) => void; preview: (pitch: number) => void; disabled: boolean }

export default function StaffEditor({ project, page, step, selected, select, change, preview, disabled }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [length, setLength] = useState(4);
  const [accidental, setAccidental] = useState<'' | '#' | 'b'>('');
  const [symbol, setSymbol] = useState('C');
  const [localStep, setLocalStep] = useState(0);
  const [pitchInput, setPitchInput] = useState('C4');
  const [chordId, setChordId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [renderError, setRenderError] = useState('');
  const chord = project.chords.find(c => c.id === chordId);
  const selectedNote = project.notes.find(n => n.id === selected);
  const start = page * 32;

  useEffect(() => { setLocalStep(0); setChordId(null); }, [page, project.id]);
  useEffect(() => {
    if (!canvas.current) return;
    canvas.current.replaceChildren();
    try {
      const renderer = new Renderer(canvas.current, Renderer.Backends.SVG);
      renderer.resize(WIDTH, HEIGHT);
      const context = renderer.getContext();
      context.setFillStyle('#293126').setStrokeStyle('#293126');
      const nextHits: Hit[] = [];
      const fragments = new Map<string, { vf: StaveNote; index: number; row: number; segment: Segment }[]>();
      for (let row = 0; row < 2; row++) {
        const bar = page * 2 + row;
        const stave = new Stave(20, staveY(row), WIDTH - 40);
        stave.addClef('treble').addTimeSignature('4/4').setContext(context).draw();
        const groups = new Map<string, Segment[]>();
        for (const n of project.notes) for (const segment of segments(n.step, n.length, n)) {
          if (Math.floor(segment.step / 16) !== bar) continue;
          const key = `${segment.step}:${segment.length}`;
          groups.set(key, [...(groups.get(key) || []), segment]);
        }
        const events = [...groups.values(), ...restSegments(project.notes, bar).map(r => [r])].sort((a, b) => a[0].step - b[0].step || b[0].length - a[0].length);
        const accidentals = new Map<string, string>();
        const atTick = new Map<number, number>();
        for (const group of events) {
          group.sort((a, b) => staffPosition(a.note?.spelling || pitchSpelling(a.note?.pitch || 71)) - staffPosition(b.note?.spelling || pitchSpelling(b.note?.pitch || 71)));
          const first = group[0], rest = !first.note;
          const spellings = group.map(s => s.note?.spelling || pitchSpelling(s.note?.pitch || 71));
          const vf = new StaveNote({ clef: 'treble', keys: rest ? ['b/4'] : spellings.map(s => s.slice(0, -1).toLowerCase() + '/' + s.slice(-1)), duration: first.code + (rest ? 'r' : ''), auto_stem: true });
          vf.setStave(stave).setContext(context);
          if (first.dots) Dot.buildAndAttach([vf], { all: true });
          if (!rest) spellings.forEach((spelling, i) => {
            const naturalKey = spelling[0] + spelling.slice(-1), acc = spelling.slice(1, -1);
            if ((accidentals.get(naturalKey) || '') !== acc) vf.addModifier(new Accidental(acc || 'n'), i);
            accidentals.set(naturalKey, acc);
          });
          const modifiers = new ModifierContext(); vf.addToModifierContext(modifiers); modifiers.preFormat();
          const tick = new TickContext().addTickable(vf).preFormat().setX(0);
          // Offset different-duration voices at the same onset slightly to keep stems readable.
          const voiceIndex = atTick.get(first.step) || 0; atTick.set(first.step, voiceIndex + 1);
          tick.setX(noteX(first.step) - vf.getAbsoluteX() + voiceIndex * 12);
          vf.draw();
          if (!rest) group.forEach((s, index) => {
            const n = s.note!;
            nextHits.push({ note: n, step: s.step, x: vf.getAbsoluteX() + 6, y: vf.getYs()[index], row });
            fragments.set(n.id, [...(fragments.get(n.id) || []), { vf, index, row, segment: s }]);
          });
        }
      }
      for (const items of fragments.values()) items.forEach((item, index) => {
        const previous = items[index - 1], next = items[index + 1];
        if (item.segment.fromPrevious && (!previous || previous.row !== item.row)) new StaveTie({ last_note: item.vf, last_indices: [item.index] }).setContext(context).draw();
        if (item.segment.toNext) new StaveTie({ first_note: item.vf, first_indices: [item.index], last_note: next?.row === item.row ? next.vf : undefined, last_indices: next?.row === item.row ? [next.index] : undefined }).setContext(context).draw();
      });
      const svg = canvas.current.querySelector('svg');
      svg?.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`); svg?.setAttribute('aria-hidden', 'true');
      setHits(nextHits); setRenderError('');
    } catch (e) { setRenderError(`악보를 표시하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`); }
  }, [project.notes, page]);

  function addNote(pitch: number, spelling: string, at = start + localStep) {
    if (disabled) return;
    if (project.notes.length >= 512) { setError('음표는 최대 512개까지 추가할 수 있습니다.'); return; }
    if (pitch < MIN_PITCH || pitch > MAX_PITCH) { setError('C4–C6 범위의 음표를 선택하세요.'); return; }
    if (at + length > 128) { setError('음표 길이가 8마디를 벗어납니다. 길이를 줄여 주세요.'); return; }
    const note = { id: uid(), pitch, spelling, step: at, length, velocity: .75 };
    change({ ...project, notes: [...project.notes, note] }); select(note.id); setChordId(null); preview(pitch); setError('');
  }
  function saveChord() {
    if (disabled) return;
    try {
      const next = writeChord(project, symbol, start + localStep, length, chord?.id);
      change(next); select(null); setChordId(next.chords.find(c => c.step === start + localStep)!.id); setError('');
      parseChord(symbol).tones.forEach(t => preview(t.pitch));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  function chooseChord(id: string) {
    const chosen = project.chords.find(c => c.id === id)!;
    setChordId(id); select(null); setSymbol(chosen.symbol); setLocalStep(chosen.step - start); setLength(chosen.length); setError('');
  }
  function editNote(pitch: number) {
    if (!selectedNote) return;
    change(reconcileChords(project, { ...project, notes: project.notes.map(n => n.id === selectedNote.id ? moveNote(n, n.step, pitch) : n) }));
  }
  return <div className="staff-editor">
    <div className="staff-toolbar">
      <label>음표 길이<select aria-label="오선지 음표 길이" disabled={disabled} value={length} onChange={e => setLength(Number(e.target.value))}>{DURATIONS.map(d => <option key={d.steps} value={d.steps}>{d.label}</option>)}{!DURATIONS.some(d => d.steps === length) && <option value={length}>{length}칸</option>}</select></label>
      <div className="accidental-buttons" role="group" aria-label="임시표">{([['', '♮', '제자리표'], ['#', '♯', '올림표'], ['b', '♭', '내림표']] as const).map(([value, label, name]) => <button key={name} disabled={disabled} aria-label={name} aria-pressed={accidental === value} onClick={() => setAccidental(value)}>{label}</button>)}</div>
      <span className="staff-range">높은음자리표 · C4–C6</span>
    </div>
    <div className="staff-inputs">
      <label>입력 위치<select aria-label="오선지 입력 위치" disabled={disabled} value={localStep} onChange={e => setLocalStep(Number(e.target.value))}>{Array.from({ length: 32 }, (_, i) => <option key={i} value={i}>{page * 2 + Math.floor(i / 16) + 1}마디 {Math.floor(i % 16 / 4) + 1}박{i % 4 ? ` + ${i % 4}/16` : ''}</option>)}</select></label>
      <label>음높이<select aria-label="오선지 입력 음높이" disabled={disabled} value={pitchInput} onChange={e => setPitchInput(e.target.value)}>{Array.from({ length: 15 }, (_, i) => positionSpelling(i)).map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <button className="outline-button" disabled={disabled} onClick={() => { const s = pitchInput[0] + accidental + pitchInput.slice(-1); addNote(spellingPitch(s)!, s); }}>음표 추가</button>
    </div>
    <form className="chord-form" onSubmit={e => { e.preventDefault(); saveChord(); }}>
      <label>코드 이름<input aria-label="코드 이름" maxLength={12} value={symbol} placeholder="C, Am, G7, Bbmaj7" disabled={disabled} onChange={e => setSymbol(e.target.value)}/></label>
      <button className="export-button" disabled={disabled} type="submit">{chord ? '코드 수정' : '코드 추가'}</button>
      {chord && <><button type="button" className="text-button" disabled={disabled} onClick={() => { change(removeChord(project, chord.id)); setChordId(null); }}>코드 삭제</button><button type="button" className="text-button" disabled={disabled} onClick={() => { setChordId(null); select(null); }}>선택 해제</button></>}
      <span>선택한 위치·길이로 화음과 코드 기호를 함께 입력</span>
    </form>
    {(error || renderError) && <p className="staff-error" role="alert">{error || renderError}</p>}
    <div className="staff-scroll"><div className="staff-paper" style={{ width: WIDTH, height: HEIGHT }}>
      <div ref={canvas} className="staff-engraving"/>
      <svg className="staff-overlay" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label={`${page * 2 + 1}–${page * 2 + 2}마디 오선지`} onPointerDown={event => {
        if (disabled || event.button !== 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) * WIDTH / rect.width, y = (event.clientY - rect.top) * HEIGHT / rect.height;
        const row = Math.floor(y / ROW); if (row < 0 || row > 1 || x < START - 15 || x > START + CELL * 16) return;
        const position = Math.round((staveY(row) + 90 - y) / 5);
        if (position < 0 || position > 14) return;
        const local = row * 16 + Math.max(0, Math.min(15, Math.round((x - START) / CELL)));
        setLocalStep(local); const spelling = positionSpelling(position, accidental);
        addNote(spellingPitch(spelling)!, spelling, start + local);
      }}>
        {[0, 1].map(row => <g key={row} pointerEvents="none">
          <text x="22" y={22 + row * ROW} className="staff-bar-label">{page * 2 + row + 1} 마디</text>
          {Array.from({ length: 16 }, (_, i) => <g key={i}><line x1={START + i * CELL} x2={START + i * CELL} y1={65 + row * ROW} y2={155 + row * ROW} className={i % 4 === 0 ? 'staff-beat-line' : 'staff-grid-line'}/><text x={START + i * CELL} y={178 + row * ROW} className="staff-beat-label">{i % 4 === 0 ? `${i / 4 + 1}박` : '·'}</text></g>)}
        </g>)}
        <line className="staff-cursor" pointerEvents="none" x1={noteX(localStep)} x2={noteX(localStep)} y1={60 + Math.floor(localStep / 16) * ROW} y2={158 + Math.floor(localStep / 16) * ROW}/>
        {project.chords.filter(c => c.step >= start && c.step < start + 32).map(c => <g role="button" tabIndex={disabled ? -1 : 0} className={`staff-chord ${c.id === chord?.id ? 'active' : ''}`} key={c.id} aria-label={`코드 ${c.symbol}, ${Math.floor(c.step / 16) + 1}마디`} onPointerDown={e => { e.stopPropagation(); if (!disabled) chooseChord(c.id); }} onKeyDown={e => { if (!disabled && ['Enter', ' '].includes(e.key)) { e.preventDefault(); chooseChord(c.id); } }}><rect x={noteX(c.step) - 8} y={24 + Math.floor((c.step - start) / 16) * ROW} width={Math.max(38, c.symbol.length * 9 + 16)} height="26" rx="5"/><text x={noteX(c.step)} y={42 + Math.floor((c.step - start) / 16) * ROW}>{c.symbol}</text></g>)}
        {hits.map(hit => <g key={`${hit.note.id}:${hit.step}`} role="button" tabIndex={disabled ? -1 : 0} className={`staff-note ${hit.note.id === selected ? 'selected' : ''}`} data-pitch={hit.note.pitch} data-step={hit.step} aria-label={`음표 ${hit.note.spelling || pitchSpelling(hit.note.pitch)}, ${hit.note.length}칸`}
          onPointerDown={e => { e.stopPropagation(); if (disabled || e.button !== 0) return; select(hit.note.id); setChordId(null); setLocalStep(Math.max(0, hit.note.step - start)); preview(hit.note.pitch); }}
          onContextMenu={e => { e.preventDefault(); if (!disabled) { change({ ...project, notes: project.notes.filter(n => n.id !== hit.note.id) }); select(null); } }}
          onKeyDown={e => {
            if (disabled) return;
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); change({ ...project, notes: project.notes.filter(n => n.id !== hit.note.id) }); select(null); }
            else if (e.key.startsWith('Arrow')) { e.preventDefault(); change({ ...project, notes: project.notes.map(n => n.id === hit.note.id ? moveNote(n, n.step + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0), n.pitch + (e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0)) : n) }); }
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(hit.note.id); setChordId(null); preview(hit.note.pitch); }
          }}><rect x={hit.x - 12} y={hit.y - 5} width="25" height="10" rx="4"/></g>)}
        {step >= start && step < start + 32 && <line className="staff-playhead" pointerEvents="none" x1={noteX(step)} x2={noteX(step)} y1={55 + Math.floor((step - start) / 16) * ROW} y2={158 + Math.floor((step - start) / 16) * ROW}/>}
      </svg>
    </div></div>
    <div className="staff-help">오선지 클릭으로 입력 · 음표 선택 후 방향키로 이동 · 우클릭/Delete로 삭제 · 빈 구간은 쉼표로 표시</div>
    {selectedNote && <div className="staff-selected"><label>선택 음높이<select aria-label="선택한 음표 음높이" value={selectedNote.pitch} disabled={disabled} onChange={e => editNote(Number(e.target.value))}>{Array.from({ length: MAX_PITCH - MIN_PITCH + 1 }, (_, i) => i + MIN_PITCH).map(pitch => <option key={pitch} value={pitch}>{pitchSpelling(pitch)}</option>)}</select></label><span>길이·세기는 아래에서 편집합니다. 코드 구성음을 따로 수정하면 코드 기호가 해제됩니다.</span></div>}
  </div>;
}

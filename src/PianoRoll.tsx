import { NoteDuration, useNoteHold } from './NoteDuration';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { MAX_PITCH, MIN_PITCH, moveNote, uid, type Note } from './model';
import { pitchSpelling } from './notation';

const W = 1024, H = (MAX_PITCH - MIN_PITCH + 1) * 24, CELL = 32, ROW = 24;
const labels = Array.from({ length: MAX_PITCH - MIN_PITCH + 1 }, (_, i) => pitchSpelling(MAX_PITCH - i).replace('#', '♯'));
interface Props { notes: Note[]; bars: number; page: number; step: number; selected: string | null; select: (id: string | null) => void; change: (notes: Note[]) => void; preview: (pitch: number) => void; disabled: boolean }
export function PianoRoll({ notes, bars, page, step, selected, select, change, preview, disabled }: Props) {
  const [ghost, setGhost] = useState<Note | null>(null);
  const drag = useRef<{ note: Note; x: number; y: number; moved: boolean } | null>(null);
  const hold = useNoteHold(disabled, page, () => { drag.current = null; setGhost(null); });
  const heldNote = notes.find(n => n.id === hold.target?.id);
  const start = page * 32;
  const steps = bars * 16;
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => { if (viewport.current) viewport.current.scrollTop = Math.max(0, (MAX_PITCH - (notes.find(n => n.id === selected)?.pitch || 72)) * ROW - 48); }, []);
  const position = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height };
  };
  return <div className="piano-scroll">{heldNote && hold.target && <NoteDuration note={heldNote} steps={steps} x={hold.target.x} y={hold.target.y} close={hold.close} change={length => change(notes.map(n => n.id === heldNote.id ? { ...n, length } : n))}/>}<div style={{ minWidth: 620 }}>
    <div className="roll-ruler"><span>NOTE</span><div>{Array.from({ length: 8 }, (_, i) => <span key={i}>{start + i * 4 < steps ? `${page * 2 + Math.floor(i / 4) + 1}.${i % 4 + 1}` : '—'}</span>)}</div></div>
    <div className="piano-viewport" ref={viewport}><div className="piano-wrap">
    <div className="piano-keys">{labels.map((label, row) => <button disabled={disabled} key={label} className={label.includes('♯') ? 'black-key' : ''} onClick={() => preview(MAX_PITCH - row)} aria-label={`${label} 미리 듣기`}>{label}</button>)}</div>
    <svg className="piano-grid" style={{ height: H }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="group" aria-label={`${page * 2 + 1}–${Math.min(bars, page * 2 + 2)}마디 피아노 롤`} onPointerDown={event => {
      if (disabled || event.button !== 0 || notes.length >= bars * 64) return;
      const { x, y } = position(event); const pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, MAX_PITCH - Math.floor(y / ROW)));
      const note = { id: uid(), pitch, step: start + Math.max(0, Math.min(31, Math.floor(x / CELL))), length: 2, velocity: .75 };
      if (note.step >= steps) return;
      note.length = Math.min(note.length, steps - note.step);
      change([...notes, note]); select(note.id); preview(pitch);
    }} onPointerMove={event => {
      hold.move(event);
      if (!drag.current || disabled) return;
      const { x, y } = position(event);
      const dx = Math.round((x - drag.current.x) / CELL), dy = Math.round((y - drag.current.y) / ROW);
      if (dx || dy) drag.current.moved = true;
      setGhost(moveNote(drag.current.note, drag.current.note.step + dx, drag.current.note.pitch - dy, steps));
    }} onPointerUp={() => {
      hold.cancel();
      if (drag.current?.moved && ghost) change(notes.map(n => n.id === ghost.id ? ghost : n));
      drag.current = null; setGhost(null);
    }} onPointerCancel={() => { hold.cancel(); drag.current = null; setGhost(null); }}>
      {labels.map((label, row) => <rect key={label} x="0" y={row * ROW} width={W} height={ROW} fill={label.includes('♯') ? '#1b201e' : '#202623'} pointerEvents="none"/>)}
      {Array.from({ length: 33 }, (_, i) => <line key={`v${i}`} x1={i * CELL} x2={i * CELL} y1="0" y2={H} stroke={i % 16 === 0 ? '#5a655d' : i % 4 === 0 ? '#3b453f' : '#2b342e'} pointerEvents="none"/>)}
      {Array.from({ length: labels.length + 1 }, (_, i) => <line key={`h${i}`} x1="0" x2={W} y1={i * ROW} y2={i * ROW} stroke="#29322c" pointerEvents="none"/>)}
      {steps - start < 32 && <rect x={(steps - start) * CELL} y="0" width={W / 2} height={H} fill="#111" opacity=".6" pointerEvents="none"/>}
      {notes.map(original => {
        const n = ghost?.id === original.id ? ghost : original;
        if (n.step + n.length <= start || n.step >= start + 32) return null;
        const x = Math.max(0, n.step - start) * CELL + 2;
        const width = (Math.min(n.step + n.length, start + 32) - Math.max(n.step, start)) * CELL - 4;
        return <g key={n.id} role="button" tabIndex={disabled ? -1 : 0} aria-label={`${labels[MAX_PITCH - n.pitch]}, ${n.step + 1}번째 칸, ${n.length}칸 길이`} className={`note ${selected === n.id ? 'selected' : ''}`}
          onFocus={() => select(n.id)} onContextMenu={e => { e.preventDefault(); if (hold.opened.current || ('pointerType' in e.nativeEvent && e.nativeEvent.pointerType === 'touch')) return; if (!disabled) { change(notes.filter(note => note.id !== n.id)); select(null); } }}
          onPointerDown={event => {
            event.stopPropagation(); if (disabled || event.button !== 0) return;
            hold.down(event, original);
            const svg = event.currentTarget.ownerSVGElement!; const rect = svg.getBoundingClientRect();
            drag.current = { note: original, x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height, moved: false };
            setGhost(original); select(n.id); preview(n.pitch); svg.setPointerCapture(event.pointerId);
          }} onKeyDown={event => {
            if (disabled) return;
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const r = event.currentTarget.getBoundingClientRect(); hold.open(n, r.left, r.bottom); }
            else if (['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); change(notes.filter(note => note.id !== n.id)); select(null); }
            else if (event.key.startsWith('Arrow')) {
              event.preventDefault(); const moved = moveNote(n, n.step + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0), n.pitch + (event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0), steps);
              change(notes.map(note => note.id === n.id ? moved : note));
            }
          }}>
          <rect x={x} y={(MAX_PITCH - n.pitch) * ROW + 3} width={width} height={ROW - 6} rx="4"/>
          {width > 28 && <text x={x + 7} y={(MAX_PITCH - n.pitch) * ROW + 16} pointerEvents="none">{labels[MAX_PITCH - n.pitch]}</text>}
        </g>;
      })}
      {step >= start && step < start + 32 && <line className="playhead" x1={(step - start) * CELL} x2={(step - start) * CELL} y1="0" y2={H} pointerEvents="none"/>}
    </svg>
  </div></div></div></div>;
}

import { useRef, useState, type PointerEvent } from 'react';
import { moveNote, uid, type Note } from './model';

const W = 1024, H = 312, CELL = 32, ROW = 24;
const labels = ['C5', 'B4', 'A♯4', 'A4', 'G♯4', 'G4', 'F♯4', 'F4', 'E4', 'D♯4', 'D4', 'C♯4', 'C4'];
interface Props { notes: Note[]; page: number; step: number; selected: string | null; select: (id: string | null) => void; change: (notes: Note[]) => void; preview: (pitch: number) => void; disabled: boolean }
export function PianoRoll({ notes, page, step, selected, select, change, preview, disabled }: Props) {
  const [ghost, setGhost] = useState<Note | null>(null);
  const drag = useRef<{ note: Note; x: number; y: number; moved: boolean } | null>(null);
  const start = page * 32;
  const position = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height };
  };
  return <div className="piano-scroll"><div style={{ minWidth: 620 }}>
    <div className="roll-ruler"><span>NOTE</span><div>{Array.from({ length: 8 }, (_, i) => <span key={i}>{page * 2 + Math.floor(i / 4) + 1}.{i % 4 + 1}</span>)}</div></div>
    <div className="piano-wrap">
    <div className="piano-keys">{labels.map((label, row) => <button disabled={disabled} key={label} className={label.includes('♯') ? 'black-key' : ''} onClick={() => preview(72 - row)} aria-label={`${label} 미리 듣기`}>{label}</button>)}</div>
    <svg className="piano-grid" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="group" aria-label={`${page * 2 + 1}–${page * 2 + 2}마디 피아노 롤`} onPointerDown={event => {
      if (disabled || event.button !== 0 || notes.length >= 512) return;
      const { x, y } = position(event); const pitch = Math.max(60, Math.min(72, 72 - Math.floor(y / ROW)));
      const note = { id: uid(), pitch, step: start + Math.max(0, Math.min(31, Math.floor(x / CELL))), length: 2, velocity: .75 };
      note.length = Math.min(note.length, 128 - note.step);
      change([...notes, note]); select(note.id); preview(pitch);
    }} onPointerMove={event => {
      if (!drag.current || disabled) return;
      const { x, y } = position(event);
      const dx = Math.round((x - drag.current.x) / CELL), dy = Math.round((y - drag.current.y) / ROW);
      if (dx || dy) drag.current.moved = true;
      setGhost(moveNote(drag.current.note, drag.current.note.step + dx, drag.current.note.pitch - dy));
    }} onPointerUp={() => {
      if (drag.current?.moved && ghost) change(notes.map(n => n.id === ghost.id ? ghost : n));
      drag.current = null; setGhost(null);
    }} onPointerCancel={() => { drag.current = null; setGhost(null); }}>
      {labels.map((label, row) => <rect key={label} x="0" y={row * ROW} width={W} height={ROW} fill={label.includes('♯') ? '#1b201e' : '#202623'} pointerEvents="none"/>)}
      {Array.from({ length: 33 }, (_, i) => <line key={`v${i}`} x1={i * CELL} x2={i * CELL} y1="0" y2={H} stroke={i % 16 === 0 ? '#5a655d' : i % 4 === 0 ? '#3b453f' : '#2b342e'} pointerEvents="none"/>)}
      {Array.from({ length: 14 }, (_, i) => <line key={`h${i}`} x1="0" x2={W} y1={i * ROW} y2={i * ROW} stroke="#29322c" pointerEvents="none"/>)}
      {notes.map(original => {
        const n = ghost?.id === original.id ? ghost : original;
        if (n.step + n.length <= start || n.step >= start + 32) return null;
        const x = Math.max(0, n.step - start) * CELL + 2;
        const width = (Math.min(n.step + n.length, start + 32) - Math.max(n.step, start)) * CELL - 4;
        return <g key={n.id} role="button" tabIndex={disabled ? -1 : 0} aria-label={`${labels[72 - n.pitch]}, ${n.step + 1}번째 칸, ${n.length}칸 길이`} className={`note ${selected === n.id ? 'selected' : ''}`}
          onFocus={() => select(n.id)} onContextMenu={e => { e.preventDefault(); if (!disabled) { change(notes.filter(note => note.id !== n.id)); select(null); } }}
          onPointerDown={event => {
            event.stopPropagation(); if (disabled || event.button !== 0) return;
            const svg = event.currentTarget.ownerSVGElement!; const rect = svg.getBoundingClientRect();
            drag.current = { note: original, x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height, moved: false };
            setGhost(original); select(n.id); preview(n.pitch); svg.setPointerCapture(event.pointerId);
          }} onKeyDown={event => {
            if (disabled) return;
            if (['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); change(notes.filter(note => note.id !== n.id)); select(null); }
            else if (event.key.startsWith('Arrow')) {
              event.preventDefault(); const moved = moveNote(n, n.step + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0), n.pitch + (event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0));
              change(notes.map(note => note.id === n.id ? moved : note));
            }
          }}>
          <rect x={x} y={(72 - n.pitch) * ROW + 3} width={width} height={ROW - 6} rx="4"/>
          {width > 28 && <text x={x + 7} y={(72 - n.pitch) * ROW + 16} pointerEvents="none">{labels[72 - n.pitch]}</text>}
        </g>;
      })}
      {step >= start && step < start + 32 && <line className="playhead" x1={(step - start) * CELL} x2={(step - start) * CELL} y1="0" y2={H} pointerEvents="none"/>}
    </svg>
  </div></div></div>;
}

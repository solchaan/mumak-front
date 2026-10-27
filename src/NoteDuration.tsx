import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { DURATIONS } from './notation';
import type { Note } from './model';

export function useNoteHold(disabled: boolean, scope: string | number, onOpen?: () => void) {
  const [target, setTarget] = useState<{ id: string; x: number; y: number } | null>(null);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const opened = useRef(false);
  const cancel = () => { if (pending.current) clearTimeout(pending.current.timer); pending.current = null; };
  useEffect(() => { cancel(); setTarget(null); }, [disabled, scope]);
  useEffect(() => cancel, []);
  function open(note: Note, x: number, y: number) { cancel(); opened.current = true; onOpen?.(); setTarget({ id: note.id, x, y }); }
  function down(e: PointerEvent, note: Note) {
    cancel(); opened.current = false;
    if (disabled || e.button !== 0) return;
    const x = e.clientX, y = e.clientY;
    pending.current = { x, y, timer: setTimeout(() => open(note, x, y), 500) };
  }
  function move(e: PointerEvent) {
    const p = pending.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) cancel();
  }
  return { target, close: () => setTarget(null), down, move, cancel, opened, open };
}

export function NoteDuration({ note, steps, x, y, change, close }: {
  note: Note; steps: number; x: number; y: number; change: (length: number) => void; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = dialog.current!; d.showModal(); return () => d.close(); }, []);
  return <dialog ref={dialog} className="note-duration" aria-label="음표 길이 변경"
    style={{ left: Math.max(8, Math.min(x, window.innerWidth - 276)), top: Math.max(8, Math.min(y + 12, window.innerHeight - 270)) }}
    onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <div><strong>음표 길이</strong><button aria-label="음표 길이 닫기" onClick={close}>×</button></div>
    <div className="duration-options">{DURATIONS.map(d => <button key={d.steps} disabled={note.step + d.steps > steps}
      aria-pressed={note.length === d.steps} onClick={() => { change(d.steps); close(); }}>{d.label}</button>)}</div>
  </dialog>;
}

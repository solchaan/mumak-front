import { useEffect, useMemo, useRef, useState } from 'react';
import { Renderer } from 'vexflow';
import { moveNote, uid, type Note, type Project } from './model';
import { DURATIONS, KEYS, MIN_PITCH, MAX_PITCH, PATTERNS, accompaniment, chordCatalog, chordMatches, chordTones, keyAccidentals, keyLabel, keySpelling, parseChord, positionSpelling, removeChord, spellingPitch, writeChord, type AccompanimentPattern, type Mode } from './notation';
import { VIEWS, VIEW_LABELS, geometry, type View } from './layout';
import { engraveSystem, type Hit } from './score';
import { applyProgression, type Harmony, type Progression } from './harmony';
import './staff.css';

interface Props { project: Project; page: number; step: number; selected: string | null; select: (id: string | null) => void; change: (project: Project) => void; preview: (pitch: number) => void; disabled: boolean; suggest: (step: number, length: number) => Promise<Harmony> }

export default function StaffEditor({ project, page, step, selected, select, change, preview, disabled, suggest }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const chordInput = useRef<HTMLInputElement>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [length, setLength] = useState(4);
  const [accidental, setAccidental] = useState<'key' | '' | '#' | 'b'>('key');
  const [symbol, setSymbol] = useState('C');
  const [localStep, setLocalStep] = useState(0);
  const [pitchInput, setPitchInput] = useState('C4');
  const [chordId, setChordId] = useState<string | null>(null);
  const [view, setView] = useState<View>('melody');
  const [error, setError] = useState('');
  const [renderError, setRenderError] = useState('');
  const [harmony, setHarmony] = useState<Harmony | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [activeOption, setActiveOption] = useState(-1);
  const catalog = useMemo(() => chordCatalog(project.key), [project.key]);
  const options = useMemo(() => chordMatches(catalog, symbol), [catalog, symbol]);
  const acc = useMemo(() => accompaniment(project), [project.chords, project.accompaniment]); // eslint-disable-line react-hooks/exhaustive-deps
  const chord = project.chords.find(c => c.id === chordId);
  const selectedNote = project.notes.find(n => n.id === selected);
  const start = page * 32;
  const keyAcc = keyAccidentals(project.key);
  // One bar per system in the editor so the 16th-note grid stays wide enough to click.
  const g = geometry(project, view, 1);
  const { start: START, cell: CELL, row: ROW } = g;
  const WIDTH = g.width, HEIGHT = ROW * 2, last = g.kinds.length - 1, melodyIndex = g.kinds.indexOf('melody');
  const noteX = (at: number) => g.noteX(0, at);
  const staveY = (row: number, k: number) => row * ROW + g.staveY(k);
  const spell = (n: Note) => n.spelling || keySpelling(n.pitch, project.key);
  const resolveAccidental = (letter: string): '' | '#' | 'b' => accidental === 'key' ? keyAcc[letter] : accidental;

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
      for (let row = 0; row < 2; row++) engraveSystem({ context, project, acc, geometry: g, bars: [page * 2 + row], y: row * ROW, system: row, onHit: hit => nextHits.push(hit) });
      const svg = canvas.current.querySelector('svg');
      svg?.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`); svg?.setAttribute('aria-hidden', 'true');
      setHits(nextHits); setRenderError('');
    } catch (e) { setRenderError(`악보를 표시하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`); }
  }, [project.notes, project.key, acc, page, view]); // eslint-disable-line react-hooks/exhaustive-deps

  function addNote(pitch: number, spelling: string, at = start + localStep) {
    if (disabled) return;
    if (project.notes.length >= 512) { setError('음표는 최대 512개까지 추가할 수 있습니다.'); return; }
    if (pitch < MIN_PITCH || pitch > MAX_PITCH) { setError('C4–C6 범위의 음표를 선택하세요.'); return; }
    if (at + length > 128) { setError('음표 길이가 8마디를 벗어납니다. 길이를 줄여 주세요.'); return; }
    const note = { id: uid(), pitch, spelling, step: at, length, velocity: .75 };
    change({ ...project, notes: [...project.notes, note] }); select(note.id); setChordId(null); preview(pitch); setError('');
  }
  // replaceId is passed explicitly (never defaulted) so a suggestion at an empty position cannot overwrite the selected chord elsewhere.
  function saveChord(name: string, replaceId: string | undefined) {
    if (disabled) return;
    try {
      const next = writeChord(project, name, start + localStep, length, replaceId);
      change(next); select(null); setChordId(next.chords.find(c => c.step === start + localStep)!.id); setError('');
      parseChord(name).tones.forEach(t => preview(t.pitch));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function recommend() {
    if (disabled || suggesting) return;
    setSuggesting(true); setError('');
    try { setHarmony(await suggest(start + localStep, length)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSuggesting(false); }
  }
  function useSuggestion(name: string) {
    // A suggestion replaces whatever chord already starts at the cursor, so trying ideas stays one click; undo restores it.
    setSymbol(name); saveChord(name, project.chords.find(c => c.step === start + localStep)?.id ?? undefined);
  }
  function useProgression(progression: Progression) {
    if (disabled) return;
    try { change(applyProgression(project, progression.chords)); select(null); setChordId(null); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  function chooseChord(id: string) {
    const chosen = project.chords.find(c => c.id === id)!;
    setChordId(id); select(null); setSymbol(chosen.symbol); setLocalStep(chosen.step - start); setLength(chosen.length); setError('');
  }
  function editNote(pitch: number) {
    if (!selectedNote) return;
    change({ ...project, notes: project.notes.map(n => n.id === selectedNote.id ? moveNote(n, n.step, pitch) : n) });
  }
  function pickOption(name: string) {
    setSymbol(name); setListOpen(false); setActiveOption(-1); setError('');
    chordTones(name).forEach(preview);
  }
  function setKey(value: string) {
    const [tonic, mode] = value.split('|');
    change({ ...project, key: tonic ? { tonic, mode: mode as Mode } : null }); setHarmony(null); setError('');
  }
  return <div className="staff-editor">
    <div className="staff-toolbar">
      <label>악보 표시<select aria-label="악보 표시" value={view} onChange={e => setView(e.target.value as View)}>{(Object.keys(VIEWS) as View[]).map(v => <option key={v} value={v}>{VIEW_LABELS[v]}</option>)}</select></label>
      <label>반주 패턴<select aria-label="반주 패턴" disabled={disabled} value={project.accompaniment.pattern} onChange={e => change({ ...project, accompaniment: { pattern: e.target.value as AccompanimentPattern } })}>{PATTERNS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <label>조표<select aria-label="조표" disabled={disabled} value={project.key ? `${project.key.tonic}|${project.key.mode}` : ''} onChange={e => setKey(e.target.value)}><option value="">없음 · 조성 자동 추정</option>{KEYS.map(k => <option key={`${k.tonic}|${k.mode}`} value={`${k.tonic}|${k.mode}`}>{keyLabel(k)}</option>)}</select></label>
      <label>음표 길이<select aria-label="오선지 음표 길이" disabled={disabled} value={length} onChange={e => setLength(Number(e.target.value))}>{DURATIONS.map(d => <option key={d.steps} value={d.steps}>{d.label}</option>)}{!DURATIONS.some(d => d.steps === length) && <option value={length}>{length}칸</option>}</select></label>
      <div className="accidental-buttons" role="group" aria-label="임시표">{([['key', '조표', '조표대로'], ['', '♮', '제자리표'], ['#', '♯', '올림표'], ['b', '♭', '내림표']] as const).map(([value, label, name]) => <button key={name} disabled={disabled} aria-label={name} aria-pressed={accidental === value} onClick={() => setAccidental(value)}>{label}</button>)}</div>
      <span className="staff-range">높은음자리표 · C4–C6{project.key ? ` · ${keyLabel(project.key)}` : ''}</span>
    </div>
    <div className="staff-inputs">
      <label>입력 위치<select aria-label="오선지 입력 위치" disabled={disabled} value={localStep} onChange={e => setLocalStep(Number(e.target.value))}>{Array.from({ length: 32 }, (_, i) => <option key={i} value={i}>{page * 2 + Math.floor(i / 16) + 1}마디 {Math.floor(i % 16 / 4) + 1}박{i % 4 ? ` + ${i % 4}/16` : ''}</option>)}</select></label>
      <label>음높이<select aria-label="오선지 입력 음높이" disabled={disabled} value={pitchInput} onChange={e => setPitchInput(e.target.value)}>{Array.from({ length: 15 }, (_, i) => positionSpelling(i)).map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      <button className="outline-button" disabled={disabled} onClick={() => { const s = pitchInput[0] + resolveAccidental(pitchInput[0]) + pitchInput.slice(-1); addNote(spellingPitch(s)!, s); }}>음표 추가</button>
    </div>
    <form className="chord-form" onSubmit={e => { e.preventDefault(); saveChord(symbol, chord?.id); }}>
      <div className="chord-autocomplete">
        <label>코드 이름<input ref={chordInput} aria-label="코드 이름" maxLength={12} value={symbol} placeholder="C, Am, G7, Bbmaj7" disabled={disabled} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={listOpen && options.length > 0} aria-controls="chord-options" aria-activedescendant={activeOption >= 0 ? `chord-option-${activeOption}` : undefined}
          onFocus={() => setListOpen(true)} onBlur={() => { setListOpen(false); setActiveOption(-1); }} onChange={e => { setSymbol(e.target.value); setListOpen(true); setActiveOption(-1); }}
          onKeyDown={e => {
            if (e.key === 'Escape') { setListOpen(false); setActiveOption(-1); return; }
            if (!listOpen || !options.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveOption(a => (a + 1) % options.length); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveOption(a => (a - 1 + options.length) % options.length); }
            else if (e.key === 'Enter' && activeOption >= 0) { e.preventDefault(); pickOption(options[activeOption].symbol); }
          }}/></label>
        {listOpen && options.length > 0 && <ul id="chord-options" className="chord-options" role="listbox" aria-label="코드 자동완성">{options.map((o, i) => <li key={o.symbol} id={`chord-option-${i}`} role="option" aria-selected={i === activeOption} className={i === activeOption ? 'active' : ''} onMouseDown={e => { e.preventDefault(); pickOption(o.symbol); }} onMouseEnter={() => setActiveOption(i)}><strong>{o.symbol}</strong>{o.roman && <small>{o.roman}</small>}</li>)}</ul>}
      </div>
      <button className="export-button" disabled={disabled} type="submit">{chord ? '코드 수정' : '코드 추가'}</button>
      {chord && <><button type="button" className="text-button" disabled={disabled} onClick={() => { change(removeChord(project, chord.id)); setChordId(null); }}>코드 삭제</button><button type="button" className="text-button" disabled={disabled} onClick={() => { setChordId(null); select(null); }}>선택 해제</button></>}
      <button type="button" className="outline-button" disabled={disabled || suggesting} aria-busy={suggesting} onClick={() => void recommend()}>{suggesting ? '추천 받는 중…' : '코드 추천'}</button>
      <span>코드 기호는 멜로디와 별개로 오선지 위에 붙고, 다음 코드까지 이어지며 재생·내보내기에서 반주로 울립니다 · 추천은 프로젝트 서버가 계산</span>
    </form>
    {harmony && <div className="chord-suggestions" aria-live="polite">
      <div className="chord-suggestions-head"><strong>{harmony.key.label}</strong><span>{harmony.key.estimated ? `추정 조성 · 신뢰도 ${Math.round(harmony.key.confidence * 100)}%` : '지정 조성'}{harmony.previous ? ` · 직전 ${harmony.previous.symbol}${harmony.previous.roman ? ` (${harmony.previous.roman})` : ''}` : ''} · {Math.floor(harmony.position.step / 16) + 1}마디 {Math.floor(harmony.position.step % 16 / 4) + 1}박부터 {harmony.position.length}칸</span></div>
      <div className="chord-chips" role="group" aria-label="추천 코드">{harmony.suggestions.map(s => <button type="button" key={s.symbol} className="chord-chip" title={s.reason} disabled={disabled} onClick={() => useSuggestion(s.symbol)}><strong>{s.symbol}</strong><small>{s.roman}</small></button>)}</div>
      <div className="chord-progressions" role="group" aria-label="추천 코드 진행">{harmony.progressions.map(p => <button type="button" key={p.name} className="text-button" disabled={disabled} title={`${p.name} 진행을 8마디에 적용`} onClick={() => useProgression(p)}>{p.symbols.join(' – ')} 적용</button>)}</div>
      {harmony.analysis.romans.length > 0 && <div className="chord-analysis"><span>현재 진행</span>{harmony.analysis.romans.map(r => <em key={`${r.step}-${r.symbol}`} title={`${Math.floor(r.step / 16) + 1}마디 ${r.symbol}`}>{r.roman ?? `${r.symbol}?`}</em>)}</div>}
      {harmony.tips.length > 0 && <ul className="chord-tips" aria-label="코드 진행 팁">{harmony.tips.map(t => <li key={t.text} className={`tip-${t.level}`}>{t.text}</li>)}</ul>}
    </div>}
    {(error || renderError) && <p className="staff-error" role="alert">{error || renderError}</p>}
    <div className="staff-scroll"><div className="staff-paper" style={{ width: WIDTH, height: HEIGHT }}>
      <div ref={canvas} className="staff-engraving"/>
      <svg className="staff-overlay" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label={`${page * 2 + 1}–${page * 2 + 2}마디 오선지`} onPointerDown={event => {
        if (disabled || event.button !== 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) * WIDTH / rect.width, y = (event.clientY - rect.top) * HEIGHT / rect.height;
        const row = Math.floor(y / ROW); if (row < 0 || row > 1 || x < START - 15 || x > START + CELL * 16) return;
        const local = row * 16 + Math.max(0, Math.min(15, Math.round((x - START) / CELL)));
        // The strip above each system is the chord line: clicking it moves the cursor and focuses the chord name.
        if (y - row * ROW < 58) { event.preventDefault(); setLocalStep(local); setChordId(null); chordInput.current?.focus(); return; }
        // Only the vocal stave takes clicks; the accompaniment staves are generated from the chords.
        if (melodyIndex < 0) return;
        const position = Math.round((staveY(row, melodyIndex) + 90 - y) / 5);
        if (position < 0 || position > 14) return;
        setLocalStep(local); const spelling = positionSpelling(position, resolveAccidental(positionSpelling(position)[0]));
        addNote(spellingPitch(spelling)!, spelling, start + local);
      }}>
        {[0, 1].map(row => <g key={row} pointerEvents="none">
          <text x="22" y={22 + row * ROW} className="staff-bar-label">{page * 2 + row + 1} 마디</text>
          {Array.from({ length: 16 }, (_, i) => <g key={i}><line x1={START + i * CELL} x2={START + i * CELL} y1={staveY(row, 0) + 20} y2={staveY(row, last) + 110} className={i % 4 === 0 ? 'staff-beat-line' : 'staff-grid-line'}/><text x={START + i * CELL} y={staveY(row, last) + 133} className="staff-beat-label">{i % 4 === 0 ? `${i / 4 + 1}박` : '·'}</text></g>)}
        </g>)}
        <line className="staff-cursor" pointerEvents="none" x1={noteX(localStep)} x2={noteX(localStep)} y1={staveY(Math.floor(localStep / 16), 0) + 15} y2={staveY(Math.floor(localStep / 16), last) + 113}/>
        {project.chords.filter(c => c.step >= start && c.step < start + 32).map(c => <rect key={`span-${c.id}`} className={`staff-chord-span ${c.id === chord?.id ? 'active' : ''}`} pointerEvents="none" x={noteX(c.step) - 8} y={53 + Math.floor((c.step - start) / 16) * ROW} width={Math.max(4, (Math.min(c.step + c.length, Math.floor(c.step / 16) * 16 + 16) - c.step) * CELL - 4)} height="2"/>)}
        {project.chords.filter(c => c.step >= start && c.step < start + 32).map(c => <g role="button" tabIndex={disabled ? -1 : 0} className={`staff-chord ${c.id === chord?.id ? 'active' : ''}`} key={c.id} aria-label={`코드 ${c.symbol}, ${Math.floor(c.step / 16) + 1}마디`} onPointerDown={e => { e.stopPropagation(); if (!disabled) chooseChord(c.id); }} onKeyDown={e => { if (!disabled && ['Enter', ' '].includes(e.key)) { e.preventDefault(); chooseChord(c.id); } }}><rect x={noteX(c.step) - 8} y={24 + Math.floor((c.step - start) / 16) * ROW} width={Math.max(38, c.symbol.length * 9 + 16)} height="26" rx="5"/><text x={noteX(c.step)} y={42 + Math.floor((c.step - start) / 16) * ROW}>{c.symbol}</text></g>)}
        {hits.map(hit => <g key={`${hit.note.id}:${hit.step}`} role="button" tabIndex={disabled ? -1 : 0} className={`staff-note ${hit.note.id === selected ? 'selected' : ''}`} data-pitch={hit.note.pitch} data-step={hit.step} aria-label={`음표 ${spell(hit.note)}, ${hit.note.length}칸`}
          onPointerDown={e => { e.stopPropagation(); if (disabled || e.button !== 0) return; select(hit.note.id); setChordId(null); setLocalStep(Math.max(0, hit.note.step - start)); preview(hit.note.pitch); }}
          onContextMenu={e => { e.preventDefault(); if (!disabled) { change({ ...project, notes: project.notes.filter(n => n.id !== hit.note.id) }); select(null); } }}
          onKeyDown={e => {
            if (disabled) return;
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); change({ ...project, notes: project.notes.filter(n => n.id !== hit.note.id) }); select(null); }
            else if (e.key.startsWith('Arrow')) { e.preventDefault(); change({ ...project, notes: project.notes.map(n => n.id === hit.note.id ? moveNote(n, n.step + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0), n.pitch + (e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0)) : n) }); }
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(hit.note.id); setChordId(null); preview(hit.note.pitch); }
          }}><rect x={hit.x - 12} y={hit.y - 5} width="25" height="10" rx="4"/></g>)}
        {step >= start && step < start + 32 && <line className="staff-playhead" pointerEvents="none" x1={noteX(step)} x2={noteX(step)} y1={staveY(Math.floor((step - start) / 16), 0) + 10} y2={staveY(Math.floor((step - start) / 16), last) + 113}/>}
      </svg>
    </div></div>
    <div className="staff-help">오선지 클릭으로 멜로디 입력 · 악보 위 코드 줄을 클릭하면 그 위치에 코드 입력 · 반주 보표는 코드 기호와 반주 패턴에서 자동으로 만들어지며 직접 편집하지 않음 · 임시표 버튼이 "조표"면 조표에 맞는 음을 입력 · 음표 선택 후 방향키로 이동 · 우클릭/Delete로 삭제 · 악보 PDF는 내보내기에서</div>
    {selectedNote && <div className="staff-selected"><label>선택 음높이<select aria-label="선택한 음표 음높이" value={selectedNote.pitch} disabled={disabled} onChange={e => editNote(Number(e.target.value))}>{Array.from({ length: MAX_PITCH - MIN_PITCH + 1 }, (_, i) => i + MIN_PITCH).map(pitch => <option key={pitch} value={pitch}>{keySpelling(pitch, project.key)}</option>)}</select></label><span>길이·세기는 아래에서 편집합니다.</span></div>}
  </div>;
}

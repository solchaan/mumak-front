import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioEngine, beginRecording } from './audio';
import { createProject, duration, parseProject, type Project, type Summary, type Track, type Drum } from './model';
import { apiRequest, deleteLocal, download, listLocal, loadLocal, safeName, saveLocal } from './storage';
import { midiBytes } from './midi';
import { PianoRoll } from './PianoRoll';
import './style.css';

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    play: <path d="m8 5 11 7-11 7z"/>, stop: <rect x="6" y="6" width="12" height="12" rx="2"/>, plus: <path d="M12 5v14M5 12h14"/>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,
    cloud: <><path d="M6 18a5 5 0 1 1 1-10 6 6 0 0 1 12 2 4 4 0 0 1-1 8M12 12v9m-3-6 3-3 3 3"/></>,
    undo: <path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7v3"/>, redo: <path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7v3"/>,
    folder: <path d="M3 6h7l2 3h9v11H3z"/>, music: <><path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/></>,
    trash: <><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></>,
    loop: <><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>, check: <path d="m5 12 4 4L19 6"/>, headphones: <><path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="9" rx="2"/><rect x="17" y="12" width="4" height="9" rx="2"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'play' || name === 'stop' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.music}</svg>;
}

function App() {
  const [project, setProject] = useState<Project | null>(null);
  const current = useRef<Project | null>(null);
  const [projects, setProjects] = useState<Summary[]>([]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState('');
  const [loop, setLoop] = useState(true);
  const [metro, setMetro] = useState(false);
  const [saveStatus, setSaveStatus] = useState('불러오는 중');
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState<'export' | 'server' | null>(null);
  const [apiUrl, setApiUrl] = useState(import.meta.env.VITE_API_URL || 'http://127.0.0.1:3001');
  const [token, setToken] = useState('');
  const [remote, setRemote] = useState<Summary[]>([]);
  const [serverState, setServerState] = useState('');
  const engine = useRef(new AudioEngine()).current;
  const stopRecording = useRef<(() => void) | null>(null);
  const recordingStart = useRef(0);
  const history = useRef<{ past: Project[]; future: Project[] }>({ past: [], future: [] });
  const [, historyChanged] = useState(0);
  const saveQueue = useRef(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const importInput = useRef<HTMLInputElement>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const notify = useCallback((error: unknown) => setMessage(error instanceof Error ? error.message : String(error)), []);
  const refresh = useCallback(async () => setProjects(await listLocal()), []);
  const persist = useCallback((p: Project) => {
    const task = saveQueue.current.catch(() => {}).then(async () => { await saveLocal({ ...p, title: p.title.trim() || '이름 없는 스케치' }); await refresh(); });
    saveQueue.current = task; return task;
  }, [refresh]);
  const adopt = useCallback((p: Project) => { current.current = p; setProject(p); }, []);
  const change = useCallback((fn: (p: Project) => Project) => {
    if (!current.current) return;
    history.current.past.push(current.current); history.current.past = history.current.past.slice(-50); history.current.future = [];
    adopt({ ...fn(current.current), updatedAt: new Date().toISOString() }); historyChanged(n => n + 1);
  }, [adopt]);
  const stop = useCallback(() => {
    engine.stop(); setPlaying(false);
    if (stopRecording.current) { setBusy('녹음 처리 중'); stopRecording.current(); stopRecording.current = null; }
  }, [engine]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const items = await listLocal(); const initial = items.length ? await loadLocal(items[0].id) : createProject(true);
        if (alive) { setProjects(items); adopt(initial); }
      } catch (error) { if (alive) { adopt(createProject(true)); notify(`브라우저 저장소를 열지 못했습니다. 프로젝트 JSON으로 백업하세요. ${String(error)}`); } }
    })();
    return () => { alive = false; engine.dispose(); stopRecording.current?.(); };
  }, [adopt, engine, notify]);
  useEffect(() => {
    if (!project) return;
    setSaveStatus('저장 중…');
    saveTimer.current = setTimeout(() => { void persist(project).then(() => { if (current.current === project) setSaveStatus('브라우저에 저장됨'); }).catch(() => setSaveStatus('저장 실패 · JSON 백업 필요')); }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [project, persist]);
  useEffect(() => { if (project && !recording) engine.update(project); }, [project, engine, recording]);
  useEffect(() => {
    engine.onStep = setStep;
    engine.onEnd = () => { setPlaying(false); if (stopRecording.current) { setBusy('녹음 처리 중'); stopRecording.current(); stopRecording.current = null; } };
  }, [engine]);
  useEffect(() => { if (step >= 0) setPage(Math.floor(step / 32)); }, [step]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 7000); return () => clearTimeout(timer); }, [message]);
  useEffect(() => { if (dialog && !modal.current?.open) modal.current?.showModal(); }, [dialog]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (recording || saveStatus === '저장 중…' || saveStatus.startsWith('저장 실패')) event.preventDefault(); };
    window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler);
  }, [recording, saveStatus]);

  async function play() {
    if (playing) { stop(); return; }
    if (!current.current || busy) return;
    setBusy('재생 준비 중');
    try { await engine.play(current.current, loop, metro); setPlaying(true); }
    catch (error) { notify(error); } finally { setBusy(''); }
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,select,textarea,button,dialog,[role=button]') || busy || recording) return;
      if (event.code === 'Space') { event.preventDefault(); void play(); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  });
  async function switchProject(next?: string, blank = false) {
    if (busy || recording) return;
    stop(); setBusy('프로젝트 여는 중');
    try {
      if (current.current) await persist(current.current);
      const p = next ? await loadLocal(next) : createProject(!blank);
      history.current = { past: [], future: [] }; adopt(p); setSelected(null); setPage(0);
    } catch (error) { notify(error); } finally { setBusy(''); }
  }
  function undo(redo = false) {
    if (!current.current) return;
    const from = redo ? history.current.future : history.current.past;
    const to = redo ? history.current.past : history.current.future;
    const p = from.pop(); if (!p) return;
    stop(); to.push(current.current); adopt({ ...p, updatedAt: new Date().toISOString() }); historyChanged(n => n + 1);
  }
  async function record() {
    if (!current.current || busy) return;
    if (current.current.recording && !window.confirm('현재 녹음을 새 녹음으로 교체할까요? 이전 녹음은 실행 취소로 복원할 수 있습니다.')) return;
    stop(); setBusy('마이크 연결 중');
    try {
      const ctx = await engine.ready();
      const finish = await beginRecording(ctx, result => {
        change(p => ({ ...p, recording: { dataUrl: result.dataUrl, duration: result.duration, offset: Math.max(-5, Math.min(48, result.startedAt - recordingStart.current)) } }));
        setRecording(false); setBusy(''); notify('녹음이 추가되었습니다. 필요하면 시작 위치를 보정하세요.');
      }, error => { engine.stop(); stopRecording.current?.(); stopRecording.current = null; setPlaying(false); setRecording(false); setBusy(''); notify(error); });
      stopRecording.current = finish; setRecording(true);
      recordingStart.current = await engine.play({ ...current.current, recording: null }, false, metro);
      setPlaying(true); setBusy('');
    } catch (error) { stopRecording.current?.(); stopRecording.current = null; setRecording(false); setBusy(''); notify(error instanceof DOMException && error.name === 'NotAllowedError' ? '마이크 권한을 허용한 뒤 다시 녹음해 주세요.' : error); }
  }
  async function exportFile(kind: 'midi' | 'json' | 'mix' | Track) {
    if (!current.current) return;
    setBusy('내보내는 중');
    try {
      const p = current.current; const name = safeName(p.title);
      if (kind === 'json') download(new Blob([JSON.stringify(p)], { type: 'application/json' }), `${name}.mumak.json`);
      else if (kind === 'midi') download(new Blob([new Uint8Array(midiBytes(p))], { type: 'audio/midi' }), `${name}.mid`);
      else download(await engine.exportWav(p, kind === 'mix' ? undefined : kind), `${name}-${kind}.wav`);
      notify('파일 내보내기가 완료되었습니다.');
    } catch (error) { notify(error); } finally { setBusy(''); }
  }
  async function importFile(file?: File) {
    if (!file) return;
    setBusy('프로젝트 가져오는 중'); stop();
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('프로젝트 파일은 30 MB 이하여야 합니다.');
      const p = parseProject(JSON.parse(await file.text()));
      if (current.current) await persist(current.current);
      // Import as a copy so a backup never silently overwrites another local project.
      adopt({ ...p, id: crypto.randomUUID(), updatedAt: new Date().toISOString() }); history.current = { past: [], future: [] }; setSelected(null); setPage(0);
      notify('프로젝트를 사본으로 가져왔습니다.');
    } catch (error) { notify(error); } finally { setBusy(''); }
  }
  async function serverAction(action: 'list' | 'save' | 'open', id?: string) {
    setBusy('서버 연결 중'); setServerState('');
    try {
      if (action === 'save') await apiRequest(apiUrl, token, `/projects/${current.current!.id}`, 'PUT', current.current!);
      if (action === 'open') {
        const p = parseProject(await apiRequest(apiUrl, token, `/projects/${id}`));
        if (current.current) await persist(current.current);
        stop(); adopt(p); history.current = { past: [], future: [] }; setSelected(null); setPage(0); setDialog(null);
      } else { const result = await apiRequest<{ projects: Summary[] }>(apiUrl, token, '/projects'); setRemote(result.projects); setServerState(action === 'save' ? '현재 프로젝트를 서버에 저장했습니다.' : '서버에 연결되었습니다.'); }
    } catch (error) { setServerState(`연결 실패: ${error instanceof Error ? error.message : String(error)}. 서버 실행 상태와 허용 출처를 확인하세요.`); }
    finally { setBusy(''); }
  }

  if (!project) return <div className="loading">mumak<span>작업실을 준비하고 있어요…</span></div>;
  const locked = !!busy || recording;
  const note = project.notes.find(n => n.id === selected);
  const currentBar = step < 0 ? 1 : Math.floor(step / 16) + 1;
  return <div className="app">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="Mumak 음악 스케치북"><span className="brand-mark">m</span>mumak<span className="beta">BETA</span></a>
      <div className="workspace-label">YOUR MUSIC, IN THE MAKING</div>
      <button className="new-project" disabled={locked} onClick={() => void switchProject(undefined, true)}><Icon name="plus"/>새로운 스케치</button>
      <div className="section-label"><span>내 스케치</span><span>{projects.length.toString().padStart(2, '0')}</span></div>
      <nav className="project-list" aria-label="저장된 프로젝트">{projects.map(item => <button disabled={locked} className={`project-link ${item.id === project.id ? 'active' : ''}`} key={item.id} onClick={() => void switchProject(item.id)}><Icon name="music"/><span><strong>{item.title}</strong><small>{item.bpm} BPM · {new Date(item.updatedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</small></span><i/></button>)}</nav>
      <div className="sidebar-bottom"><button disabled={locked} onClick={() => importInput.current?.click()}><Icon name="folder"/>프로젝트 가져오기</button><button disabled={locked} onClick={() => void switchProject()}><Icon name="headphones"/>데모 스케치 열기</button><button disabled={locked} onClick={() => setDialog('server')}><Icon name="cloud"/>프로젝트 서버</button><p>작은 아이디어가<br/>한 곡이 되는 곳.</p><span className="local-badge"><i/> LOCAL WORKSPACE</span></div>
      <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }}/>
    </aside>
    <main>
      <header className="topbar"><div className="breadcrumb">작업실 <span>/</span> 음악 스케치</div><span className={`save-status ${saveStatus.includes('실패') ? 'error' : ''}`}><Icon name="check" size={14}/>{saveStatus}</span><button className="export-button" disabled={locked} onClick={() => setDialog('export')}><Icon name="download"/>내보내기</button></header>
      <div className="workspace">
        <section className="project-heading"><div><div className="eyebrow">SKETCHBOOK / 001</div><input aria-label="프로젝트 이름" className="project-title" value={project.title} maxLength={100} disabled={locked} onChange={e => change(p => ({ ...p, title: e.target.value }))} onBlur={() => { if (!project.title.trim()) change(p => ({ ...p, title: '이름 없는 스케치' })); }}/><p>떠오른 멜로디를 놓치지 마세요. 여기서 시작하면 됩니다.</p></div><div className="project-meta"><span>8 <small>마디</small></span><span>4/4 <small>박자</small></span><span>{Math.round(duration(project))}<small>초</small></span></div></section>
        <section className="transport" aria-label="재생 컨트롤"><div className="transport-main"><button className={`play-button ${playing ? 'is-playing' : ''}`} disabled={!!busy} onClick={() => void play()} aria-label={playing ? '재생 정지' : '재생'}><Icon name={playing ? 'stop' : 'play'} size={20}/></button><button className={`record-button ${recording ? 'recording' : ''}`} disabled={!!busy} onClick={() => recording ? stop() : void record()} aria-label={recording ? '녹음 정지' : '녹음 시작'}><span/></button><div className="position">{String(currentBar).padStart(2, '0')}<span> : </span>{String(step < 0 ? 1 : Math.floor(step % 16 / 4) + 1).padStart(2, '0')}<small>BAR / BEAT</small></div></div><div className="tempo"><input type="number" aria-label="템포 BPM" min="40" max="240" value={project.bpm} disabled={locked} onChange={e => { stop(); change(p => ({ ...p, bpm: Math.max(40, Math.min(240, Math.round(Number(e.target.value) || 40))) })); }}/><span>BPM</span></div><button className={`toggle ${loop ? 'on' : ''}`} disabled={locked} aria-pressed={loop} onClick={() => { stop(); setLoop(!loop); }}><Icon name="loop"/>반복</button><button className={`toggle ${metro ? 'on' : ''}`} disabled={locked} aria-pressed={metro} onClick={() => { stop(); setMetro(!metro); }}><span className="metronome">♩</span>메트로놈</button><div className="transport-tip">{recording ? <span className="record-label">● 녹음 중 · 8마디 후 자동 종료</span> : <><kbd>space</kbd> 재생 / 정지</>}</div></section>
        <div className="editor-layout"><div className="editor-column">
          <section className="arrangement panel"><div className="panel-title"><h2>전체 스케치 <span>8 BARS</span></h2><span className="muted">편집할 구간을 선택하세요</span></div><div className="bar-overview">{Array.from({ length: 8 }, (_, i) => <button key={i} disabled={recording} className={`${Math.floor(i / 2) === page ? 'chosen' : ''} ${currentBar === i + 1 && playing ? 'current' : ''}`} onClick={() => setPage(Math.floor(i / 2))}><span>{String(i + 1).padStart(2, '0')}</span><svg viewBox="0 0 100 30" aria-hidden="true">{project.notes.filter(n => Math.floor(n.step / 16) === i).map(n => <rect key={n.id} x={(n.step % 16) * 6.25} y={(72 - n.pitch) * 2} width={Math.min(n.length, 16 - n.step % 16) * 6.25 - 1} height="2.5" rx="1"/>)}</svg></button>)}</div></section>
          <section className="panel melody-panel"><div className="panel-title"><h2><span className="track-dot keys-dot"/>멜로디 <span>01</span></h2><div className="panel-tools"><select aria-label="가상 악기" disabled={locked} value={project.instrument} onChange={e => change(p => ({ ...p, instrument: e.target.value as Project['instrument'] }))}><option value="soft">Soft keys</option><option value="pluck">Warm pluck</option><option value="synth">Analog synth</option></select><button className="icon-button" aria-label="실행 취소" title="실행 취소" disabled={locked || !history.current.past.length} onClick={() => undo()}><Icon name="undo" size={16}/></button><button className="icon-button" aria-label="다시 실행" title="다시 실행" disabled={locked || !history.current.future.length} onClick={() => undo(true)}><Icon name="redo" size={16}/></button></div></div>
            <PianoRoll notes={project.notes} page={page} step={step} selected={selected} select={setSelected} disabled={locked} change={notes => change(p => ({ ...p, notes }))} preview={pitch => { void engine.preview(pitch, project.instrument).catch(notify); }}/>
            <div className="note-tools">{note ? <><span>선택한 음표</span><label>길이 <input aria-label="선택한 음표 길이" type="number" min="1" max={128 - note.step} value={note.length} disabled={locked} onChange={e => change(p => ({ ...p, notes: p.notes.map(n => n.id === note.id ? { ...n, length: Math.min(128 - n.step, Math.max(1, Number(e.target.value))) } : n) }))}/><small>칸</small></label><label>세기 <input aria-label="선택한 음표 세기" type="range" min="0.05" max="1" step="0.05" disabled={locked} value={note.velocity} onChange={e => change(p => ({ ...p, notes: p.notes.map(n => n.id === note.id ? { ...n, velocity: Number(e.target.value) } : n) }))}/></label><button disabled={locked} className="icon-button" aria-label="선택한 음표 삭제" onClick={() => { change(p => ({ ...p, notes: p.notes.filter(n => n.id !== selected) })); setSelected(null); }}><Icon name="trash" size={15}/></button></> : <span>클릭해서 음표 추가 · 드래그로 이동 · 우클릭으로 삭제</span>}<span className="grid-label">1/16 GRID</span></div>
          </section>
          <section className="panel drums-panel"><div className="panel-title"><h2><span className="track-dot drums-dot"/>드럼 <span>02</span></h2><span className="muted">칸을 눌러 리듬을 만드세요</span></div><div className="drum-scroll">{(['kick', 'snare', 'hat'] as Drum[]).map((kind, index) => <div className="drum-row" key={kind}><span>{['Kick', 'Snare', 'Hi-hat'][index]}</span><div>{Array.from({ length: 32 }, (_, i) => { const s = page * 32 + i; return <button key={i} aria-label={`${kind} ${s + 1}번째 칸`} aria-pressed={project.drums[kind].includes(s)} disabled={locked} className={`${project.drums[kind].includes(s) ? 'hit' : ''} ${i % 4 === 0 ? 'beat' : ''} ${step === s ? 'now' : ''}`} onClick={() => change(p => ({ ...p, drums: { ...p.drums, [kind]: p.drums[kind].includes(s) ? p.drums[kind].filter(v => v !== s) : [...p.drums[kind], s].sort((a, b) => a - b) } }))}/>; })}</div></div>)}</div></section>
          <section className={`panel voice-panel ${recording ? 'live' : ''}`}><div className="panel-title"><h2><span className="track-dot voice-dot"/>오디오 <span>03</span></h2><span className="muted">{project.recording ? `${project.recording.duration.toFixed(1)}초 녹음` : '보컬, 허밍, 어쿠스틱 악기'}</span></div><div className="voice-content"><div className="mic-art"><Icon name="mic" size={26}/></div><div><strong>{recording ? '지금의 아이디어를 녹음하고 있어요' : project.recording ? '녹음한 오디오가 스케치에 담겼어요' : '목소리로 아이디어를 더해 보세요'}</strong><p>{project.recording ? '재생 버튼으로 반주와 함께 들어보세요.' : '헤드폰을 연결하면 반주가 마이크에 다시 들어가지 않아요.'}</p></div><button disabled={!!busy} className={recording ? 'danger-button' : 'outline-button'} onClick={() => recording ? stop() : void record()}><Icon name={recording ? 'stop' : 'mic'} size={16}/>{recording ? '녹음 종료' : project.recording ? '다시 녹음' : '녹음하기'}</button></div>{project.recording && <div className="recording-tools"><label>시작 위치 보정 <input type="number" aria-label="녹음 시작 위치 보정 초" step="0.01" min="-5" max="48" disabled={locked} value={Number(project.recording.offset.toFixed(2))} onChange={e => { stop(); change(p => ({ ...p, recording: p.recording ? { ...p.recording, offset: Math.max(-5, Math.min(48, Number(e.target.value))) } : null })); }}/><span>초 · 음수는 앞당김</span></label><button className="text-button" disabled={locked} onClick={() => { stop(); change(p => ({ ...p, recording: null })); }}>녹음 삭제</button></div>}</section>
        </div><aside className="mixer panel"><div className="panel-title"><h2>믹서</h2><span className="muted">LEVELS</span></div>{(['keys', 'drums', 'voice'] as Track[]).map((track, i) => <div className="mixer-track" key={track}><div><span className={`track-dot ${track}-dot`}/><strong>{['멜로디', '드럼', '오디오'][i]}</strong><button disabled={locked} className={`mute ${project.mixer[track].mute ? 'muted-on' : ''}`} aria-label={`${track} 음소거`} aria-pressed={project.mixer[track].mute} onClick={() => change(p => ({ ...p, mixer: { ...p.mixer, [track]: { ...p.mixer[track], mute: !p.mixer[track].mute } } }))}>M</button></div><input aria-label={`${track} 볼륨`} type="range" min="0" max="1" step="0.01" disabled={locked} value={project.mixer[track].volume} onChange={e => change(p => ({ ...p, mixer: { ...p.mixer, [track]: { ...p.mixer[track], volume: Number(e.target.value) } } }))}/><span className="level-label">VOLUME <b>{Math.round(project.mixer[track].volume * 100)}%</b></span></div>)}<div className="mixer-note"><Icon name="headphones"/><p>좋은 아이디어는<br/>완벽하지 않아도 괜찮아요.</p><span>일단, 재생해 보세요.</span></div></aside></div>
        <footer><span><i/> 모든 소리는 이 브라우저에서 만들어집니다.</span><button className="text-button" disabled={locked} onClick={async () => {
          if (!window.confirm('이 스케치를 브라우저에서 삭제할까요?')) return;
          stop(); clearTimeout(saveTimer.current); setBusy('삭제 중');
          try { await saveQueue.current.catch(() => {}); await deleteLocal(project.id); const items = await listLocal(); adopt(items.length ? await loadLocal(items[0].id) : createProject()); setProjects(items); history.current = { past: [], future: [] }; setSelected(null); }
          catch (error) { notify(error); } finally { setBusy(''); }
        }}>현재 스케치 삭제</button></footer>
      </div>
    </main>
    <div className="toast" role="status" aria-live="polite" hidden={!message && !busy}>{busy || message}</div>
    {dialog && <dialog ref={modal} onCancel={() => { if (!busy) setDialog(null); }} onClose={() => { if (!busy) setDialog(null); }}><div className="dialog-heading"><div><div className="eyebrow">MUMAK WORKSPACE</div><h2>{dialog === 'export' ? '다음 작업으로 이어가기' : '프로젝트 서버'}</h2></div><button disabled={!!busy} className="icon-button" aria-label="닫기" onClick={() => setDialog(null)}><Icon name="close"/></button></div>{dialog === 'export' ? <><p className="dialog-description">WAV로 소리를, MIDI로 음표를 가져가세요. 모든 WAV는 같은 시작점과 길이로 내보냅니다.</p><div className="export-grid">{([['mix', '전체 믹스', '스테레오 WAV · 44.1 kHz / 16 bit'], ['midi', 'MIDI 패턴', '멜로디 + 드럼 · 녹음 제외'], ['json', '프로젝트 백업', '음표와 녹음을 포함한 Mumak JSON'], ['keys', '멜로디 WAV', '현재 악기 소리'], ['drums', '드럼 WAV', '드럼 트랙'], ['voice', '오디오 WAV', '녹음 트랙']] as const).map(([kind, title, detail]) => <button key={kind} disabled={!!busy || kind === 'voice' && !project.recording} onClick={() => void exportFile(kind)}><Icon name="download"/><strong>{title}</strong><small>{detail}</small></button>)}</div><p className="dialog-footnote">WAV에는 현재 볼륨·음소거가 적용됩니다. MIDI에는 악기의 음색과 오디오 녹음이 포함되지 않습니다.</p></> : <><p className="dialog-description">실행 중인 mumak-back에 연결합니다. 브라우저 자동 저장과 별개로, 저장 버튼을 누를 때만 서버로 전송됩니다.</p><label className="form-label">서버 주소<input type="url" value={apiUrl} disabled={!!busy} onChange={e => { setApiUrl(e.target.value); setRemote([]); setServerState(''); }}/></label><label className="form-label">API 토큰 <span>설정한 경우만 입력 · 메모리에만 보관</span><input type="password" autoComplete="off" value={token} disabled={!!busy} onChange={e => setToken(e.target.value)}/></label><div className="server-buttons"><button className="outline-button" disabled={!!busy} onClick={() => void serverAction('list')}>연결 / 목록 새로고침</button><button className="export-button" disabled={!!busy} onClick={() => void serverAction('save')}>현재 프로젝트 저장</button></div><p className="server-state" role="status">{serverState}</p><div className="remote-list">{remote.map(item => <button key={item.id} disabled={!!busy} onClick={() => void serverAction('open', item.id)}><span>{item.title}<small>{item.bpm} BPM</small></span><span>열기 ↗</span></button>)}</div><p className="dialog-footnote">첫 버전은 단일 사용자용입니다. 공유 서버의 계정별 프로젝트 분리는 아직 지원하지 않습니다.</p></>}</dialog>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);

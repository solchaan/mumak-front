import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from './audio';
import { duration, type Project } from './model';
import { pitchSpelling } from './notation';
import { addTranscribedNotes, quantizeMelody, suggestedOctave, type DetectedNote } from './transcription';

export default function TranscriptionDialog({ project, apply, close }: { project: Project; apply: (next: Project, firstStep: number) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [detected, setDetected] = useState<DetectedNote[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [octave, setOctave] = useState(0);
  const [mute, setMute] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const engine = useRef<AudioEngine | null>(null);
  const alive = useRef(true);
  const previewRun = useRef(0);
  const result = useMemo(() => quantizeMelody(detected ?? [], project.bpm, project.recording?.offset ?? 0, octave), [detected, project.bpm, project.recording?.offset, octave]);
  const preview = useMemo(() => {
    if (!result.notes.length) return null;
    const first = result.notes[0].step;
    const notes = result.notes.map(n => ({ ...n, step: n.step - first }));
    const p = addTranscribedNotes({ ...project, bars: 1, notes: [], chords: [], recording: null, drums: { kick: [], snare: [], hat: [] } }, notes, true);
    return { ...p, mixer: { ...p.mixer, keys: { volume: .7, mute: false } } };
  }, [result, project]);
  useEffect(() => {
    dialog.current!.showModal(); alive.current = true;
    return () => { alive.current = false; previewRun.current++; engine.current?.dispose(); engine.current = null; };
  }, []);
  useEffect(() => {
    let cancelled = false, worker: Worker | undefined, decoder: AudioContext | undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        if (!project.recording) throw new Error('먼저 허밍이나 노래를 녹음해 주세요.');
        const data = await (await fetch(project.recording.dataUrl, { signal: controller.signal })).arrayBuffer();
        if (cancelled) return;
        decoder = new AudioContext();
        const audio = await decoder.decodeAudioData(data);
        await decoder.close(); decoder = undefined;
        if (cancelled) return;
        const rate = 16000;
        // Browser resampling supplies an anti-alias filter and mixes stereo to mono.
        const offline = new OfflineAudioContext(1, Math.ceil(audio.duration * rate), rate);
        const source = offline.createBufferSource(); source.buffer = audio; source.connect(offline.destination); source.start();
        const mono = await offline.startRendering();
        if (cancelled) return;
        worker = new Worker(new URL('./transcription.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<{ progress?: number; notes?: DetectedNote[]; error?: string }>) => {
          if (cancelled) return;
          if (event.data.error) { setError('음높이를 분석하지 못했습니다. 녹음을 다시 확인해 주세요.'); worker?.terminate(); }
          if (event.data.progress !== undefined) setProgress(event.data.progress);
          if (event.data.notes) { setDetected(event.data.notes); setOctave(suggestedOctave(event.data.notes)); worker?.terminate(); }
        };
        worker.onerror = () => { if (!cancelled) setError('음높이 분석을 시작하지 못했습니다. 창을 닫고 다시 시도해 주세요.'); worker?.terminate(); };
        const samples = mono.getChannelData(0).slice();
        worker.postMessage({ samples, sampleRate: rate }, [samples.buffer]);
      } catch { if (!cancelled) setError('녹음을 읽지 못했습니다. 이 브라우저에서 재생 가능한 녹음인지 확인해 주세요.'); }
    })();
    return () => { cancelled = true; controller.abort(); worker?.terminate(); if (decoder && decoder.state !== 'closed') void decoder.close(); };
  }, [project.recording]);
  function stop() { previewRun.current++; engine.current?.stop(); setPlaying(false); setPreparing(false); }
  async function listen() {
    if (playing || preparing) { stop(); return; }
    if (!preview) return;
    const run = ++previewRun.current;
    setPreparing(true);
    try {
      engine.current ??= new AudioEngine();
      const player = engine.current;
      player.onEnd = () => { if (alive.current) setPlaying(false); };
      await player.play(preview, false, false);
      if (!alive.current || run !== previewRun.current) { player.stop(); return; }
      setPlaying(true);
    } catch { if (alive.current) setError('미리 듣기를 재생하지 못했습니다.'); }
    finally { if (alive.current && run === previewRun.current) setPreparing(false); }
  }
  const needsBars = result.notes.length ? Math.ceil(Math.max(...result.notes.map(n => n.step + n.length)) / 16) - project.bars : 0;
  return <dialog ref={dialog} aria-label="녹음을 음표로 변환" className="transcription-dialog" onCancel={close}>
    <div className="dialog-heading"><h2>녹음을 음표로 변환</h2><button className="icon-button" aria-label="변환 닫기" onClick={close}>×</button></div>
    <p className="dialog-description">반주 없이 한 음씩 부른 허밍·노래에 맞춰져 있어요. {project.bpm} BPM의 16분음표 간격으로 정리하며, 추가한 뒤 오선지에서 수정할 수 있습니다.</p>
    {error ? <p role="alert" className="staff-error">{error}</p> : detected === null ? <div role="status" className="transcription-progress"><progress value={progress} max="1"/><p>음높이와 길이를 분석하는 중… {Math.round(progress * 100)}%</p><button className="text-button" onClick={close}>분석 취소</button></div> : <>
      {!detected.length ? <p role="status">뚜렷한 멜로디를 찾지 못했어요. 마이크 가까이에서 반주 없이 한 음씩 조금 길게 불러 주세요.</p> : <>
        <label className="form-label">옥타브 조절<select aria-label="변환 옥타브" value={octave} onChange={e => { stop(); setOctave(Number(e.target.value)); }}>{[-2, -1, 0, 1, 2, 3].map(n => <option key={n} value={n}>{n === 0 ? '원래 음높이' : `${n > 0 ? '+' : ''}${n}옥타브`}</option>)}</select><span>오선지 범위 C4–C6에 맞게 조절하세요.</span></label>
        <p role="status">{result.notes.length}개 음표{result.omitted > 0 ? ` · 범위 밖이거나 같은 칸에 겹치는 ${result.omitted}개 제외` : ''}{needsBars > 0 ? ` · ${needsBars}마디 자동 추가` : ''}</p>
        <div className="transcription-notes" aria-label="변환한 음표">{result.notes.slice(0, 80).map((n, i) => <span key={i} title={`${Math.floor(n.step / 16) + 1}마디 · ${n.length}칸`}>{pitchSpelling(n.pitch)}</span>)}{result.notes.length > 80 && <span>…</span>}</div>
        <label className="form-label"><input type="checkbox" checked={mute} onChange={e => setMute(e.target.checked)}/>추가 후 원본 녹음 소리 끄기</label>
        <div className="server-buttons"><button className="outline-button" disabled={!preview} onClick={() => void listen()}>{playing || preparing ? '미리 듣기 정지' : '변환 멜로디 듣기'}</button><button className="export-button" disabled={!result.notes.length} onClick={() => { try { const next = addTranscribedNotes(project, result.notes, mute); stop(); apply(next, result.notes[0].step); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>오선지에 추가</button></div>
        {preview && <p className="dialog-footnote">미리 듣기 {Math.round(duration(preview))}초 · 녹음의 시작 위치 보정을 반영합니다. 기존 음표와 녹음은 유지되며 실행 취소할 수 있습니다.</p>}
      </>}
    </>}
    <p className="dialog-footnote">분석은 이 브라우저에서 처리합니다. 떨리는 음, 빠른 음, 반주가 섞인 녹음은 직접 수정이 필요할 수 있어요.</p>
  </dialog>;
}

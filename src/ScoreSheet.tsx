import { useEffect, useRef, useState } from 'react';
import { Renderer } from 'vexflow';
import type { Project } from './model';
import { PATTERNS, accompaniment, keyLabel } from './notation';
import { VIEWS, VIEW_LABELS, geometry, type View } from './layout';
import { engraveSystem } from './score';
import { safeName } from './storage';

const BARS_PER_SYSTEM = 2;
// A printable lead sheet: the browser's print dialog turns it into a vector PDF, so no PDF library is needed and the
// title keeps its Korean text. Each system is its own SVG so page breaks fall between lines.
export default function ScoreSheet({ project, onClose }: { project: Project; onClose: () => void }) {
  const [view, setView] = useState<View>('melody');
  const [error, setError] = useState('');
  const systems = useRef<(HTMLDivElement | null)[]>([]);
  const g = geometry(project, view, BARS_PER_SYSTEM);
  const count = Math.ceil(project.bars / BARS_PER_SYSTEM);
  useEffect(() => {
    const acc = accompaniment(project);
    try {
      systems.current.forEach((element, i) => {
        if (!element) return;
        element.replaceChildren();
        const renderer = new Renderer(element, Renderer.Backends.SVG);
        renderer.resize(g.width, g.row);
        const context = renderer.getContext();
        context.setFillStyle('#111').setStrokeStyle('#111');
        engraveSystem({ context, project, acc, geometry: g, bars: [i * BARS_PER_SYSTEM, i * BARS_PER_SYSTEM + 1].filter(bar => bar < project.bars), y: 0, system: i, chordLabels: true, barNumbers: true });
        const svg = element.querySelector('svg');
        svg?.setAttribute('viewBox', `0 0 ${g.width} ${g.row}`); svg?.setAttribute('aria-hidden', 'true');
      });
      setError('');
    } catch (e) { setError(`악보를 그리지 못했습니다: ${e instanceof Error ? e.message : String(e)}`); }
  }, [project, view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // The print dialog suggests the document title as the PDF file name.
    const previous = document.title;
    document.title = `${safeName(project.title)} 악보`;
    return () => { document.title = previous; };
  }, [project.title]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  const meta = [project.key ? keyLabel(project.key) : null, `${project.bpm} BPM`, '4/4', VIEWS[view].includes('treble') ? `반주 ${PATTERNS.find(x => x.id === project.accompaniment.pattern)?.label ?? ''}` : null].filter(Boolean).join(' · ');
  return <div className="print-sheet" role="dialog" aria-modal="true" aria-label="악보 인쇄">
    <div className="print-tools">
      <label>악보 표시<select aria-label="인쇄 악보 표시" value={view} onChange={e => setView(e.target.value as View)}>{(Object.keys(VIEWS) as View[]).map(v => <option key={v} value={v}>{VIEW_LABELS[v]}</option>)}</select></label>
      <button className="export-button" onClick={() => window.print()}>PDF로 저장</button>
      <button className="outline-button" onClick={onClose}>닫기</button>
      <span>인쇄 대화상자에서 대상을 "PDF로 저장"으로 고르세요 · A4 세로 · 파일 이름은 프로젝트 이름을 따릅니다 · Esc로 닫기</span>
    </div>
    <div className="print-page">
      <header><h1>{project.title}</h1><p>{meta}</p></header>
      {error && <p className="staff-error" role="alert">{error}</p>}
      {Array.from({ length: count }, (_, i) => <div key={`${view}-${i}`} className="print-system" ref={element => { systems.current[i] = element; }}/>)}
      <footer>Mumak 음악 스케치북</footer>
    </div>
  </div>;
}

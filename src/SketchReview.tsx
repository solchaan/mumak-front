import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from './model';
import { apiRequest } from './storage';
import { suggestionPayload } from './harmony';
import { applyReviewEdit, reviewFingerprint, type Alternative, type SketchReview as Report } from './review';
import './review.css';

interface Props {
  project: Project; apiUrl: string; token: string; disabled: boolean; playing: boolean;
  change: (project: Project) => void; preview: (project: Project) => Promise<void>; stop: () => void;
  locate: (step: number, noteId?: string) => void;
}
export function SketchReview({ project, apiUrl, token, disabled, playing, change, preview, stop, locate }: Props) {
  const fingerprint = useMemo(() => reviewFingerprint(project), [project]);
  const latest = useRef(fingerprint); latest.current = fingerprint;
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  const [result, setResult] = useState<{ fingerprint: string; report: Report } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [audition, setAudition] = useState('');
  useEffect(() => { if (!playing) setAudition(''); }, [playing]);
  // An edit ends the comparison, so the label never describes different audio.
  useEffect(() => { if (audition) { stop(); setAudition(''); } }, [project]);
  const stale = !!result && result.fingerprint !== fingerprint;
  async function evaluate() {
    const id = ++sequence.current;
    setLoading(true); setError('');
    try {
      const report = await apiRequest<Report>(apiUrl, token, '/harmony/review', 'POST', suggestionPayload(project, 0, 16));
      if (sequence.current !== id) return;
      if (latest.current !== fingerprint) { setError('분석 중 스케치가 바뀌었습니다. 다시 평가해 주세요.'); return; }
      setResult({ fingerprint, report });
    } catch (error) {
      if (sequence.current === id) setError(`평가를 불러오지 못했습니다. ${error instanceof Error ? error.message : String(error)}`);
    } finally { if (sequence.current === id) setLoading(false); }
  }
  async function listen(option?: Alternative) {
    if (stale || disabled) return;
    try { setError(''); await preview(option ? applyReviewEdit(project, option.edit) : project); setAudition(option ? option.title : '원본'); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  function apply(option: Alternative) {
    if (stale || disabled) return;
    try { const next = applyReviewEdit(project, option.edit); stop(); change(next); setError(''); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }
  return <section className="panel sketch-review" aria-label="코드·멜로디 평가">
    <div className="panel-title"><h2>코드·멜로디 평가</h2><button className="outline-button" disabled={disabled || loading} aria-busy={loading} onClick={() => void evaluate()}>{loading ? '평가 중…' : result ? '다시 평가' : '스케치 평가'}</button></div>
    <p className="review-intro">좋은 점과 확인할 부분을 살펴보고, 다른 음을 직접 비교해 보세요. 정답이나 총점을 매기지 않습니다.</p>
    {error && <p role="alert" className="review-error">{error}</p>}
    {result && <div className="review-result">
      {stale && <p role="status" className="review-stale">스케치가 변경되어 이전 평가를 표시하고 있습니다. 대안을 듣거나 적용하려면 다시 평가해 주세요.</p>}
      <p className="review-summary">{result.report.key.tonic} {result.report.key.mode === 'major' ? '장조' : '단조'} · {result.report.key.estimated ? '추정 조성' : '지정 조성'}<br/>{result.report.summary}</p>
      <div className="review-columns">{([{ key: 'good', title: '좋은 점', empty: '아직 뚜렷한 특징을 찾지 못했습니다. 좋지 않은 곡이라는 뜻은 아닙니다.' }, { key: 'consider', title: '확인해 볼 부분', empty: '현재 규칙으로 확인할 부분을 찾지 못했습니다. 완성도를 보장하는 판정은 아닙니다.' }] as const).map(group => <div key={group.key}><h3>{group.title}</h3><ul aria-label={group.title}>{result.report[group.key].map((item, index) => <li key={`${item.code}-${index}`}><strong>{item.title}</strong><button className="text-button review-location" disabled={disabled || stale} onClick={() => locate(item.step, item.noteId)}>{item.location} 보기</button><p>{item.detail}</p></li>)}</ul>{!result.report[group.key].length && <p>{group.empty}</p>}</div>)}</div>
      <h3>수정해서 들어볼 대안</h3><p className="review-intro">각 대안은 한 곳만 바꿉니다. 처음부터 전체를 재생하며, 적용하기 전에는 저장된 스케치가 바뀌지 않습니다.</p>
      <div className="review-actions"><button className="outline-button" disabled={disabled || stale} onClick={() => void listen()}>원본 듣기</button><button className="text-button" disabled={!playing || disabled} onClick={stop}>비교 재생 정지</button>{playing && audition && <span role="status">{audition} 듣는 중</span>}</div>
      <ul className="review-alternatives" aria-label="수정 대안">{result.report.alternatives.map((option, i) => <li key={i}><strong>{option.location} · {option.title}</strong><p>{option.reason}</p><div className="review-actions"><button className="outline-button" disabled={disabled || stale} onClick={() => void listen(option)} aria-label={`${option.location} ${option.title} 대안 듣기`}>대안 듣기</button><button className="text-button" disabled={disabled || stale} onClick={() => apply(option)} aria-label={`${option.location} ${option.title} 적용`}>이 대안 적용</button></div></li>)}</ul>
      {!result.report.alternatives.length && <p className="review-intro">자동으로 바꿀 만한 단일 음표·코드 대안이 없습니다. 위 관찰을 참고해 직접 편집해 보세요.</p>}
      <p className="review-intro">적용 후 실행 취소로 되돌릴 수 있습니다.</p>
      <details className="review-limits"><summary>평가 범위와 한계</summary><ul>{result.report.limitations.map(text => <li key={text}>{text}</li>)}</ul></details>
    </div>}
  </section>;
}

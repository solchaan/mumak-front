import { useEffect, useState, type ReactNode } from 'react';
import { apiRequest } from './storage';
import './login.css';

export type LoginSession = { base: string; token: string };

export function LoginGate({ children }: { children: (session: LoginSession, logout: () => void) => ReactNode }) {
  const [session, setSession] = useState<LoginSession | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = import.meta.env.VITE_API_URL || window.location.origin;
  useEffect(() => {
    const expired = () => { setSession(null); setPassword(''); setError('로그인 정보가 만료되었거나 변경되었습니다. 다시 로그인해 주세요.'); };
    window.addEventListener('mumak:unauthorized', expired);
    return () => window.removeEventListener('mumak:unauthorized', expired);
  }, []);
  if (session) return children(session, () => { void apiRequest(session.base, session.token, '/auth/logout', 'POST').catch(() => {}); setSession(null); setPassword(''); setError(''); });
  return <main className="login-page">
    <section className="login-intro" aria-label="Mumak 소개">
      <a className="login-brand" href="/">mumak<span>♪</span></a>
      <div><p className="eyebrow">YOUR IDEAS, IN TUNE</p><h1>떠오른 멜로디가<br/>음악이 되는 곳.</h1><p>작은 흥얼거림부터 첫 번째 스케치까지.<br/>나만의 작업실에서 음악을 이어가세요.</p></div>
      <div className="login-notes" aria-hidden="true">♩ &nbsp; ♪ &nbsp; ♫ &nbsp; ♩</div>
      <small>MUMAK · YOUR PERSONAL MUSIC WORKSPACE</small>
    </section>
    <section className="login-panel"><form onSubmit={async event => {
      event.preventDefault();
      if (busy || !username.trim() || !password) return;
      setBusy(true); setError('');
      try {
        const result = await apiRequest<{ token: string }>(base, '', '/auth/login', 'POST', { username: username.trim(), password });
        if (!result.token) throw new Error('로그인 정보를 확인할 수 없습니다.');
        setSession({ base, token: result.token }); setPassword('');
      } catch (error) { setError(error instanceof TypeError ? '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' : error instanceof Error ? error.message : '로그인에 실패했습니다.'); }
      finally { setBusy(false); }
    }}>
      <p className="eyebrow">WELCOME TO MUMAK</p><h2>내 작업실에 로그인</h2><p className="login-description">계속하려면 로그인 정보를 입력해 주세요.</p>
      <label className="form-label" htmlFor="login-username">아이디<input id="login-username" autoComplete="username" autoFocus required maxLength={64} value={username} disabled={busy} onChange={event => setUsername(event.target.value)} placeholder="아이디를 입력하세요"/></label>
      <label className="form-label" htmlFor="login-password">비밀번호<input id="login-password" type="password" autoComplete="current-password" required maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} placeholder="비밀번호를 입력하세요"/></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button className="login-submit" type="submit" disabled={busy || !username.trim() || !password}>{busy ? '로그인 확인 중…' : '로그인 →'}</button>
      <p className="login-footnote">로그인 정보는 이 창의 메모리에만 보관됩니다.<br/>새로고침하거나 창을 닫으면 다시 로그인해 주세요.</p>
    </form></section>
  </main>;
}

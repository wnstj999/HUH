import { useEffect, useState, type FormEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowRight, Check, ShieldCheck, Users, Activity } from 'lucide-react';
import { authConfigured, signIn } from '../lib/auth';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import type { HealthStatus } from '../types';

export function OperatorLogin({ initialError = '' }: { initialError?: string }) {
  const { t, language, setLanguage } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  useEffect(() => { void api.health().then(setHealth).catch(() => setHealth(null)); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try { await signIn(email, password); setPassword(''); }
    catch { setError(t('loginFailed')); }
    finally { setBusy(false); }
  }
  const ko = language === 'ko';
  return <main className="welcome-page">
    <header className="welcome-nav"><NavLink to="/" className="welcome-brand"><span>H</span> HUH <small>INHOUSE CLUB</small></NavLink><button className="language-toggle" onClick={() => setLanguage(ko ? 'en' : 'ko')}>{ko ? 'EN' : '한국어'}</button></header>
    <div className="welcome-layout">
      <section className="welcome-story"><p className="eyebrow">OUR GAMES. OUR BALANCE.</p><h1>{ko ? <>같이 하는 게임,<br /><em>더 재밌는 팀.</em></> : <>Your games.<br /><em>Better teams.</em></>}</h1><p className="welcome-description">{ko ? '동아리의 경기 기록이 다음 내전의 기준이 됩니다. 참가자부터 팀 편성, 경기 결과까지 한곳에서 운영하세요.' : 'Keep your club’s players, balanced teams and match results together. Your games inform your next lineup.'}</p>
        <div className="welcome-features"><div><Users size={21} /><span>{ko ? '오늘 참가자 선택' : 'Select today’s players'}</span></div><div><Activity size={21} /><span>{ko ? '포지션별 전력으로 팀 편성' : 'Balance by role and power'}</span></div><div><ShieldCheck size={21} /><span>{ko ? '중앙 DB에 경기 기록 보관' : 'Store results in the shared database'}</span></div></div>
        <div className="welcome-match" aria-hidden="true"><div><span>BLUE TEAM</span><strong>TOP · JUG · MID · ADC · SUP</strong></div><b>VS</b><div><span>RED TEAM</span><strong>TOP · JUG · MID · ADC · SUP</strong></div></div><p className="helper">{ko ? '팀 구성 예시입니다. 실제 참가자와 점수는 로그인 후 표시됩니다.' : 'Illustrative lineup. Real players and scores appear after sign-in.'}</p>
      </section>
      <section className="login-card"><span className="login-icon"><ShieldCheck size={25} /></span><p className="eyebrow">MEMBERS ONLY</p><h2>{t('loginTitle')}</h2><p>{ko ? '운영자 계정으로 로그인하면 어느 기기에서도 같은 참가자와 기록을 확인할 수 있습니다.' : 'Use your operator account to access the same players and records on every device.'}</p>
        {!authConfigured && <div className="alert" role="alert">{ko ? '사이트의 로그인 연결이 준비되지 않았습니다. 운영 연결을 확인해야 합니다.' : 'The site’s sign-in connection is not ready.'}</div>}
        <form onSubmit={submit}><label className="field"><span>{t('email')}</span><input className="input" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} /></label><label className="field"><span>{t('password')}</span><input className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full" disabled={!authConfigured || busy}>{busy ? t('loading') : t('signIn')}<ArrowRight size={17} /></button></form>
        <div className={`connection-note ${health?.database ? 'ready' : ''}`}><Check size={15} /><span>{health?.database ? (ko ? '중앙 저장소 연결됨' : 'Shared database connected') : (ko ? '중앙 저장소 연결 확인 필요' : 'Shared database connection needs attention')}</span></div><p className="helper">{ko ? 'Riot 자동 수집은 권한과 연결 준비 후 제공됩니다. 현재 수동 경기 기록을 지원합니다.' : 'Riot automation requires additional access and integration. Manual match records are supported.'}</p>
      </section>
    </div>
    <footer><span>{t('footer')}</span><NavLink to="/privacy">{t('privacy')}</NavLink><NavLink to="/terms">{t('terms')}</NavLink></footer>
  </main>;
}

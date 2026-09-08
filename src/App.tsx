import { useCallback, useEffect, useMemo, useState, type FormEvent, type PropsWithChildren, type ReactNode } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { Activity, BarChart3, CalendarPlus, ChevronDown, CircleGauge, History, Languages, Pencil, RefreshCw, Save, Settings as SettingsIcon, ShieldCheck, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useI18n, type MessageKey } from './i18n';
import { api, API_BASE_URL } from './lib/api';
import { formatDate, formatDuration, formatRank } from './lib/format';
import { getAccessToken, getRememberKeys, getRiotApiKey, maskKey, saveBrowserKeys } from './lib/storage';
import { buildBalancedTeams, REQUIRED_POSITIONS, swapAssignments } from './lib/teamBalancer';
import { parseRiotId } from './lib/riotId';
import { TIER_SCORES, type BalancedTeams, type HistoricalRank, type HealthStatus, type InhouseMatch, type InhouseTier, type MatchParticipant, type Player, type PlayerInput, type Position, type SeasonRankRecord } from './types';

interface AppData { players: Player[]; matches: InhouseMatch[]; health: HealthStatus | null }

function useAppData() {
  const [data, setData] = useState<AppData>({ players: [], matches: [], health: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    const results = await Promise.allSettled([api.players(), api.matches(), api.health()]);
    const firstError = results.find((result) => result.status === 'rejected');
    setData({
      players: results[0].status === 'fulfilled' ? results[0].value : [],
      matches: results[1].status === 'fulfilled' ? results[1].value : [],
      health: results[2].status === 'fulfilled' ? results[2].value : null,
    });
    if (firstError?.status === 'rejected') setError(firstError.reason instanceof Error ? firstError.reason.message : '데이터를 불러오지 못했습니다.');
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, error, reload };
}

function StatusDot({ ok, waiting = false }: { ok: boolean; waiting?: boolean }) {
  return <span className={`status-dot ${ok ? 'ok' : waiting ? 'waiting' : 'bad'}`} aria-hidden="true" />;
}

function Shell({ children }: PropsWithChildren) {
  const { language, setLanguage, t } = useI18n();
  const nav: Array<[string, MessageKey, ReactNode]> = [
    ['/', 'dashboard', <CircleGauge />], ['/players', 'players', <Users />], ['/builder', 'builder', <CalendarPlus />],
    ['/history', 'history', <History />], ['/stats', 'stats', <BarChart3 />], ['/settings', 'settings', <SettingsIcon />],
  ];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">H</span><div><strong>HUH</strong><small>INHOUSE CONTROL</small></div></div>
      <nav className="main-nav" aria-label="Main navigation">
        {nav.map(([path, key, icon]) => <NavLink key={path} end={path === '/'} to={path}>{icon}<span>{t(key)}</span></NavLink>)}
      </nav>
      <div className="sidebar-foot"><ShieldCheck size={16} /><span>PRIVATE COMMUNITY</span></div>
    </aside>
    <div className="content-column">
      <header className="topbar">
        <div className="live-label"><span className="pulse" /> LIVE OPERATIONS</div>
        <button className="language-toggle" onClick={() => setLanguage(language === 'ko' ? 'en' : 'ko')} aria-label="Change language"><Languages size={16} /><strong className={language === 'ko' ? 'on' : ''}>KR</strong><span>|</span><strong className={language === 'en' ? 'on' : ''}>EN</strong></button>
      </header>
      <main className="main-content">{children}</main>
      <footer><span>{t('footer')}</span><NavLink to="/privacy">{t('privacy')}</NavLink><NavLink to="/terms">{t('terms')}</NavLink></footer>
    </div>
  </div>;
}

function PageHeader({ title, kicker, actions }: { title: string; kicker?: string; actions?: ReactNode }) {
  return <div className="page-header"><div>{kicker && <p className="kicker">{kicker}</p>}<h1>{title}</h1></div>{actions && <div className="header-actions">{actions}</div>}</div>;
}

function Alert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return <div className="alert"><strong>{t('error')}</strong><span>{message}</span>{onRetry && <button className="text-button" onClick={onRetry}>{t('retry')}</button>}</div>;
}

function Dashboard({ data, loading, error, reload }: ReturnType<typeof useAppData>) {
  const { t, language } = useI18n();
  const activePlayers = data.players.filter((player) => player.active);
  const recent = data.matches.slice(0, 5);
  return <>
    <PageHeader title={t('dashboard')} kicker="OPERATIONS OVERVIEW" actions={<button className="button secondary" onClick={reload}><RefreshCw size={16} />{t('refresh')}</button>} />
    {error && <Alert message={error} onRetry={reload} />}
    <section className="metric-grid">
      <Metric label={t('registered')} value={activePlayers.length} hint="PLAYERS" />
      <Metric label={t('participating')} value={activePlayers.filter((player) => player.participating).length} hint="TODAY" accent />
      <Metric label={t('matches')} value={data.matches.length} hint="RECORDED" />
      <Metric label={t('apiStatus')} value={data.health?.riotConfigured || getRiotApiKey() ? t('connected') : t('notConfigured')} hint="RIOT" status={Boolean(data.health?.riotConfigured || getRiotApiKey())} />
    </section>
    <section className="split-grid">
      <article className="panel wide"><div className="panel-head"><h2>{t('recentMatches')}</h2><NavLink className="text-link" to="/history">{t('history')} →</NavLink></div>
        {loading ? <Empty text={t('loading')} /> : recent.length ? <div className="match-list">{recent.map((match) => <MatchSummary key={match.id} match={match} language={language} />)}</div> : <Empty text={t('emptyMatches')} />}
      </article>
      <article className="panel health-panel"><div className="panel-head"><h2>SYSTEM STATUS</h2><Activity size={18} /></div>
        <StatusLine label={t('backend')} ok={Boolean(data.health?.backend)} />
        <StatusLine label={t('database')} ok={Boolean(data.health?.database)} />
        <StatusLine label={t('opgg')} ok={Boolean(data.health?.opggEnabled)} />
        <StatusLine label={t('tournamentApi')} ok={false} waiting value={t('tournamentWaiting')} />
      </article>
    </section>
  </>;
}

function Metric({ label, value, hint, accent, status }: { label: string; value: string | number; hint: string; accent?: boolean; status?: boolean }) {
  return <article className={`metric ${accent ? 'accent' : ''}`}><div className="metric-top"><span>{label}</span>{status !== undefined && <StatusDot ok={status} />}</div><strong>{value}</strong><small>{hint}</small></article>;
}
function StatusLine({ label, ok, waiting, value }: { label: string; ok: boolean; waiting?: boolean; value?: string }) { const { t } = useI18n(); return <div className="status-line"><span><StatusDot ok={ok} waiting={waiting} />{label}</span><strong>{value || (ok ? t('connected') : t('notConfigured'))}</strong></div>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function MatchSummary({ match, language }: { match: InhouseMatch; language: string }) {
  const blue = match.participants.filter((participant) => participant.team === 'BLUE').map((participant) => participant.player?.displayName).filter(Boolean).join(' · ');
  const red = match.participants.filter((participant) => participant.team === 'RED').map((participant) => participant.player?.displayName).filter(Boolean).join(' · ');
  return <div className="match-summary"><div><strong>{match.event?.name || 'Inhouse'}</strong><small>{formatDate(match.createdAt, language)}</small></div><div className="versus"><span className={match.winnerTeam === 'BLUE' ? 'winner' : ''}>{blue || 'BLUE'}</span><b>VS</b><span className={match.winnerTeam === 'RED' ? 'winner' : ''}>{red || 'RED'}</span></div><StatusBadge status={match.status} /></div>;
}

const EMPTY_PLAYER: PlayerInput = { displayName: '', riotId: '', inhouseTier: 'C', positions: [], participating: false, active: true, note: '' };

function PlayersPage({ data, loading, error, reload }: ReturnType<typeof useAppData>) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState(''); const [tier, setTier] = useState(''); const [position, setPosition] = useState(''); const [onlyPlaying, setOnlyPlaying] = useState(false);
  const [sort, setSort] = useState<{ key: 'displayName' | 'inhouseScore' | 'riotId' | 'participating' | 'updatedAt'; direction: 1 | -1 }>({ key: 'displayName', direction: 1 });
  const [editing, setEditing] = useState<Player | null | undefined>(); const [historyModal, setHistoryModal] = useState<{ player: Player; queue: 'solo' | 'flex' } | null>(null); const [form, setForm] = useState<PlayerInput>(EMPTY_PLAYER); const [busy, setBusy] = useState(''); const [message, setMessage] = useState('');
  const filtered = useMemo(() => data.players.filter((player) => {
    const needle = query.toLocaleLowerCase();
    return (!needle || `${player.displayName} ${player.riotId}`.toLocaleLowerCase().includes(needle)) && (!tier || player.inhouseTier === tier) && (!position || player.positions.includes(position as Position)) && (!onlyPlaying || player.participating);
  }).sort((left, right) => {
    const a = left[sort.key]; const b = right[sort.key];
    return (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))) * sort.direction;
  }), [data.players, query, tier, position, onlyPlaying, sort]);
  function sortBy(key: typeof sort.key) { setSort((current) => ({ key, direction: current.key === key && current.direction === 1 ? -1 : 1 })); }
  const sortLabel = (label: string, key: typeof sort.key) => <button className="sort-head" onClick={() => sortBy(key)}>{label}{sort.key === key ? (sort.direction === 1 ? ' ↑' : ' ↓') : ''}</button>;
  function open(player?: Player) { setEditing(player ?? null); setForm(player ? { displayName: player.displayName, riotId: player.riotId, inhouseTier: player.inhouseTier, positions: player.positions, participating: player.participating, active: player.active, note: player.note } : EMPTY_PLAYER); setMessage(''); }
  async function submit(event: FormEvent) { event.preventDefault(); setBusy('save'); setMessage(''); try { parseRiotId(form.riotId); if (editing) await api.updatePlayer(editing.id, form); else await api.createPlayer(form); setEditing(undefined); await reload(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(''); } }
  async function update(id: string, input: Partial<PlayerInput>) { setBusy(id); setMessage(''); try { await api.updatePlayer(id, input); await reload(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(''); } }
  async function refreshOne(id: string) { setBusy(id); try { const result = await api.refreshPlayer(id); setMessage(result.warnings.join(' ')); await reload(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(''); } }
  async function refreshAll() { setBusy('all'); setMessage(''); const targets = filtered.filter((player) => player.active); const failures: string[] = []; for (const player of targets) { try { await api.refreshPlayer(player.id); } catch (cause) { failures.push(`${player.displayName}: ${cause instanceof Error ? cause.message : String(cause)}`); } } setMessage(failures.length ? failures.join('\n') : `${targets.length}명 갱신 완료`); await reload(); setBusy(''); }
  return <>
    <PageHeader title={t('players')} kicker="ROSTER DATABASE" actions={<><button className="button secondary" disabled={Boolean(busy)} onClick={refreshAll}><RefreshCw size={16} className={busy === 'all' ? 'spin' : ''} />{t('refreshAll')}</button><button className="button primary" onClick={() => open()}><UserPlus size={16} />{t('addPlayer')}</button></>} />
    {error && <Alert message={error} onRetry={reload} />}{message && <Alert message={message} />}
    <section className="panel roster-panel"><div className="filters"><input className="input search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} /><select className="input" value={tier} onChange={(event) => setTier(event.target.value)}><option value="">{t('allTiers')}</option>{Object.keys(TIER_SCORES).map((value) => <option key={value}>{value}</option>)}</select><select className="input" value={position} onChange={(event) => setPosition(event.target.value)}><option value="">{t('allPositions')}</option>{REQUIRED_POSITIONS.map((value) => <option key={value}>{value}</option>)}</select><label className="check"><input type="checkbox" checked={onlyPlaying} onChange={(event) => setOnlyPlaying(event.target.checked)} />{t('participatingOnly')}</label></div>
      <div className="table-wrap"><table><thead><tr><th>{sortLabel(t('name'), 'displayName')}</th><th>{sortLabel(t('inhouseTier'), 'inhouseScore')}</th><th>{sortLabel(t('riotId'), 'riotId')}</th><th>{t('positions')}</th><th>{t('currentSolo')}</th><th>{t('historicalSolo')}</th><th>{t('historicalFlex')}</th><th>{sortLabel(t('today'), 'participating')}</th><th>{sortLabel(t('updated'), 'updatedAt')}</th><th>{t('note')}</th><th>{t('actions')}</th></tr></thead><tbody>{loading ? <tr><td colSpan={11}><Empty text={t('loading')} /></td></tr> : filtered.map((player) => <tr key={player.id} className={!player.active ? 'inactive-row' : ''}><td><strong>{player.displayName}</strong>{!player.active && <small className="block">{t('inactive')}</small>}</td><td><Tier tier={player.inhouseTier} score={player.inhouseScore} /></td><td>{player.riotId}</td><td><div className="tag-row">{player.positions.map((item) => <span className="position-tag" key={item}>{item}</span>)}</div></td><td>{formatRank(player, 'current')}</td><td><RankHistoryCell value={formatRank(player, 'solo')} records={player.historicalRankHistory.solo} label={t('seasonHistory')} onOpen={() => setHistoryModal({ player, queue: 'solo' })} /></td><td><RankHistoryCell value={formatRank(player, 'flex')} records={player.historicalRankHistory.flex} label={t('seasonHistory')} onOpen={() => setHistoryModal({ player, queue: 'flex' })} /></td><td><label className="switch"><input type="checkbox" checked={player.participating} disabled={!player.active || busy === player.id} onChange={(event) => update(player.id, { participating: event.target.checked })} /><span /></label></td><td className="muted-cell">{formatDate(player.riotLastUpdatedAt || player.updatedAt, language)}</td><td className="note-cell">{player.note || '—'}</td><td><div className="row-actions"><button title={t('edit')} onClick={() => open(player)}><Pencil size={15} /></button><button title={t('rankRefresh')} disabled={busy === player.id || !player.active} onClick={() => refreshOne(player.id)}><RefreshCw size={15} className={busy === player.id ? 'spin' : ''} /></button><button title={t('deactivate')} disabled={!player.active} onClick={() => { if (confirm(`${player.displayName} - ${t('deactivate')}?`)) void api.deactivatePlayer(player.id).then(reload); }}><Trash2 size={15} /></button></div></td></tr>)}{!loading && !filtered.length && <tr><td colSpan={11}><Empty text={t('emptyPlayers')} /></td></tr>}</tbody></table></div>
    </section>
    {editing !== undefined && <Modal title={editing ? t('editPlayer') : t('addPlayer')} onClose={() => setEditing(undefined)}><form onSubmit={submit} className="form-grid"><Field label={t('name')}><input className="input" required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></Field><Field label={t('inhouseTier')}><select className="input" value={form.inhouseTier} onChange={(event) => setForm({ ...form, inhouseTier: event.target.value as InhouseTier })}>{Object.entries(TIER_SCORES).map(([name, score]) => <option key={name} value={name}>{name} · {score}</option>)}</select></Field><Field label={t('riotId')} wide><input className="input" required placeholder="GameName#TagLine" value={form.riotId} onChange={(event) => setForm({ ...form, riotId: event.target.value })} /></Field><Field label={t('positions')} wide><div className="position-choices">{REQUIRED_POSITIONS.map((item) => <label key={item}><input type="checkbox" checked={form.positions.includes(item)} onChange={() => setForm({ ...form, positions: form.positions.includes(item) ? form.positions.filter((value) => value !== item) : [...form.positions, item] })} />{item}</label>)}<button type="button" className="text-button" onClick={() => setForm({ ...form, positions: [...REQUIRED_POSITIONS] })}>ALL</button></div></Field><Field label={t('note')} wide><textarea className="input" rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field><label className="check"><input type="checkbox" checked={form.participating} onChange={(event) => setForm({ ...form, participating: event.target.checked })} />{t('participating')}</label>{message && <div className="form-error">{message}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setEditing(undefined)}>{t('cancel')}</button><button className="button primary" disabled={busy === 'save'}><Save size={16} />{t('save')}</button></div></form></Modal>}
    {historyModal && <SeasonHistoryModal player={historyModal.player} queue={historyModal.queue} onClose={() => setHistoryModal(null)} />}
  </>;
}

function Tier({ tier, score }: { tier: InhouseTier; score?: number }) { return <span className={`tier tier-${tier}`}>{tier}{score !== undefined && <small>{score}</small>}</span>; }
function shortRank(rank: HistoricalRank | null) { return rank ? [rank.tier, rank.division ? ['I', 'II', 'III', 'IV'][Number(rank.division) - 1] : null, rank.lp == null ? null : `${rank.lp}LP`].filter(Boolean).join(' ') : '—'; }
function RankHistoryCell({ value, records, label, onOpen }: { value: string; records: SeasonRankRecord[]; label: string; onOpen: () => void }) { return <div className="rank-history-cell"><strong>{value}</strong>{records.length > 0 && <button className="text-button" onClick={onOpen}>{label} ({records.length})</button>}</div>; }
function SeasonHistoryModal({ player, queue, onClose }: { player: Player; queue: 'solo' | 'flex'; onClose: () => void }) { const { t } = useI18n(); const records = player.historicalRankHistory[queue]; return <Modal title={`${player.displayName} · ${t(queue === 'solo' ? 'soloQueue' : 'flexQueue')}`} onClose={onClose}><div className="season-rank-history"><div className="season-rank-header"><span>{t('seasonHistory')}</span><span>{t('peakRank')}</span></div>{records.map((record) => <div className="season-rank-row" key={record.season}><strong>{record.season}</strong><b>{shortRank(record.peakRank)}</b></div>)}</div></Modal>; }
function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) { return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h2>{title}</h2><button onClick={onClose}><X /></button></div>{children}</section></div>; }

function BuilderPage({ data, reload }: ReturnType<typeof useAppData>) {
  const { t } = useI18n(); const navigate = useNavigate();
  const candidates = data.players.filter((player) => player.active && player.participating);
  const [selected, setSelected] = useState<string[]>([]); const [teams, setTeams] = useState<BalancedTeams | null>(null); const [eventName, setEventName] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  function toggle(id: string) { setTeams(null); setMessage(''); setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 10 ? [...current, id] : current); }
  function build() { try { setTeams(buildBalancedTeams(selected.map((id) => candidates.find((player) => player.id === id)!).filter(Boolean))); setMessage(''); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } }
  async function save() { if (!teams) return; setBusy(true); try { await api.createMatch(eventName || new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(new Date()), teams.assignments); await reload(); navigate('/history'); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  function swap(firstId: string, secondId: string) { if (!teams) return; try { const assignments = swapAssignments(teams.assignments, firstId, secondId); const blueScore = assignments.filter((entry) => entry.team === 'BLUE').reduce((sum, entry) => sum + entry.player.inhouseScore, 0); const redScore = assignments.filter((entry) => entry.team === 'RED').reduce((sum, entry) => sum + entry.player.inhouseScore, 0); setTeams({ assignments, blueScore, redScore, difference: Math.abs(blueScore - redScore) }); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } }
  return <><PageHeader title={t('builder')} kicker="BALANCED 5 VS 5" /><section className="builder-layout"><article className="panel"><div className="panel-head"><div><h2>{t('selectTen')}</h2><p>{t('selected')} <strong className={selected.length === 10 ? 'good-text' : ''}>{selected.length}/10</strong></p></div><button className="button primary" disabled={selected.length !== 10} onClick={build}>{t('autoBuild')}</button></div>{message && <Alert message={message} />}<div className="candidate-grid">{candidates.map((player) => <button key={player.id} className={`candidate ${selected.includes(player.id) ? 'selected' : ''}`} onClick={() => toggle(player.id)}><Tier tier={player.inhouseTier} /><span><strong>{player.displayName}</strong><small>{player.positions.join(' · ')}</small></span><b>{player.inhouseScore}</b></button>)}</div>{!candidates.length && <Empty text={t('emptyPlayers')} />}</article>
      <article className="panel teams-panel"><Field label={t('eventName')}><input className="input" value={eventName} onChange={(event) => setEventName(event.target.value)} placeholder={t('eventPlaceholder')} /></Field>{teams ? <><div className="team-columns">{(['BLUE', 'RED'] as const).map((team) => <div className={`team-card ${team.toLowerCase()}`} key={team}><div className="team-head"><strong>{t(team === 'BLUE' ? 'blue' : 'red')}</strong><span>{t('total')} {team === 'BLUE' ? teams.blueScore : teams.redScore}</span></div>{teams.assignments.filter((entry) => entry.team === team).map((assignment) => <div className="slot" key={`${team}-${assignment.position}`}><span className="slot-position">{assignment.position}</span><select value={assignment.player.id} onChange={(event) => swap(assignment.player.id, event.target.value)}>{teams.assignments.map((option) => <option key={option.player.id} value={option.player.id}>{option.player.displayName} · {option.player.inhouseTier}</option>)}</select><b>{assignment.player.inhouseScore}</b></div>)}</div>)}</div><div className="score-diff"><span>{t('difference')}</span><strong>{teams.difference}</strong></div><p className="helper">{t('manualHint')}</p><button className="button primary full" disabled={busy} onClick={save}><Save size={16} />{t('saveMatch')}</button></> : <div className="formation-placeholder"><div>TOP</div><div>JUG</div><div>MID</div><div>ADC</div><div>SUP</div><p>10 PLAYERS / 2 TEAMS / 5 ROLES</p></div>}</article></section></>;
}

function HistoryPage({ data, reload }: ReturnType<typeof useAppData>) {
  const { t, language } = useI18n(); const [expanded, setExpanded] = useState(''); const [message, setMessage] = useState('');
  async function update(match: InhouseMatch, patch: Parameters<typeof api.updateMatch>[1]) { try { await api.updateMatch(match.id, patch); await reload(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } }
  return <><PageHeader title={t('history')} kicker="RECORDED MATCHES" />{message && <Alert message={message} />}<section className="panel"><div className="table-wrap"><table><thead><tr><th>{t('match')}</th><th>{t('date')}</th><th>BLUE</th><th>RED</th><th>{t('winner')}</th><th>{t('duration')}</th><th>{t('status')}</th><th>Tournament API</th><th /></tr></thead><tbody>{data.matches.map((match, index) => <MatchRows key={match.id} match={match} number={data.matches.length - index} language={language} expanded={expanded === match.id} toggle={() => setExpanded(expanded === match.id ? '' : match.id)} update={update} reload={reload} />)}{!data.matches.length && <tr><td colSpan={9}><Empty text={t('emptyMatches')} /></td></tr>}</tbody></table></div></section></>;
}

function MatchRows({ match, number, language, expanded, toggle, update, reload }: { match: InhouseMatch; number: number; language: string; expanded: boolean; toggle: () => void; update: (match: InhouseMatch, patch: Parameters<typeof api.updateMatch>[1]) => Promise<void>; reload: () => Promise<void> }) {
  const { t } = useI18n(); const names = (team: 'BLUE' | 'RED') => match.participants.filter((participant) => participant.team === team).map((participant) => participant.player?.displayName).join(', ');
  return <><tr><td><strong>#{number}</strong><small className="block">{match.event?.name}</small></td><td>{formatDate(match.createdAt, language)}</td><td className={match.winnerTeam === 'BLUE' ? 'winner-cell' : ''}>{names('BLUE')}</td><td className={match.winnerTeam === 'RED' ? 'winner-cell' : ''}>{names('RED')}</td><td><select className="compact-select" value={match.winnerTeam ?? ''} onChange={(event) => update(match, { winnerTeam: (event.target.value || null) as InhouseMatch['winnerTeam'] })}><option value="">—</option><option>BLUE</option><option>RED</option></select></td><td>{formatDuration(match)}</td><td><select className="compact-select" value={match.status} onChange={(event) => update(match, { status: event.target.value as InhouseMatch['status'] })}><option value="READY">{t('ready')}</option><option value="IN_PROGRESS">{t('inProgress')}</option><option value="COMPLETED">{t('completed')}</option><option value="CANCELLED">{t('cancelled')}</option></select></td><td><span className="waiting-label"><StatusDot ok={false} waiting />{t('tournamentWaiting')}</span></td><td><button className="row-expand" onClick={toggle}><ChevronDown className={expanded ? 'up' : ''} /></button></td></tr>{expanded && <tr className="detail-row"><td colSpan={9}><div className="participant-editor"><p className="helper">실제 경기 결과를 입력하면 개인 통계에 즉시 반영됩니다.</p>{match.participants.map((participant) => <ParticipantEditor key={participant.id} participant={participant} reload={reload} />)}</div></td></tr>}</>;
}

function ParticipantEditor({ participant, reload }: { participant: MatchParticipant; reload: () => Promise<void> }) {
  const [values, setValues] = useState({ championName: participant.championName ?? '', kills: participant.kills ?? '', deaths: participant.deaths ?? '', assists: participant.assists ?? '', cs: participant.cs ?? '', damageToChampions: participant.damageToChampions ?? '', visionScore: participant.visionScore ?? '' });
  const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); await api.updateParticipant(participant.id, values).then(reload).finally(() => setBusy(false)); }
  return <div className="participant-line"><span className={`team-pin ${participant.team.toLowerCase()}`}>{participant.team[0]}</span><b>{participant.position}</b><strong>{participant.player?.displayName}</strong><input placeholder="Champion" value={values.championName} onChange={(event) => setValues({ ...values, championName: event.target.value })} />{(['kills', 'deaths', 'assists', 'cs', 'damageToChampions', 'visionScore'] as const).map((key) => <input key={key} type="number" min="0" placeholder={key === 'damageToChampions' ? 'DMG' : key === 'visionScore' ? 'VS' : key.toUpperCase()} value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} />)}<button disabled={busy} onClick={save}><Save size={14} /></button></div>;
}

function StatusBadge({ status }: { status: InhouseMatch['status'] }) { const { t } = useI18n(); const keys: Record<InhouseMatch['status'], MessageKey> = { READY: 'ready', IN_PROGRESS: 'inProgress', COMPLETED: 'completed', CANCELLED: 'cancelled' }; return <span className={`status-badge status-${status.toLowerCase()}`}>{t(keys[status])}</span>; }

function StatsPage({ data }: ReturnType<typeof useAppData>) {
  const { t } = useI18n(); const active = data.players.filter((player) => player.active); const [playerId, setPlayerId] = useState(active[0]?.id ?? '');
  useEffect(() => { if (!playerId && active[0]) setPlayerId(active[0].id); }, [active, playerId]);
  const records = data.matches.flatMap((match) => match.participants.map((participant) => ({ match, participant }))).filter((record) => record.participant.playerId === playerId && record.match.status === 'COMPLETED');
  const wins = records.filter((record) => record.participant.win).length; const losses = records.filter((record) => record.participant.win === false).length;
  const average = (field: 'cs' | 'damageToChampions') => records.length ? Math.round(records.reduce((sum, record) => sum + (record.participant[field] ?? 0), 0) / records.length) : 0;
  const kda = records.length ? records.reduce((sum, record) => sum + ((record.participant.kills ?? 0) + (record.participant.assists ?? 0)) / Math.max(1, record.participant.deaths ?? 0), 0) / records.length : 0;
  const byPosition = REQUIRED_POSITIONS.map((position) => [position, records.filter((record) => record.participant.position === position).length] as const);
  const champions = Object.entries(records.reduce<Record<string, number>>((result, record) => { const name = record.participant.championName; if (name) result[name] = (result[name] ?? 0) + 1; return result; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return <><PageHeader title={t('stats')} kicker="PLAYER PERFORMANCE" actions={<select className="input player-select" value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">{t('selectPlayer')}</option>{active.map((player) => <option key={player.id} value={player.id}>{player.displayName}</option>)}</select>} /><section className="metric-grid stats-grid"><Metric label={t('totalGames')} value={records.length} hint="GAMES" /><Metric label={t('wins')} value={wins} hint="WINS" accent /><Metric label={t('losses')} value={losses} hint="LOSSES" /><Metric label={t('winRate')} value={records.length ? `${Math.round((wins / records.length) * 100)}%` : '0%'} hint="WIN RATE" /><Metric label={t('avgKda')} value={kda.toFixed(2)} hint="KDA" /><Metric label={t('avgCs')} value={average('cs')} hint="CS" /><Metric label={t('avgDamage')} value={average('damageToChampions').toLocaleString()} hint="DAMAGE" /></section><section className="split-grid"><article className="panel"><h2>{t('byPosition')}</h2><div className="bar-list">{byPosition.map(([position, count]) => <div key={position}><span>{position}</span><div><i style={{ width: `${records.length ? count / records.length * 100 : 0}%` }} /></div><b>{count}</b></div>)}</div></article><article className="panel"><h2>{t('champions')}</h2>{champions.length ? <ol className="rank-list">{champions.map(([name, count]) => <li key={name}><strong>{name}</strong><span>{count} games</span></li>)}</ol> : <Empty text={t('noData')} />}</article></section></>;
}

function SettingsPage({ data, reload }: ReturnType<typeof useAppData>) {
  const { t } = useI18n(); const [savedRiotKey, setSavedRiotKey] = useState(getRiotApiKey()); const [savedAccessKey, setSavedAccessKey] = useState(getAccessToken()); const [riotKey, setRiotKey] = useState(''); const [accessKey, setAccessKey] = useState(''); const [remember, setRemember] = useState(getRememberKeys()); const [result, setResult] = useState(''); const [testing, setTesting] = useState(false);
  function persist() { const nextRiot = riotKey || savedRiotKey; const nextAccess = accessKey || savedAccessKey; saveBrowserKeys(nextRiot, nextAccess, remember); setSavedRiotKey(nextRiot); setSavedAccessKey(nextAccess); setRiotKey(''); setAccessKey(''); }
  function save() { persist(); setResult(t('save')); void reload(); }
  async function test() { persist(); setTesting(true); try { const response = await api.testRiot(); setResult(response.message); } catch (cause) { setResult(cause instanceof Error ? cause.message : String(cause)); } finally { setTesting(false); } }
  return <><PageHeader title={t('settings')} kicker="CONNECTIONS & SECURITY" /><section className="settings-grid"><article className="panel"><h2>API CREDENTIALS</h2><p className="helper">{t('keySecurity')}</p><Field label={t('riotApiKey')}><input type="password" className="input" value={riotKey} onChange={(event) => setRiotKey(event.target.value)} placeholder={savedRiotKey ? maskKey(savedRiotKey) : 'RGAPI-…'} autoComplete="off" /></Field><Field label={t('accessKey')}><input type="password" className="input" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} placeholder={savedAccessKey ? maskKey(savedAccessKey) : ''} autoComplete="off" /></Field><label className="check remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />{t('rememberBrowser')}</label><div className="button-row"><button className="button secondary" disabled={testing} onClick={test}><Activity size={16} />{t('testConnection')}</button><button className="button primary" onClick={save}><Save size={16} />{t('saveSession')}</button></div>{result && <div className="connection-result">{result}</div>}</article><article className="panel"><div className="panel-head"><h2>SERVICE STATUS</h2><span className="endpoint">{API_BASE_URL}</span></div><StatusLine label={t('backend')} ok={Boolean(data.health?.backend)} /><StatusLine label={t('database')} ok={Boolean(data.health?.database)} /><StatusLine label={t('apiStatus')} ok={Boolean(data.health?.riotConfigured || savedRiotKey)} /><StatusLine label={t('opgg')} ok={Boolean(data.health?.opggEnabled)} /><StatusLine label={t('tournamentApi')} ok={false} waiting value={t('tournamentWaiting')} /></article></section></>;
}

function PolicyPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const { t, language } = useI18n();
  const privacy = language === 'ko' ? [
    ['1. 처리 범위', 'HUH는 비공개 League of Legends 내전 운영을 위해 커뮤니티 참가자가 제공한 정보를 처리합니다.'],
    ['2. 처리하는 정보', 'Riot ID, PUUID, Riot API의 현재 랭크 데이터, OP.GG 공개 프로필의 과거 솔로·자유랭크 기록, 내전 참가·팀·경기·개인 기록을 처리합니다. Riot API Key와 운영 접근 키는 선택한 브라우저 저장소에만 보관되며 DB에 저장하지 않습니다.'],
    ['3. 이용 목적', '참가자 식별, 5v5 팀 편성, 현재·과거 랭크 확인, 내전 전적 및 통계 제공에만 사용합니다.'],
    ['4. 외부 처리', '현재 랭크 조회 시 Riot Games API로 Riot ID 또는 PUUID가 전달되고, 과거 기록 조회 시 OP.GG 공개 프로필을 서버에서 요청합니다. 운영 데이터는 Supabase에 저장됩니다.'],
    ['5. 보관과 삭제', '운영에 필요한 기간 동안 보관하며, 커뮤니티 운영자는 플레이어를 비활성화하거나 관련 기록을 정정할 수 있습니다. 법적 의무가 없는 한 참가자는 운영자에게 삭제를 요청할 수 있습니다.'],
  ] : [
    ['1. Scope', 'HUH processes participant-provided information to operate a private League of Legends inhouse community.'],
    ['2. Information processed', 'We process Riot IDs, PUUIDs, current rank data from Riot APIs, historical solo and flex records from public OP.GG profiles, and participation, team, match, and player statistics. Riot and operations access keys remain only in the selected browser storage and are not stored in the database.'],
    ['3. Purpose', 'Information is used only for participant identification, balanced 5v5 team creation, rank display, match records, and player statistics.'],
    ['4. Service providers', 'Riot ID or PUUID is sent to Riot Games APIs for current ranks. The backend requests public OP.GG profiles for historical records. Operational records are stored in Supabase.'],
    ['5. Retention and removal', 'Records are retained while needed to operate the community. Organizers can deactivate players or correct records, and participants may request removal where no legal obligation requires retention.'],
  ];
  const terms = language === 'ko' ? [
    ['1. 서비스 목적', 'HUH는 초대된 커뮤니티 참가자의 비상업적 5v5 내전 운영을 위한 도구입니다. 공개 매치메이킹이나 유료 랭킹 서비스가 아닙니다.'],
    ['2. 이용 조건', '이용자는 정확한 Riot ID를 제공하고 커뮤니티 규칙, Riot Games 정책, 관련 법률을 준수해야 합니다.'],
    ['3. 데이터와 기능', 'Riot 및 OP.GG 외부 서비스 상태에 따라 조회 결과가 지연되거나 실패할 수 있습니다. 실패한 OP.GG 조회는 Riot 현재 랭크 결과를 무효화하지 않습니다.'],
    ['4. Tournament API', 'Tournament API 기능은 Riot Games 권한이 부여될 때까지 비활성 상태이며 실제 코드로 가장한 테스트 코드를 운영 화면에 제공하지 않습니다.'],
    ['5. 책임과 변경', '서비스는 현재 상태로 제공되며 운영자는 잘못된 기록을 정정하고 기능 또는 약관을 합리적으로 변경할 수 있습니다.'],
  ] : [
    ['1. Purpose', 'HUH is a non-commercial tool for invited community participants to organize private 5v5 matches. It is not a public matchmaking or paid ranking service.'],
    ['2. Conditions', 'Users must provide an accurate Riot ID and comply with community rules, Riot Games policies, and applicable law.'],
    ['3. Data and availability', 'External Riot and OP.GG availability may delay or prevent lookups. An OP.GG failure does not invalidate a successful current-rank result from Riot.'],
    ['4. Tournament API', 'Tournament API features remain disabled until Riot Games grants access. The operations UI does not present development placeholders as real tournament codes.'],
    ['5. Liability and changes', 'The service is provided as available. Organizers may correct inaccurate records and reasonably change features or these terms.'],
  ];
  const sections = kind === 'privacy' ? privacy : terms;
  return <article className="policy"><PageHeader title={t(kind === 'privacy' ? 'privacyTitle' : 'termsTitle')} kicker="HUH LEGAL" /><p className="policy-updated">{t('lastUpdated')}</p>{sections.map(([title, body]) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}</article>;
}

export function App() {
  const appData = useAppData();
  return <Shell><Routes><Route path="/" element={<Dashboard {...appData} />} /><Route path="/players" element={<PlayersPage {...appData} />} /><Route path="/builder" element={<BuilderPage {...appData} />} /><Route path="/history" element={<HistoryPage {...appData} />} /><Route path="/stats" element={<StatsPage {...appData} />} /><Route path="/settings" element={<SettingsPage {...appData} />} /><Route path="/privacy" element={<PolicyPage kind="privacy" />} /><Route path="/terms" element={<PolicyPage kind="terms" />} /><Route path="*" element={<Dashboard {...appData} />} /></Routes></Shell>;
}

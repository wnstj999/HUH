import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import type { Player, PlayerPowerDetail } from '../types';
import { api } from '../lib/api';

interface Props {
  player: Player;
  onClose: () => void;
  onPlayerUpdated?: () => void;
}

export function PlayerAnalysisModal({ player, onClose, onPlayerUpdated }: Props) {
  const [detail, setDetail] = useState<PlayerPowerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingMatches, setFetchingMatches] = useState(false);
  const [matchCount, setMatchCount] = useState<number>(20);
  const [queueFilter, setQueueFilter] = useState<'ALL' | 'SOLO' | 'FLEX'>('ALL');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.fetchPlayerPowerDetail(player.id);
      setDetail(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [player.id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleFetchMatches = async () => {
    try {
      setFetchingMatches(true);
      setMessage('');
      setError('');
      const res = await api.fetchPlayerMatches({
        playerId: player.id,
        count: matchCount,
        queueFilter,
      });

      const warnText = res.warnings?.length ? ` (경고: ${res.warnings.join(', ')})` : '';
      setMessage(`Match-v5 전적 ${res.newlyFetchedCount}건 신규 수집 (총 캐시: ${res.totalMatchesCount}건)${warnText}`);
      await loadDetail();
      if (onPlayerUpdated) onPlayerUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : '전적 수집 실패');
    } finally {
      setFetchingMatches(false);
    }
  };

  const rating = detail?.rating;
  const breakdown = rating?.breakdown;
  const metrics = breakdown?.metrics;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal player-analysis-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{player.displayName} <small>({player.riotId})</small></h2>
            <p className="kicker">일반 전적 기반 설명 가능한 HUH 전력 추정치</p>
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        {error && <div className="alert"><strong>오류</strong><span>{error}</span></div>}
        {message && <div className="alert info"><strong>알림</strong><span>{message}</span></div>}

        {/* 전적 수집 바 */}
        <div className="match-fetch-bar">
          <div className="fetch-options">
            <span>수집 범위:</span>
            <select value={matchCount} onChange={(e) => setMatchCount(Number(e.target.value))}>
              <option value={20}>최근 20경기</option>
              <option value={50}>최근 50경기</option>
              <option value={100}>최근 100경기</option>
            </select>
            <select value={queueFilter} onChange={(e) => setQueueFilter(e.target.value as 'ALL' | 'SOLO' | 'FLEX')}>
              <option value="ALL">전체 큐 (솔로+자유+일반)</option>
              <option value="SOLO">솔로랭크만 (420)</option>
              <option value="FLEX">자유랭크만 (440)</option>
            </select>
          </div>
          <button className="button primary" disabled={fetchingMatches} onClick={handleFetchMatches}>
            <RefreshCw size={15} className={fetchingMatches ? 'spin' : ''} />
            {fetchingMatches ? '전적 수집 중...' : 'Match-v5 전적 수집 및 분석'}
          </button>
        </div>

        {loading ? (
          <div className="empty">분석 데이터를 불러오는 중...</div>
        ) : (
          <div className="analysis-content">
            {/* 상단: 종합 전력 점수 & 신뢰도 카드 */}
            <div className="power-hero-grid">
              <div className="power-card main">
                <span className="label">HUH 종합 전력 점수 (v1.0)</span>
                <div className="score-display">
                  <strong>{rating ? Math.round(rating.overallScore) : '데이터 없음'}</strong>
                  <small>포인트 (자체 추정치)</small>
                </div>
                <div className="notice-badge">
                  <Sparkles size={14} />
                  <span>Riot 공식 MMR이 아니며, 산출 근거를 투명하게 공개하는 모델입니다.</span>
                </div>
              </div>

              <div className="power-card meta">
                <span className="label">분석 신뢰도 및 표본</span>
                <div className="confidence-row">
                  <span className={`confidence-tag ${rating?.confidenceLevel.toLowerCase() || 'low'}`}>
                    신뢰도 {rating?.confidenceLevel === 'HIGH' ? '높음' : rating?.confidenceLevel === 'MEDIUM' ? '보통' : '낮음'}
                  </span>
                  <span className="sample-count">
                    누적 분석 경기: <strong>{detail?.totalCachedMatches || 0}</strong>전
                  </span>
                </div>
                <p className="confidence-reason">
                  {rating?.confidenceReason ? `사유: ${rating.confidenceReason}` : '수집된 전적 표본이 없어 기본 티어로 추정 중입니다.'}
                </p>
                <small className="last-updated">
                  최근 갱신: {detail?.lastCalculatedAt ? new Date(detail.lastCalculatedAt).toLocaleString('ko-KR') : '기록 없음'}
                </small>
              </div>
            </div>

            {/* 점수 산출 근거 및 구성표 */}
            {breakdown && (
              <div className="panel score-breakdown-panel">
                <h3>점수 산출 근거 및 보정 내역</h3>
                <div className="breakdown-list">
                  <div className="breakdown-item">
                    <span className="item-title">1. 기본 랭크 점수</span>
                    <span className="item-desc">{breakdown.baseTierDescription}</span>
                    <strong className="item-val">+{breakdown.baseTierScore}</strong>
                  </div>
                  <div className="breakdown-item">
                    <span className="item-title">2. 과거 최고 티어 감쇄 보정</span>
                    <span className="item-desc">{breakdown.peakRankDescription}</span>
                    <strong className="item-val">+{breakdown.peakRankBonus}</strong>
                  </div>
                  <div className="breakdown-item">
                    <span className="item-title">3. 최근 성과 지표 보정</span>
                    <span className="item-desc">{breakdown.recentPerformanceDescription}</span>
                    <strong className={`item-val ${breakdown.recentPerformanceModifier >= 0 ? 'good' : 'bad'}`}>
                      {breakdown.recentPerformanceModifier >= 0 ? `+${breakdown.recentPerformanceModifier}` : breakdown.recentPerformanceModifier}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* 핵심 지표 그리드 */}
            <div className="metric-grid-four">
              <div className="metric-card">
                <span>최근 승률</span>
                <strong>{metrics && metrics.sampleGames > 0 ? `${metrics.winRate}%` : '데이터 없음'}</strong>
                <small>{metrics?.sampleGames || 0}경기 기준</small>
              </div>
              <div className="metric-card">
                <span>평균 KDA</span>
                <strong>{metrics && metrics.sampleGames > 0 ? metrics.avgKda : '데이터 없음'}</strong>
                <small>킬+어시/데스</small>
              </div>
              <div className="metric-card">
                <span>분당 CS</span>
                <strong>{metrics && metrics.sampleGames > 0 ? metrics.avgCsPerMin : '데이터 없음'}</strong>
                <small>CS/min</small>
              </div>
              <div className="metric-card">
                <span>분당 딜량 (DPM)</span>
                <strong>{metrics && metrics.sampleGames > 0 ? metrics.avgDpm.toLocaleString() : '데이터 없음'}</strong>
                <small>DPM</small>
              </div>
            </div>

            {/* 포지션별 숙련도 및 점수 */}
            <div className="panel position-analysis-panel">
              <h3>포지션별 숙련도 및 전력 평가</h3>
              <div className="position-grid">
                {(detail?.positionStats || []).map((pos) => {
                  const mastery = breakdown?.roleMastery?.[pos.position];
                  return (
                    <div key={pos.position} className={`pos-card ${pos.games > 0 ? 'active' : 'unplayed'}`}>
                      <div className="pos-head">
                        <strong className="pos-badge">{pos.position}</strong>
                        <span className={`level-tag ${mastery?.experienceLevel.toLowerCase() || 'unplayed'}`}>
                          {mastery?.experienceLevel === 'MAIN' ? '주 포지션' :
                            mastery?.experienceLevel === 'SECONDARY' ? '부 포지션' :
                            mastery?.experienceLevel === 'OFF_ROLE' ? '비주력' : '미경험'}
                        </span>
                      </div>
                      <div className="pos-body">
                        <div className="score-line">
                          <span>포지션 점수</span>
                          <strong>{pos.score ? Math.round(pos.score) : '—'}</strong>
                        </div>
                        <div className="stat-line">
                          <span>경기 수: {pos.games}전</span>
                          <span>승률: {pos.games > 0 ? `${pos.winRate}%` : '—'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <h3>최근 저장된 경기 10판</h3>
              <p className="helper">캐시된 경기 목록입니다. 선택한 분석 범위의 경기 수와 다를 수 있습니다.</p>
              {detail?.recentMatches?.length ? <div className="table-wrap"><table><thead><tr><th>날짜</th><th>큐</th><th>챔피언</th><th>포지션</th><th>결과</th><th>K / D / A</th></tr></thead><tbody>{detail.recentMatches.map((m) => <tr key={m.matchId}><td>{new Date(m.playedAt).toLocaleDateString('ko-KR')}</td><td>{m.queueId === 420 ? '솔랭' : m.queueId === 440 ? '자랭' : '기타'}</td><td>{m.championName}</td><td>{m.position}</td><td>{m.win ? '승리' : '패배'}</td><td>{m.kills} / {m.deaths} / {m.assists}</td></tr>)}</tbody></table></div> : <p className="helper">저장된 경기가 없습니다. 위에서 전적을 수집해 주세요.</p>}
            </div>
            {/* 모스트 챔피언 TOP 5 */}
            <div className="panel champions-panel">
              <h3>주력 챔피언 (최근 전적 기반)</h3>
              {detail?.topChampions && detail.topChampions.length > 0 ? (
                <div className="champs-table-wrap">
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>챔피언</th>
                        <th>플레이 수</th>
                        <th>승률</th>
                        <th>평균 KDA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.topChampions.map((c) => (
                        <tr key={c.championName}>
                          <td><strong>{c.championName}</strong></td>
                          <td>{c.games}경기</td>
                          <td>
                            <span className={c.winRate >= 55 ? 'good-text' : c.winRate <= 45 ? 'bad-text' : ''}>
                              {c.winRate}%
                            </span>
                          </td>
                          <td>{c.kda}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">수집된 챔피언 전적 데이터가 없습니다. 상단에서 전적 수집을 진행해 주세요.</div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

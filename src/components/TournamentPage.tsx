import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trophy, AlertTriangle, Shield, X } from 'lucide-react';
import type { CustomTeam, PowerRating, Tournament, TournamentMatch } from '../types';
import { api, ApiConflictError } from '../lib/api';
import { evaluateTeamPower } from '../lib/teamAnalysis';

interface Props {
  ratings?: Record<string, PowerRating>;
}

export function TournamentPage({ ratings = {} }: Props) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTourneyId, setSelectedTourneyId] = useState<string>('');
  const [currentTourney, setCurrentTourney] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [availableTeams, setAvailableTeams] = useState<CustomTeam[]>([]);

  const [loading, setLoading] = useState(true);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // 신규 대회 생성 상태
  const [isCreating, setIsCreating] = useState(false);
  const [newTourneyName, setNewTourneyName] = useState('');
  const [bracketSize, setBracketSize] = useState<4 | 8 | 16>(8);
  const [matchFormat, setMatchFormat] = useState<'BO1' | 'BO3' | 'BO5'>('BO1');
  const [seedingType, setSeedingType] = useState<'POWER_SEED' | 'RANDOM' | 'MANUAL'>('POWER_SEED');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  // 경기 결과 입력 모달 상태
  const [editingMatch, setEditingMatch] = useState<TournamentMatch | null>(null);
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);
  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(null);

  // 이전 경기 결과 수정 시 충돌 모달 상태
  const [conflictModal, setConflictModal] = useState<{
    matchId: string;
    winnerTeamId: string | null;
    t1Score: number;
    t2Score: number;
    message: string;
    affectedMatch: { roundNumber: number; matchIndex: number };
  } | null>(null);

  const loadTournaments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [tList, customTeamsList] = await Promise.all([
        api.tournaments(),
        api.customTeams(),
      ]);
      setTournaments(tList);
      setAvailableTeams(customTeamsList);

      if (tList.length > 0 && !selectedTourneyId && tList[0]) {
        setSelectedTourneyId(tList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '토너먼트 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [selectedTourneyId]);

  const loadTournamentDetail = async (id: string) => {
    try {
      setMatchesLoading(true);
      setError('');
      const res = await api.tournamentDetail(id);
      setCurrentTourney(res.tournament);
      setMatches(res.matches);
    } catch (err) {
      setError(err instanceof Error ? err.message : '대진표 정보를 불러오지 못했습니다.');
    } finally {
      setMatchesLoading(false);
    }
  };

  useEffect(() => {
    void loadTournaments();
  }, [loadTournaments]);

  useEffect(() => {
    if (selectedTourneyId) {
      void loadTournamentDetail(selectedTourneyId);
    }
  }, [selectedTourneyId]);

  // 팀 전력 계산 맵
  const teamPowerMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of availableTeams) {
      const p = evaluateTeamPower(t, ratings);
      map.set(t.id, p.totalScore);
    }
    return map;
  }, [availableTeams, ratings]);

  // 토너먼트 생성 핸들러
  const handleCreateTournament = async () => {
    if (!newTourneyName.trim()) {
      setError('대회 이름을 입력해주세요.');
      return;
    }
    if (selectedTeamIds.length < 2) {
      setError('최소 2개 이상의 참가 팀을 선택해야 합니다.');
      return;
    }
    if (selectedTeamIds.length > bracketSize) {
      setError(`최대 ${bracketSize}개 팀까지 참가할 수 있습니다. (현재 ${selectedTeamIds.length}개 선택됨)`);
      return;
    }

    try {
      setError('');
      const orderedTeamIds = [...selectedTeamIds];

      // 전력 기반 시드 배정인 경우 전력 높은 순으로 정렬
      if (seedingType === 'POWER_SEED') {
        orderedTeamIds.sort((a, b) => (teamPowerMap.get(b) || 0) - (teamPowerMap.get(a) || 0));
      }

      const created = await api.createTournament({
        name: newTourneyName.trim(),
        bracketSize,
        format: matchFormat,
        seedingType,
        teamIds: orderedTeamIds,
      });

      setMessage(`'${newTourneyName}' 토너먼트 대진표가 성공적으로 생성되었습니다.`);
      setIsCreating(false);
      setNewTourneyName('');
      setSelectedTeamIds([]);
      await loadTournaments();
      setSelectedTourneyId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '토너먼트 생성 실패');
    }
  };

  // 경기 결과 모달 열기
  const openResultModal = (match: TournamentMatch) => {
    if (match.status === 'BYE') return; // 부전승은 결과 변경 불가
    setEditingMatch(match);
    setTeam1Score(match.team1Score || 0);
    setTeam2Score(match.team2Score || 0);
    setSelectedWinnerId(match.winnerTeamId || null);
  };

  // 경기 결과 저장 (충돌 감지 포함)
  const handleSaveMatchResult = async (forceUpdate = false) => {
    if (!currentTourney || !editingMatch) return;

    try {
      setError('');
      const targetMatchId = conflictModal ? conflictModal.matchId : editingMatch.id;
      const targetWinner = conflictModal ? conflictModal.winnerTeamId : selectedWinnerId;
      const t1S = conflictModal ? conflictModal.t1Score : team1Score;
      const t2S = conflictModal ? conflictModal.t2Score : team2Score;

      const res = await api.updateTournamentMatch(currentTourney.id, {
        matchId: targetMatchId,
        winnerTeamId: targetWinner,
        team1Score: t1S,
        team2Score: t2S,
        forceUpdate,
      });

      setMatches(res.matches);
      setEditingMatch(null);
      setConflictModal(null);
      setMessage('경기 결과가 반영되었으며 승자가 다음 라운드로 진출했습니다.');
      await loadTournamentDetail(currentTourney.id);
    } catch (err: unknown) {
      if (err instanceof ApiConflictError) {
        const conflictData = err.data as { affectedMatch?: { roundNumber: number; matchIndex: number } };
        if (conflictData?.affectedMatch) {
          setConflictModal({
            matchId: editingMatch.id,
            winnerTeamId: selectedWinnerId,
            t1Score: team1Score,
            t2Score: team2Score,
            message: err.message,
            affectedMatch: conflictData.affectedMatch,
          });
          return;
        }
      }
      setError(err instanceof Error ? err.message : '경기 결과 저장 실패');
    }
  };

  // 라운드별 매치 그룹화
  const groupedMatches = useMemo(() => {
    const rounds: Record<number, TournamentMatch[]> = {};
    for (const m of matches) {
      const list = rounds[m.roundNumber] || [];
      list.push(m);
      rounds[m.roundNumber] = list;
    }
    return rounds;
  }, [matches]);

  const totalRounds = currentTourney ? Math.log2(currentTourney.bracketSize) : 3;

  const roundName = (r: number) => {
    if (r === totalRounds) return '결승전 (Final)';
    if (r === totalRounds - 1) return '4강 준결승 (Semi-Finals)';
    if (r === totalRounds - 2) return '8강 (Quarter-Finals)';
    return '16강 (Round of 16)';
  };

  // 좌/우 브래킷 전력 통계
  const bracketBalance = useMemo(() => {
    if (!matches.length) return null;
    const r1 = matches.filter((m) => m.roundNumber === 1);
    const half = Math.ceil(r1.length / 2);
    const leftMatches = r1.slice(0, half);
    const rightMatches = r1.slice(half);

    const getPower = (ms: TournamentMatch[]) => {
      let sum = 0;
      let cnt = 0;
      for (const m of ms) {
        if (m.team1Id) {
          sum += (teamPowerMap.get(m.team1Id) || 1400);
          cnt += 1;
        }
        if (m.team2Id) {
          sum += (teamPowerMap.get(m.team2Id) || 1400);
          cnt += 1;
        }
      }
      return cnt > 0 ? Math.round(sum / cnt) : 0;
    };

    const leftAvg = getPower(leftMatches);
    const rightAvg = getPower(rightMatches);
    return { leftAvg, rightAvg, diff: Math.abs(leftAvg - rightAvg) };
  }, [matches, teamPowerMap]);

  return (
    <div className="tournament-page">
      <div className="page-header">
        <div>
          <div className="huh-notice-pill">
            <Shield size={14} />
            <span>HUH 자체 토너먼트 대진표 (Riot Tournament API 미연동 상태, 수동 결과 입력)</span>
          </div>
          <h1>4강 · 8강 · 16강 토너먼트 운영</h1>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => setIsCreating(!isCreating)}
        >
          {isCreating ? <X size={16} /> : <Plus size={16} />}
          {isCreating ? '닫기' : '새 토너먼트 생성'}
        </button>
      </div>

      {error && <div className="alert"><strong>오류</strong><span>{error}</span></div>}
      {message && <div className="alert info"><strong>알림</strong><span>{message}</span></div>}

      {/* 신규 토너먼트 생성 패널 */}
      {isCreating && (
        <section className="panel create-tourney-panel">
          <h2>새 토너먼트 대회 생성</h2>
          <div className="form-grid">
            <div className="field wide">
              <span>대회 이름 *</span>
              <input
                className="input"
                placeholder="예: 2026 HUH 가을 정기 토너먼트"
                value={newTourneyName}
                onChange={(e) => setNewTourneyName(e.target.value)}
              />
            </div>

            <div className="field">
              <span>토너먼트 규모</span>
              <div className="btn-group">
                {[4, 8, 16].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    className={`choice-btn ${bracketSize === sz ? 'active' : ''}`}
                    onClick={() => setBracketSize(sz as 4 | 8 | 16)}
                  >
                    {sz}강
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span>경기 포맷</span>
              <div className="btn-group">
                {(['BO1', 'BO3', 'BO5'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    className={`choice-btn ${matchFormat === fmt ? 'active' : ''}`}
                    onClick={() => setMatchFormat(fmt)}
                  >
                    {fmt === 'BO1' ? '단판 (BO1)' : fmt === 'BO3' ? '3판 2선승 (BO3)' : '5판 3선승 (BO5)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="field wide">
              <span>대진 시드 배정 방식</span>
              <div className="btn-group">
                <button
                  type="button"
                  className={`choice-btn ${seedingType === 'POWER_SEED' ? 'active' : ''}`}
                  onClick={() => setSeedingType('POWER_SEED')}
                >
                  전력 기반 시드 배정 (상위 시드 분산 배치)
                </button>
                <button
                  type="button"
                  className={`choice-btn ${seedingType === 'RANDOM' ? 'active' : ''}`}
                  onClick={() => setSeedingType('RANDOM')}
                >
                  랜덤 대진 추첨
                </button>
              </div>
            </div>

            {/* 참가 팀 선택 */}
            <div className="field wide">
              <div className="teams-pick-head">
                <span>참가 팀 선택 (정원 미달 시 부전승 자동 처리)</span>
                <span className="count">선택됨: {selectedTeamIds.length} / {bracketSize}팀</span>
              </div>
              <div className="pick-teams-grid">
                {availableTeams.map((t) => {
                  const isChecked = selectedTeamIds.includes(t.id);
                  const pScore = teamPowerMap.get(t.id) || 1400;
                  return (
                    <label key={t.id} className={`pick-team-card ${isChecked ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedTeamIds(selectedTeamIds.filter((id) => id !== t.id));
                          } else if (selectedTeamIds.length < bracketSize) {
                            setSelectedTeamIds([...selectedTeamIds, t.id]);
                          }
                        }}
                      />
                      <div className="team-text">
                        <strong>{t.name}</strong>
                        <small>추정전력 {pScore}점</small>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="modal-actions wide">
              <button type="button" className="button secondary" onClick={() => setIsCreating(false)}>
                취소
              </button>
              <button type="button" className="button primary" onClick={handleCreateTournament}>
                대진표 생성 및 저장
              </button>
            </div>
          </div>
        </section>
      )}

      {loading && !tournaments.length && (
        <div className="empty">토너먼트 목록을 불러오는 중...</div>
      )}

      {/* 대회 목록 선택 탭 */}
      {tournaments.length > 0 && (
        <div className="tourney-selector-bar">
          <span>대회 선택:</span>
          <select value={selectedTourneyId} onChange={(e) => setSelectedTourneyId(e.target.value)}>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.bracketSize}강 · {t.format} · {t.status === 'COMPLETED' ? '완료' : '진행중'})
              </option>
            ))}
          </select>
          {currentTourney?.winnerTeam && (
            <div className="winner-highlight">
              <Trophy size={16} className="trophy-icon" />
              <span>우승: <strong>{currentTourney.winnerTeam.name}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* 좌/우 브래킷 전력 비교 바 */}
      {bracketBalance && (
        <div className="bracket-balance-bar">
          <div className="balance-info">
            <span>좌측 브래킷 평균: <strong>{bracketBalance.leftAvg}점</strong></span>
            <span className="diff-pill">브래킷 간 격차: ±{bracketBalance.diff}점</span>
            <span>우측 브래킷 평균: <strong>{bracketBalance.rightAvg}점</strong></span>
          </div>
        </div>
      )}

      {/* 대진표 브래킷 뷰 */}
      {currentTourney && (
        <section className="panel bracket-view-section">
          {matchesLoading ? (
            <div className="empty">대진표를 불러오는 중...</div>
          ) : (
            <div className="bracket-scroll-container">
              <div className="bracket-rounds">
                {Array.from({ length: totalRounds }, (_, i) => i + 1).map((rNum) => {
                  const roundMatches = groupedMatches[rNum] || [];
                  return (
                    <div key={rNum} className={`bracket-round round-${rNum}`}>
                      <div className="round-header">
                        <h3>{roundName(rNum)}</h3>
                        <small>{roundMatches.length}경기</small>
                      </div>

                      <div className="round-match-list">
                        {roundMatches.map((m) => {
                          const t1Power = m.team1Id ? teamPowerMap.get(m.team1Id) || 0 : 0;
                          const t2Power = m.team2Id ? teamPowerMap.get(m.team2Id) || 0 : 0;
                          const powerDiff = Math.abs(t1Power - t2Power);
                          const isCompleted = m.status === 'COMPLETED' || m.status === 'BYE';

                          return (
                            <div
                              key={m.id}
                              className={`bracket-match-card ${m.status.toLowerCase()} ${m.winnerTeamId ? 'has-winner' : ''}`}
                              onClick={() => openResultModal(m)}
                            >
                              <div className="match-card-head">
                                <span>R{m.roundNumber} M{m.matchIndex + 1}</span>
                                {m.status === 'BYE' ? (
                                  <span className="bye-badge">부전승</span>
                                ) : (
                                  <span className="diff-hint">격차 ±{powerDiff}점</span>
                                )}
                              </div>

                              {/* 팀 1 */}
                              <div className={`match-team-row ${m.winnerTeamId === m.team1Id ? 'winner' : ''}`}>
                                <strong className="team-name">
                                  {m.team1?.name || (m.roundNumber === 1 ? '부전승 (BYE)' : '미정')}
                                </strong>
                                {t1Power > 0 && <small className="team-pow">{t1Power}점</small>}
                                <span className="team-score">{m.team1Score}</span>
                              </div>

                              {/* 팀 2 */}
                              <div className={`match-team-row ${m.winnerTeamId === m.team2Id ? 'winner' : ''}`}>
                                <strong className="team-name">
                                  {m.team2?.name || (m.roundNumber === 1 ? '부전승 (BYE)' : '미정')}
                                </strong>
                                {t2Power > 0 && <small className="team-pow">{t2Power}점</small>}
                                <span className="team-score">{m.team2Score}</span>
                              </div>

                              {m.status !== 'BYE' && (
                                <div className="card-click-hint">
                                  {isCompleted ? '결과 수정' : '결과 입력하기'}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 결과 입력 모달 */}
      {editingMatch && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setEditingMatch(null)}>
          <section className="modal result-input-modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <h2>경기 결과 입력 (Round {editingMatch.roundNumber} Match {editingMatch.matchIndex + 1})</h2>
              <button onClick={() => setEditingMatch(null)}><X size={20} /></button>
            </div>

            <div className="result-inputs-body">
              <div className="matchup-row">
                <div className="team-score-input">
                  <strong>{editingMatch.team1?.name || '팀 1'}</strong>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={team1Score}
                    onChange={(e) => setTeam1Score(Number(e.target.value))}
                  />
                </div>
                <div className="vs-center">VS</div>
                <div className="team-score-input">
                  <strong>{editingMatch.team2?.name || '팀 2'}</strong>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={team2Score}
                    onChange={(e) => setTeam2Score(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="winner-select-wrap">
                <span>승리팀 선택:</span>
                <div className="winner-options">
                  <button
                    type="button"
                    className={`winner-btn ${selectedWinnerId === editingMatch.team1Id ? 'selected' : ''}`}
                    disabled={!editingMatch.team1Id}
                    onClick={() => setSelectedWinnerId(editingMatch.team1Id)}
                  >
                    {editingMatch.team1?.name || '팀 1'} 승리
                  </button>
                  <button
                    type="button"
                    className={`winner-btn ${selectedWinnerId === editingMatch.team2Id ? 'selected' : ''}`}
                    disabled={!editingMatch.team2Id}
                    onClick={() => setSelectedWinnerId(editingMatch.team2Id)}
                  >
                    {editingMatch.team2?.name || '팀 2'} 승리
                  </button>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setEditingMatch(null)}>
                  취소
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={!selectedWinnerId}
                  onClick={() => handleSaveMatchResult(false)}
                >
                  결과 저장 및 승자 진출
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* 이전 경기 결과 수정 시 경고 모달 (안전장치) */}
      {conflictModal && (
        <div className="modal-backdrop alert-modal-backdrop" role="presentation">
          <section className="modal conflict-alert-modal" role="dialog">
            <div className="modal-head danger">
              <div className="danger-title">
                <AlertTriangle size={22} />
                <h2>이전 경기 결과 수정 확인</h2>
              </div>
            </div>

            <div className="conflict-body">
              <p className="warning-text">{conflictModal.message}</p>
              <div className="affected-info-box">
                <span>영향을 받는 대진:</span>
                <strong>
                  Round {conflictModal.affectedMatch.roundNumber} - Match {conflictModal.affectedMatch.matchIndex + 1}
                </strong>
                <p>
                  이전 경기 결과를 수정하시면 이후 라운드에 진출했던 승자 및 경기 결과가 리셋됩니다.
                  정말 계속 진행하시겠습니까?
                </p>
              </div>

              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={() => setConflictModal(null)}>
                  취소
                </button>
                <button
                  type="button"
                  className="button danger"
                  onClick={() => handleSaveMatchResult(true)}
                >
                  확인하고 하위 대진 재설정
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

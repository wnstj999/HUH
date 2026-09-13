import { useState, useMemo, useEffect, useCallback } from 'react';
import { ArrowLeftRight, Plus, Save, Trash2, Sparkles, X } from 'lucide-react';
import type { CustomTeam, Player, Position, PowerRating } from '../types';
import { POSITIONS } from '../lib/multiTeamBalancer';
import { compareTwoTeams, evaluateTeamPower, parseMultiLineRiotIds, suggestTrades, type TradeSuggestion } from '../lib/teamAnalysis';
import { api } from '../lib/api';
import { MatchupWorkbench } from './MatchupWorkbench';

interface Props {
  players: Player[];
  ratings?: Record<string, PowerRating>;
}

export function CustomTeamManager({ players, ratings: initialRatings = {} }: Props) {
  const [refreshedRatings, setRefreshedRatings] = useState<Record<string, PowerRating>>({});
  const ratings = useMemo(() => ({ ...initialRatings, ...refreshedRatings }), [initialRatings, refreshedRatings]);
  const [teams, setTeams] = useState<CustomTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // 신규 팀 생성 폼
  const [isCreating, setIsCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [rawRiotIds, setRawRiotIds] = useState('');
  const [memberSlots, setMemberSlots] = useState<Record<Position, { riotId: string; playerName: string; playerId: string | null }>>({
    TOP: { riotId: '', playerName: '', playerId: null },
    JUG: { riotId: '', playerName: '', playerId: null },
    MID: { riotId: '', playerName: '', playerId: null },
    ADC: { riotId: '', playerName: '', playerId: null },
    SUP: { riotId: '', playerName: '', playerId: null },
  });

  // 두 팀 비교 선택
  const [compareTeam1Id, setCompareTeam1Id] = useState<string>('');
  const [compareTeam2Id, setCompareTeam2Id] = useState<string>('');

  const loadTeams = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const list = await api.customTeams();
      setTeams(list);
      if (list.length >= 2) {
        if (!compareTeam1Id && list[0]) setCompareTeam1Id(list[0].id);
        if (!compareTeam2Id && list[1]) setCompareTeam2Id(list[1].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '팀 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [compareTeam1Id, compareTeam2Id]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  // 여러 줄 Riot ID 일괄 파싱 및 슬롯 채우기
  const handleBatchParse = () => {
    if (!rawRiotIds.trim()) return;
    const parsed = parseMultiLineRiotIds(rawRiotIds);
    const updated = { ...memberSlots };

    let posIdx = 0;
    for (const item of parsed) {
      // 기존 등록된 플레이어 중 일치하는 플레이어가 있는지 확인
      const matchedPlayer = players.find(
        (p) => p.riotId.toLowerCase() === item.riotId.toLowerCase() || p.displayName === item.gameName,
      );

      const targetPos = item.position || POSITIONS[posIdx];
      if (targetPos && POSITIONS.includes(targetPos)) {
        updated[targetPos] = {
          riotId: matchedPlayer?.riotId || item.riotId,
          playerName: matchedPlayer?.displayName || item.gameName,
          playerId: matchedPlayer?.id || null,
        };
      }
      posIdx += 1;
      if (posIdx >= POSITIONS.length) break;
    }

    setMemberSlots(updated);
    setMessage(`${parsed.length}명의 소환사 정보를 포지션 슬롯에 자동 배치했습니다.`);
  };

  // 등록 플레이어 선택 시 슬롯 동기화
  const handleSelectExistingPlayer = (pos: Position, playerId: string) => {
    const p = players.find((item) => item.id === playerId);
    if (p) {
      setMemberSlots({
        ...memberSlots,
        [pos]: {
          riotId: p.riotId,
          playerName: p.displayName,
          playerId: p.id,
        },
      });
    } else {
      setMemberSlots({
        ...memberSlots,
        [pos]: { riotId: '', playerName: '', playerId: null },
      });
    }
  };

  // 팀 생성 저장
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      setError('팀 이름을 입력해주세요.');
      return;
    }

    try {
      setError('');
      const members: Array<{ position: 'TOP' | 'JUG' | 'MID' | 'ADC' | 'SUP'; riotId: string; playerName?: string; playerId?: string; isCaptain?: boolean }> = [];
      for (const pos of POSITIONS) {
        const slot = memberSlots[pos];
        const rId = slot.riotId.trim();
        const pName = slot.playerName.trim();
        if (!rId && !pName) continue;
        members.push({
          position: pos,
          riotId: rId || pName,
          playerName: pName || rId,
          playerId: slot.playerId || undefined,
        });
      }

      await api.createCustomTeam({
        name: newTeamName.trim(),
        source: 'MANUAL',
        members,
      });

      setMessage(`'${newTeamName}' 팀이 성공적으로 저장되었습니다.`);
      setIsCreating(false);
      setNewTeamName('');
      setRawRiotIds('');
      setMemberSlots({
        TOP: { riotId: '', playerName: '', playerId: null },
        JUG: { riotId: '', playerName: '', playerId: null },
        MID: { riotId: '', playerName: '', playerId: null },
        ADC: { riotId: '', playerName: '', playerId: null },
        SUP: { riotId: '', playerName: '', playerId: null },
      });
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : '팀 생성 실패');
    }
  };

  const handleDeleteTeam = async (id: string, name: string) => {
    if (!confirm(`'${name}' 팀을 삭제하시겠습니까?`)) return;
    try {
      await api.deleteCustomTeam(id);
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : '팀 삭제 실패');
    }
  };

  // 선택된 두 팀 비교 데이터
  const team1 = teams.find((t) => t.id === compareTeam1Id);
  const team2 = teams.find((t) => t.id === compareTeam2Id);

  const comparison = useMemo(() => {
    if (!team1 || !team2 || team1.id === team2.id) return null;
    return compareTwoTeams(team1, team2, ratings);
  }, [team1, team2, ratings]);

  const tradeSuggestions = useMemo(() => {
    if (!team1 || !team2 || team1.id === team2.id) return [];
    return suggestTrades(team1, team2, ratings);
  }, [team1, team2, ratings]);

  // 트레이드 제안 사용자 승인 후 적용
  const handleApplyTrade = async (suggestion: TradeSuggestion) => {
    if (!team1 || !team2) return;
    if (!confirm(`[${suggestion.team1Player}] 선수와 [${suggestion.team2Player}] 선수의 포지션(${suggestion.position}) 맞교환을 적용하시겠습니까?`)) {
      return;
    }

    try {
      const pos = suggestion.position;
      const m1 = team1.members.find((m) => m.position === pos);
      const m2 = team2.members.find((m) => m.position === pos);
      if (!m1 || !m2) return;

      const updatedT1Members = team1.members.map((m) =>
        m.position === pos ? { ...m2, position: pos } : m,
      );
      const updatedT2Members = team2.members.map((m) =>
        m.position === pos ? { ...m1, position: pos } : m,
      );

      await api.updateCustomTeam(team1.id, { members: updatedT1Members });
      await api.updateCustomTeam(team2.id, { members: updatedT2Members });

      setMessage(`선수 교환이 적용되었습니다. 추정 전력 격차: ${suggestion.currentDifference}점 → ${suggestion.improvedDifference}점.`);
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : '트레이드 적용 실패');
    }
  };

  return (
    <div className="custom-team-manager-page">
      <div className="page-header">
        <div>
          <p className="kicker">ROSTER & LANE MATCHUP ANALYSIS</p>
          <h1>수동 팀 관리 & 전력 밸런스 비교</h1>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => setIsCreating(!isCreating)}
        >
          {isCreating ? <X size={16} /> : <Plus size={16} />}
          {isCreating ? '닫기' : '새 팀 직접 등록'}
        </button>
      </div>

      {error && <div className="alert"><strong>오류</strong><span>{error}</span></div>}
      {message && <div className="alert info"><strong>알림</strong><span>{message}</span></div>}

      {/* 팀 직접 등록 모달/패널 */}
      {isCreating && (
        <section className="panel create-team-panel">
          <h2>직접 팀 구성 및 등록</h2>
          <div className="form-grid">
            <div className="field wide">
              <span>팀 이름 *</span>
              <input
                className="input"
                required
                placeholder="예: T1 스쿼드, 금요일 1팀"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
            </div>

            {/* 여러 줄 Riot ID 붙여넣기 */}
            <div className="field wide">
              <span>Riot ID 여러 줄 붙여넣기 (선택)</span>
              <div className="batch-input-wrap">
                <textarea
                  className="input"
                  rows={3}
                  placeholder={`소환사명#태그를 한 줄씩 붙여넣으세요.\n예시:\nHide on bush#KR1\nShowMaker#KR1\nCanyon#KR1\nViper#KR1\nKeria#KR1`}
                  value={rawRiotIds}
                  onChange={(e) => setRawRiotIds(e.target.value)}
                />
                <button type="button" className="button secondary" onClick={handleBatchParse}>
                  포지션 슬롯에 자동 파싱
                </button>
              </div>
            </div>

            {/* 5개 포지션 슬롯 */}
            <div className="field wide">
              <span>팀원 포지션 배정 (5인 구성)</span>
              <div className="position-slots-grid">
                {POSITIONS.map((pos) => {
                  const slot = memberSlots[pos];
                  return (
                    <div key={pos} className="slot-input-card">
                      <div className="slot-head">
                        <strong className="pos-name">{pos}</strong>
                        <select
                          className="compact-select"
                          value={slot.playerId || ''}
                          onChange={(e) => handleSelectExistingPlayer(pos, e.target.value)}
                        >
                          <option value="">기존 선수 선택</option>
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.displayName} ({p.riotId})
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        className="input"
                        placeholder="Riot ID (GameName#Tag)"
                        value={slot.riotId}
                        onChange={(e) =>
                          setMemberSlots({
                            ...memberSlots,
                            [pos]: { ...slot, riotId: e.target.value },
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="modal-actions wide">
              <button type="button" className="button secondary" onClick={() => setIsCreating(false)}>
                취소
              </button>
              <button type="button" className="button primary" onClick={handleCreateTeam}>
                <Save size={16} /> 팀 저장하기
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 등록된 팀 목록 카드 */}
      <section className="panel team-roster-overview">
        <div className="panel-head">
          <h2>등록된 팀 목록 ({teams.length}개 팀)</h2>
        </div>

        {loading ? (
          <div className="empty">팀 목록을 불러오는 중...</div>
        ) : teams.length === 0 ? (
          <div className="empty">등록된 팀이 없습니다. 상단의 '새 팀 직접 등록' 버튼이나 '다팀 자동 편성'에서 팀을 추가해 보세요.</div>
        ) : (
          <div className="custom-teams-list">
            {teams.map((t) => {
              const analysis = evaluateTeamPower(t, ratings);
              return (
                <div key={t.id} className="team-preview-card">
                  <div className="card-top">
                    <div>
                      <strong>{t.name}</strong>
                      <span className={`source-pill ${t.source.toLowerCase()}`}>
                        {t.source === 'AUTO_BALANCED' ? '자동 편성' : '수동 등록'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-button bad"
                      title="팀 삭제"
                      onClick={() => handleDeleteTeam(t.id, t.name)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="power-summary">
                    <span>추정 전력: <strong>{analysis.totalScore}점</strong></span>
                    <span className={`confidence-pill ${analysis.confidence.toLowerCase()}`}>
                      신뢰도 {analysis.confidence === 'HIGH' ? '높음' : analysis.confidence === 'MEDIUM' ? '보통' : '낮음'}
                    </span>
                  </div>

                  <div className="member-chips">
                    {POSITIONS.map((pos) => {
                      const posData = analysis.positions[pos];
                      const name = posData.member?.playerName || posData.member?.riotId || '공석';
                      return (
                        <span key={pos} className={`member-chip ${posData.member ? '' : 'empty-slot'}`}>
                          <b>{pos}</b> {name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 두 팀 간 1:1 라인별 전력 상세 비교 & 선수 교환 제안 */}
      {teams.length >= 2 && (
        <section className="panel matchup-comparison-section">
          <div className="panel-head">
            <h2>두 팀 라인별 1:1 전력 비교 & 불균형 분석</h2>
            <div className="team-selectors">
              <select value={compareTeam1Id} onChange={(e) => setCompareTeam1Id(e.target.value)}>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <b>VS</b>
              <select value={compareTeam2Id} onChange={(e) => setCompareTeam2Id(e.target.value)}>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {comparison ? (
            <div className="comparison-body">
              {team1 && team2 && <MatchupWorkbench key={`${team1.id}:${team2.id}`} left={team1} right={team2} players={players} ratings={ratings} onRatingsUpdated={setRefreshedRatings} onApply={handleApplyTrade} />}
              {/* 상단 팀 총점 요약 비교 */}
              <div className="vs-hero-bar">
                <div className="team-bar-box blue-side">
                  <strong>{comparison.team1Analysis.teamName}</strong>
                  <span>총 전력 {comparison.team1Analysis.totalScore}점</span>
                </div>
                <div className="vs-diff-badge">
                  <small>전력 격차</small>
                  <strong>±{comparison.totalScoreDiff}점</strong>
                </div>
                <div className="team-bar-box red-side">
                  <strong>{comparison.team2Analysis.teamName}</strong>
                  <span>총 전력 {comparison.team2Analysis.totalScore}점</span>
                </div>
              </div>

              {/* 5개 라인 맞대결 테이블 */}
              <div className="lane-matchups-wrap">
                <table className="lane-table">
                  <thead>
                    <tr>
                      <th style={{ width: '30%' }}>{comparison.team1Analysis.teamName}</th>
                      <th style={{ width: '15%', textAlign: 'center' }}>포지션</th>
                      <th style={{ width: '15%', textAlign: 'center' }}>라인 격차</th>
                      <th style={{ width: '10%', textAlign: 'center' }}>판정</th>
                      <th style={{ width: '30%', textAlign: 'right' }}>{comparison.team2Analysis.teamName}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.laneComparisons.map((c) => (
                      <tr key={c.position} className={c.severity === 'SEVERE' ? 'danger-row' : ''}>
                        <td>
                          <strong>{c.team1Member?.playerName || c.team1Member?.riotId || '공석'}</strong>
                          <span className="lane-score">{c.team1Score}점</span>
                        </td>
                        <td className="center">
                          <strong className="pos-badge">{c.position}</strong>
                        </td>
                        <td className="center">
                          <span className={`diff-tag ${c.severity.toLowerCase()}`}>
                            ±{c.scoreDifference}점
                          </span>
                        </td>
                        <td className="center">
                          {c.advantageTeam === 1 ? (
                            <span className="adv-badge blue">좌측 우세</span>
                          ) : c.advantageTeam === 2 ? (
                            <span className="adv-badge red">우측 우세</span>
                          ) : (
                            <span className="adv-badge">호각</span>
                          )}
                        </td>
                        <td className="right">
                          <span className="lane-score">{c.team2Score}점</span>
                          <strong>{c.team2Member?.playerName || c.team2Member?.riotId || '공석'}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 선수 트레이드 제안 (Trade Suggestions) */}
              {tradeSuggestions.length > 0 && (
                <div className="trade-suggestions-box">
                  <div className="trade-head">
                    <Sparkles size={16} />
                    <strong>팀 밸런스 개선을 위한 맞교환(트레이드) 제안</strong>
                  </div>
                  <p className="helper">
                    아래 제안은 두 팀의 라인전을 유지하면서 전체 팀 간 격차를 줄일 수 있는 최적의 1:1 교환안입니다.
                    사용자가 [적용]을 누르기 전에는 팀이 임의로 변경되지 않습니다.
                  </p>

                  <div className="suggestions-list">
                    {tradeSuggestions.map((s, idx) => (
                      <div key={idx} className="suggestion-card">
                        <div className="sug-info">
                          <span className="sug-pos">{s.position} 라인 맞교환:</span>
                          <strong>[{s.team1Player}] ⇄ [{s.team2Player}]</strong>
                          <span className="sug-diff">
                            전력 편차 {s.currentDifference}점 → <strong>{s.improvedDifference}점</strong> ({s.differenceReduction}점 개선)
                          </span>
                        </div>
                        <button
                          type="button"
                          className="button primary compact"
                          onClick={() => handleApplyTrade(s)}
                        >
                          <ArrowLeftRight size={14} /> 적용하기
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty">서로 다른 두 개의 팀을 선택해 주세요.</div>
          )}
        </section>
      )}
    </div>
  );
}

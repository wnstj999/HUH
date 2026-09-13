import { useState, useMemo } from 'react';
import { Lock, Plus, Save, Sparkles } from 'lucide-react';
import type { Player, Position, PowerRating, MultiTeamPlan, TeamConstraints, CustomTeam } from '../types';
import { POSITIONS, buildMultiTeams, swapMultiTeamPlayers, MultiTeamBuildError } from '../lib/multiTeamBalancer';
import { api } from '../lib/api';

interface Props {
  players: Player[];
  ratings?: Record<string, PowerRating>;
  onTeamsSaved?: (teams: CustomTeam[]) => void;
}

export function MultiTeamBuilder({ players, ratings = {}, onTeamsSaved }: Props) {
  const activePlayers = useMemo(() => players.filter((p) => p.active), [players]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [targetTeamCount, setTargetTeamCount] = useState<2 | 4 | 8 | 16>(2);

  // 제약 조건
  const [pinnedPositions, setPinnedPositions] = useState<Record<string, Position>>({});
  const [pinnedTeams, setPinnedTeams] = useState<Record<string, number>>({});
  const [pairedPlayers, setPairedPlayers] = useState<Array<[string, string]>>([]);
  const [isolatedPlayers, setIsolatedPlayers] = useState<Array<[string, string]>>([]);

  // 제약 조건 입력용 임시 상태
  const [fixedPlayerId, setFixedPlayerId] = useState('');
  const [fixedPos, setFixedPos] = useState<Position | ''>('');
  const [fixedTeam, setFixedTeam] = useState<string>('');
  const [pairP1, setPairP1] = useState('');
  const [pairP2, setPairP2] = useState('');
  const [isoP1, setIsoP1] = useState('');
  const [isoP2, setIsoP2] = useState('');

  // 생성 결과
  const [plans, setPlans] = useState<MultiTeamPlan[]>([]);
  const [activePlanIndex, setActivePlanIndex] = useState(0);
  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const requiredCount = targetTeamCount * 5;

  // 참가자 토글
  const toggleSelect = (id: string) => {
    setError('');
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : prev.length < requiredCount ? [...prev, id] : prev,
    );
  };

  const selectParticipatingOnly = () => {
    const part = activePlayers.filter((p) => p.participating).map((p) => p.id);
    setSelectedIds(part.slice(0, requiredCount));
  };

  const handleBuild = () => {
    setError('');
    setSuccessMsg('');
    if (selectedIds.length !== requiredCount) {
      setError(`${targetTeamCount}팀을 편성하려면 정확히 ${requiredCount}명의 플레이어를 선택해야 합니다. (현재: ${selectedIds.length}명)`);
      return;
    }

    try {
      setBuilding(true);
      const selectedPlayers = selectedIds.map((id) => activePlayers.find((p) => p.id === id)!).filter(Boolean);
      const constraints: TeamConstraints = {
        pinnedPositions,
        pinnedTeams,
        pairedPlayers,
        isolatedPlayers,
      };

      const result = buildMultiTeams(selectedPlayers, ratings, constraints);
      setPlans(result.plans);
      setActivePlanIndex(0);
      setSuccessMsg(`${result.plans.length}개의 추천 편성 대안이 산출되었습니다.`);
    } catch (err) {
      if (err instanceof MultiTeamBuildError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : '팀 편성에 실패했습니다.');
      }
    } finally {
      setBuilding(false);
    }
  };

  // 수동 스왑 (실시간 반응형 갱신)
  const handleSwap = (p1Id: string, p2Id: string) => {
    if (!currentPlan) return;
    try {
    const updated = swapMultiTeamPlayers(currentPlan, p1Id, p2Id, ratings, { pinnedPositions, pinnedTeams, pairedPlayers, isolatedPlayers });
    const newPlans = [...plans];
    newPlans[activePlanIndex] = updated;
    setPlans(newPlans);
    setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '교환할 수 없습니다.'); }
  };

  // 편성된 팀 일괄 DB 커스텀 팀으로 저장
  const handleSaveTeams = async () => {
    if (!currentPlan) return;
    try {
      setSaving(true);
      setError('');
      const createdTeams: CustomTeam[] = [];

      for (const t of currentPlan.teams) {
        const teamRes = await api.createCustomTeam({
          name: t.teamName,
          source: 'AUTO_BALANCED',
          notes: `${currentPlan.name} (전력: ${t.totalScore}점)`,
          members: t.assignments.map((a) => ({
            position: a.position,
            riotId: a.player.riotId,
            playerName: a.player.displayName,
            playerId: a.player.id,
          })),
        });
        createdTeams.push(teamRes);
      }

      setSuccessMsg(`${createdTeams.length}개 팀이 '수동/커스텀 팀 관리'에 성공적으로 저장되었습니다! 토너먼트에서 바로 사용하실 수 있습니다.`);
      if (onTeamsSaved) onTeamsSaved(createdTeams);
    } catch (err) {
      setError(err instanceof Error ? err.message : '팀 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const currentPlan = plans[activePlanIndex];

  return (
    <div className="multi-team-builder-page">
      <div className="page-header">
        <div>
          <p className="kicker">MATCH-V5 전적 기반 자동 팀 밸런서</p>
          <h1>다팀 자동 편성 (2 · 4 · 8 · 16팀)</h1>
        </div>
      </div>

      {error && <div className="alert"><strong>편성 제한 안내</strong><span>{error}</span></div>}
      {successMsg && <div className="alert info"><strong>알림</strong><span>{successMsg}</span></div>}

      {/* 1단계: 참가자 및 규모 설정 */}
      <section className="panel select-section">
        <div className="section-head">
          <div className="team-count-selector">
            <span>편성 규모:</span>
            {[2, 4, 8, 16].map((num) => (
              <button
                key={num}
                type="button"
                className={`scale-btn ${targetTeamCount === num ? 'active' : ''}`}
                onClick={() => {
                  setTargetTeamCount(num as 2 | 4 | 8 | 16);
                  setPlans([]);
                }}
              >
                {num}팀 ({num * 5}인)
              </button>
            ))}
          </div>

          <div className="actions-right">
            <button type="button" className="button secondary" onClick={selectParticipatingOnly}>
              오늘 참가자만 선택
            </button>
            <span className={`count-badge ${selectedIds.length === requiredCount ? 'good' : ''}`}>
              선택: {selectedIds.length} / {requiredCount}명
            </span>
          </div>
        </div>

        {/* 참가자 선택 그리드 */}
        <div className="candidate-grid compact">
          {activePlayers.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            const r = ratings[p.id];
            const score = r ? Math.round(r.overallScore) : 1000 + ((p.inhouseScore || 7) - 4) * 100;
            return (
              <button
                key={p.id}
                type="button"
                className={`candidate-card ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleSelect(p.id)}
              >
                <span className={`tier-badge tier-${p.inhouseTier}`}>{p.inhouseTier}</span>
                <div className="p-info">
                  <strong>{p.displayName}</strong>
                  <small>{p.positions.join('·') || '포지션 미지정'}</small>
                </div>
                <div className="p-score">
                  <b>{score}</b>
                  <small>추정전력</small>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2단계: 제약 조건 패널 (고정, 페어링 등) */}
      <section className="panel constraints-panel">
        <details>
          <summary>
            <Lock size={16} />
            <span>고급 제약 조건 설정 (포지션/팀 고정, 같은 팀 희망/금지)</span>
          </summary>
          <div className="constraints-body">
            {/* 특정 선수 팀/포지션 고정 */}
            <div className="constraint-box">
              <h4>특정 선수 팀/포지션 고정</h4>
              <div className="input-row">
                <select value={fixedPlayerId} onChange={(e) => setFixedPlayerId(e.target.value)}>
                  <option value="">선수 선택</option>
                  {selectedIds.map((id) => (
                    <option key={id} value={id}>
                      {activePlayers.find((p) => p.id === id)?.displayName}
                    </option>
                  ))}
                </select>
                <select value={fixedPos} onChange={(e) => setFixedPos(e.target.value as Position | '')}>
                  <option value="">포지션 고정 없음</option>
                  {POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
                <select value={fixedTeam} onChange={(e) => setFixedTeam(e.target.value)}>
                  <option value="">팀 고정 없음</option>
                  {Array.from({ length: targetTeamCount }).map((_, i) => (
                    <option key={i} value={i}>팀 {i + 1}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!fixedPlayerId || (!fixedPos && fixedTeam === '')}
                  onClick={() => {
                    if (fixedPos) setPinnedPositions((prev) => ({ ...prev, [fixedPlayerId]: fixedPos as Position }));
                    if (fixedTeam !== '') setPinnedTeams((prev) => ({ ...prev, [fixedPlayerId]: Number(fixedTeam) }));
                    setFixedPlayerId('');
                    setFixedPos('');
                    setFixedTeam('');
                  }}
                >
                  <Plus size={14} /> 고정
                </button>
              </div>
              <ul className="tag-list">
                {Object.entries(pinnedPositions).map(([pId, pos]) => (
                  <li key={`pos-${pId}`}>
                    <span>{activePlayers.find((p) => p.id === pId)?.displayName} → {pos} 고정</span>
                    <button type="button" onClick={() => setPinnedPositions((prev) => { const n = { ...prev }; delete n[pId]; return n; })}>×</button>
                  </li>
                ))}
                {Object.entries(pinnedTeams).map(([pId, tIdx]) => (
                  <li key={`team-${pId}`}>
                    <span>{activePlayers.find((p) => p.id === pId)?.displayName} → 팀 {tIdx + 1} 고정</span>
                    <button type="button" onClick={() => setPinnedTeams((prev) => { const n = { ...prev }; delete n[pId]; return n; })}>×</button>
                  </li>
                ))}
              </ul>
            </div>

            {/* 같은 팀 희망 */}
            <div className="constraint-box">
              <h4>같은 팀 희망 (페어링)</h4>
              <div className="input-row">
                <select value={pairP1} onChange={(e) => setPairP1(e.target.value)}>
                  <option value="">선수 1 선택</option>
                  {selectedIds.map((id) => (
                    <option key={id} value={id}>
                      {activePlayers.find((p) => p.id === id)?.displayName}
                    </option>
                  ))}
                </select>
                <select value={pairP2} onChange={(e) => setPairP2(e.target.value)}>
                  <option value="">선수 2 선택</option>
                  {selectedIds.map((id) => (
                    <option key={id} value={id}>
                      {activePlayers.find((p) => p.id === id)?.displayName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!pairP1 || !pairP2 || pairP1 === pairP2}
                  onClick={() => {
                    setPairedPlayers([...pairedPlayers, [pairP1, pairP2]]);
                    setPairP1('');
                    setPairP2('');
                  }}
                >
                  <Plus size={14} /> 추가
                </button>
              </div>
              <ul className="tag-list">
                {pairedPlayers.map(([a, b], idx) => (
                  <li key={idx}>
                    <span>{activePlayers.find((p) => p.id === a)?.displayName} 🤝 {activePlayers.find((p) => p.id === b)?.displayName}</span>
                    <button type="button" onClick={() => setPairedPlayers(pairedPlayers.filter((_, i) => i !== idx))}>×</button>
                  </li>
                ))}
              </ul>
            </div>

            {/* 같은 팀 금지 */}
            <div className="constraint-box">
              <h4>같은 팀 배정 금지 (격리)</h4>
              <div className="input-row">
                <select value={isoP1} onChange={(e) => setIsoP1(e.target.value)}>
                  <option value="">선수 1 선택</option>
                  {selectedIds.map((id) => (
                    <option key={id} value={id}>
                      {activePlayers.find((p) => p.id === id)?.displayName}
                    </option>
                  ))}
                </select>
                <select value={isoP2} onChange={(e) => setIsoP2(e.target.value)}>
                  <option value="">선수 2 선택</option>
                  {selectedIds.map((id) => (
                    <option key={id} value={id}>
                      {activePlayers.find((p) => p.id === id)?.displayName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!isoP1 || !isoP2 || isoP1 === isoP2}
                  onClick={() => {
                    setIsolatedPlayers([...isolatedPlayers, [isoP1, isoP2]]);
                    setIsoP1('');
                    setIsoP2('');
                  }}
                >
                  <Plus size={14} /> 추가
                </button>
              </div>
              <ul className="tag-list">
                {isolatedPlayers.map(([a, b], idx) => (
                  <li key={idx}>
                    <span>{activePlayers.find((p) => p.id === a)?.displayName} ⚔️ {activePlayers.find((p) => p.id === b)?.displayName}</span>
                    <button type="button" onClick={() => setIsolatedPlayers(isolatedPlayers.filter((_, i) => i !== idx))}>×</button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </section>

      {/* 실행 버튼 */}
      <div className="build-action-bar">
        <button
          type="button"
          className="button primary large"
          disabled={selectedIds.length !== requiredCount || building}
          onClick={handleBuild}
        >
          <Sparkles size={18} />
          {building ? '최적의 팀 조합 탐색 중...' : `${targetTeamCount}팀 전적 기반 자동 편성 실행`}
        </button>
      </div>

      {/* 3단계: 결과 대안 표시 및 수동 조정 */}
      {plans.length > 0 && currentPlan && (
        <section className="panel results-section">
          {/* 3가지 대안 탭 */}
          <div className="plan-tabs">
            {plans.map((p, idx) => (
              <button
                key={idx}
                type="button"
                className={`plan-tab ${activePlanIndex === idx ? 'active' : ''}`}
                onClick={() => setActivePlanIndex(idx)}
              >
                <strong>대안 {idx + 1}: {p.name}</strong>
                <small>팀 전력 편차 ±{p.scoreStdDev}점 · 최대 맞라인 격차 {p.maxLaneDiff}점</small>
              </button>
            ))}
          </div>

          <div className="plan-summary-bar">
            <p className="plan-desc">{currentPlan.description}</p>
            <div className="plan-stats">
              <span>팀 간 전력 편차: <strong>±{currentPlan.scoreStdDev}점</strong></span>
              <span>비주력 포지션 배정: <strong>{currentPlan.totalOffRoleCount}명</strong></span>
              <span>최대 라인 격차: <strong>{currentPlan.maxLaneDiff}점</strong></span>
            </div>
            <button
              type="button"
              className="button primary"
              disabled={saving}
              onClick={handleSaveTeams}
            >
              <Save size={16} />
              {saving ? '저장 중...' : '이 대안을 커스텀 팀 목록에 영구 저장'}
            </button>
          </div>

          {/* 팀 카드 그리드 */}
          <div className={`teams-grid count-${currentPlan.teams.length}`}>
            {currentPlan.teams.map((team) => (
              <div key={team.teamIndex} className="team-column-card">
                <div className="team-column-head">
                  <div>
                    <strong>{team.teamName}</strong>
                    <span className="team-score">총 전력 {team.totalScore}점</span>
                  </div>
                  <span className={`team-confidence-pill ${team.confidence.toLowerCase()}`}>
                    신뢰도 {team.confidence === 'HIGH' ? '높음' : '보통'}
                  </span>
                </div>

                <div className="slot-list">
                  {team.assignments.map((assignment) => (
                    <div key={assignment.position} className="player-slot-row">
                      <span className="slot-pos">{assignment.position}</span>
                      <div className="slot-player-select">
                        <select
                          value={assignment.player.id}
                          onChange={(e) => handleSwap(assignment.player.id, e.target.value)}
                        >
                          {currentPlan.teams
                            .flatMap((t) => t.assignments)
                            .map((opt) => (
                              <option key={opt.player.id} value={opt.player.id}>
                                {opt.player.displayName} ({opt.position}, {opt.ratingScore}점)
                              </option>
                            ))}
                        </select>
                      </div>
                      <span className={`role-badge ${assignment.isMainPosition ? 'main' : 'off'}`}>
                        {assignment.isMainPosition ? '주력' : '비주력'}
                      </span>
                      <strong className="slot-score">{assignment.ratingScore}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

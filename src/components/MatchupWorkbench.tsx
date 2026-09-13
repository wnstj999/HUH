import { useState } from 'react';
import type { CustomTeam, CustomTeamMember, Player, Position, PowerRating } from '../types';
import { POSITIONS } from '../lib/multiTeamBalancer';
import { compareTwoTeams, type TradeSuggestion } from '../lib/teamAnalysis';
import { PlayerAnalysisModal } from './PlayerAnalysisModal';
import { api } from '../lib/api';

interface Props {
  left: CustomTeam;
  right: CustomTeam;
  players: Player[];
  ratings: Record<string, PowerRating>;
  onApply: (trade: TradeSuggestion) => Promise<void>;
  onRatingsUpdated: (ratings: Record<string, PowerRating>) => void;
}

export function MatchupWorkbench({ left, right, players, ratings, onApply, onRatingsUpdated }: Props) {
  const [position, setPosition] = useState<Position>('TOP');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scores = ratings;
  const before = compareTwoTeams(left, right, scores);
  const a = left.members.find((m) => m.position === position);
  const b = right.members.find((m) => m.position === position);
  const canSwap = Boolean(a && b && !a.isCaptain && !b.isCaptain);
  const after = a && b ? compareTwoTeams(
    { ...left, members: left.members.map((m) => m.position === position ? { ...b, position } : m) },
    { ...right, members: right.members.map((m) => m.position === position ? { ...a, position } : m) }, scores,
  ) : null;
  const largest = [...before.laneComparisons].sort((x, y) => y.scoreDifference - x.scoreDifference)[0];
  const reliable = left.members.length === 5 && right.members.length === 5 && [...left.members, ...right.members].every((m) => m.playerId && scores[m.playerId]?.sampleGamesCount);

  function playerCard(member: CustomTeamMember | null, pos: Position) {
    const player = players.find((p) => p.id === member?.playerId || p.riotId.toLowerCase() === member?.riotId.toLowerCase());
    const rating = player ? scores[player.id] : undefined;
    const role = rating?.breakdown?.roleMastery?.[pos];
    return <article className="matchup-player-card">
      <button type="button" className="text-button" disabled={!player} onClick={() => player && setSelectedPlayer(player)}>{member?.playerName || member?.riotId || '공석'}{player ? ' · 상세 분석 ↗' : ''}</button>
      <small>{member?.riotId || '선수를 등록해 주세요'}</small>
      <span>{player?.currentSoloTier ? `${player.currentSoloTier} ${player.currentSoloDivision ?? ''} ${player.currentSoloLp ?? 0}LP` : '현재 랭크 정보 없음'}</span>
      <span>{rating?.sampleGamesCount ? `분석 ${rating.sampleGamesCount}경기 · 승률 ${rating.breakdown.metrics.winRate}% · KDA ${rating.breakdown.metrics.avgKda}` : '전적 미수집 · 상세 분석에서 갱신'}</span>
      <span>{role?.games ? `${pos} ${role.games}경기 · 승률 ${role.winRate}%` : `${pos} 숙련도 판단 자료 부족`}</span>
    </article>;
  }

  async function apply() {
    if (!canSwap || !a || !b || !after || busy) return;
    setBusy(true);
    try {
      await onApply({ team1Id: left.id, team2Id: right.id, team1Name: left.name, team2Name: right.name, position,
        team1Player: a.playerName || a.riotId, team2Player: b.playerName || b.riotId,
        currentDifference: before.totalScoreDiff, improvedDifference: after.totalScoreDiff,
        differenceReduction: before.totalScoreDiff - after.totalScoreDiff });
    } finally { setBusy(false); }
  }

  return <section className="matchup-workbench" aria-label="팀 비교와 교체 미리보기">
    <h3>어느 포지션에서 차이가 날까?</h3>
    <p className="helper">{largest ? `추정 격차가 가장 큰 포지션은 ${largest.position} (${largest.scoreDifference}점)입니다.` : ''} {!reliable && '전적이 없는 선수가 있어 수치는 임시 추정입니다.'} 점수는 승리 확률이 아닙니다.</p>
    <div className="matchup-position-tabs" role="group" aria-label="비교할 포지션">
      {POSITIONS.map((pos) => <button type="button" key={pos} className={`button ${position === pos ? 'primary' : 'secondary'}`} aria-pressed={position === pos} onClick={() => setPosition(pos)}>{pos}</button>)}
    </div>
    <div className="matchup-player-grid">{playerCard(a ?? null, position)}{playerCard(b ?? null, position)}</div>
    <h3>교체 전후 미리보기</h3>
    <p className="helper">선택한 포지션의 두 선수를 맞교환한 결과입니다. 다른 포지션을 눌러 교환안을 비교할 수 있습니다.</p>
    {after ? <>
      <div className="table-wrap"><table><thead><tr><th>비교 항목</th><th>현재</th><th>교체 후</th></tr></thead><tbody>
        <tr><td>{left.name} 전력</td><td>{before.team1Analysis.totalScore}</td><td>{after.team1Analysis.totalScore}</td></tr>
        <tr><td>{right.name} 전력</td><td>{before.team2Analysis.totalScore}</td><td>{after.team2Analysis.totalScore}</td></tr>
        <tr><td>팀 간 격차</td><td>{before.totalScoreDiff}</td><td>{after.totalScoreDiff} ({after.totalScoreDiff < before.totalScoreDiff ? '감소' : after.totalScoreDiff > before.totalScoreDiff ? '증가' : '동일'})</td></tr>
        <tr><td>비주력·경험 미확인 배정</td><td>{[before.team1Analysis, before.team2Analysis].flatMap((t) => Object.values(t.positions)).filter((p) => !p.isMainRole).length}</td><td>{[after.team1Analysis, after.team2Analysis].flatMap((t) => Object.values(t.positions)).filter((p) => !p.isMainRole).length}</td></tr>
      </tbody></table></div>
      <p className="helper">같은 포지션끼리 교환하므로 두 선수의 해당 포지션 숙련도와 맞대결 격차 자체는 변하지 않습니다.</p>
      <button type="button" className="button primary" disabled={!canSwap || busy} onClick={() => void apply()}>{busy ? '저장 중…' : '이 교환안 적용'}</button>
      {!canSwap && <p className="helper">주장은 교환 대상에서 제외됩니다.</p>}
    </> : <p className="helper">양쪽 포지션에 선수가 있어야 교체를 비교할 수 있습니다.</p>}
    {error && <p role="alert">{error}</p>}
    {selectedPlayer && <PlayerAnalysisModal key={selectedPlayer.id} player={selectedPlayer} onClose={() => setSelectedPlayer(null)} onPlayerUpdated={() => { void api.fetchPowerRatings().then(onRatingsUpdated).catch((cause) => setError(cause instanceof Error ? cause.message : '점수 갱신 실패')); }} />}
  </section>;
}

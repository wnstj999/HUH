import { describe, expect, it } from 'vitest';
import { buildBalancedTeams, REQUIRED_POSITIONS, TeamBuildError } from '../src/lib/teamBalancer';
import type { Player, Position } from '../src/types';

function player(index: number, score: number, positions: Position[]): Player {
  return {
    id: String(index), displayName: `P${index}`, riotGameName: `P${index}`, riotTagLine: 'KR1', riotId: `P${index}#KR1`, puuid: null,
    inhouseTier: 'C', inhouseScore: score, positions, currentSoloTier: null, currentSoloDivision: null, currentSoloLp: null,
    currentSoloWins: null, currentSoloLosses: null, currentSoloWinRate: null, riotLastUpdatedAt: null,
    historicalSoloTier: null, historicalSoloDivision: null, historicalSoloLp: null, historicalSoloSeason: null,
    historicalFlexTier: null, historicalFlexDivision: null, historicalFlexLp: null, historicalFlexSeason: null,
    historicalRankHistory: { solo: [], flex: [] },
    historicalRankLastUpdatedAt: null, participating: true, active: true, note: '', createdAt: '', updatedAt: '',
  };
}

describe('buildBalancedTeams', () => {
  it('assigns one valid player to every position on both teams and minimizes score difference', () => {
    const players = REQUIRED_POSITIONS.flatMap((position, index) => [
      player(index * 2, 15 - index, [position]),
      player(index * 2 + 1, 10 - index, [position]),
    ]);
    const result = buildBalancedTeams(players);
    expect(result.assignments).toHaveLength(10);
    for (const team of ['BLUE', 'RED'] as const) {
      expect(result.assignments.filter((entry) => entry.team === team).map((entry) => entry.position).sort()).toEqual([...REQUIRED_POSITIONS].sort());
      expect(result.assignments.filter((entry) => entry.team === team).every((entry) => entry.player.positions.includes(entry.position))).toBe(true);
    }
    expect(result.difference).toBe(5);
  });

  it('reports a concrete position shortage', () => {
    const players = Array.from({ length: 10 }, (_, index) => player(index, 7, index === 0 ? ['JUG'] : ['TOP', 'MID', 'ADC', 'SUP']));
    expect(() => buildBalancedTeams(players)).toThrowError(new TeamBuildError('POSITION_SHORTAGE', 'JUG 가능 플레이어가 1명뿐이라 두 팀을 구성할 수 없습니다.'));
  });
});

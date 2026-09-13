import { describe, expect, it } from 'vitest';
import { buildMultiTeams, swapMultiTeamPlayers, POSITIONS } from '../src/lib/multiTeamBalancer';
import type { Player, TeamConstraints } from '../src/types';

function makeMockPlayer(index: number, positions: Array<'TOP' | 'JUG' | 'MID' | 'ADC' | 'SUP'>, score = 10): Player {
  return {
    id: `player_${index}`,
    displayName: `선수_${index}`,
    riotGameName: `선수_${index}`,
    riotTagLine: 'KR1',
    riotId: `선수_${index}#KR1`,
    puuid: `puuid_${index}`,
    inhouseTier: 'B',
    inhouseScore: score,
    positions,
    currentSoloTier: 'PLATINUM',
    currentSoloDivision: 'I',
    currentSoloLp: 20,
    currentSoloWins: 50,
    currentSoloLosses: 40,
    currentSoloWinRate: 55.5,
    riotLastUpdatedAt: new Date().toISOString(),
    historicalSoloTier: 'EMERALD',
    historicalSoloDivision: 'IV',
    historicalSoloLp: 0,
    historicalSoloSeason: '2024',
    historicalFlexTier: null,
    historicalFlexDivision: null,
    historicalFlexLp: null,
    historicalFlexSeason: null,
    historicalRankHistory: { solo: [], flex: [] },
    historicalRankLastUpdatedAt: null,
    participating: true,
    active: true,
    note: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('다팀 자동 편성 엔진 (buildMultiTeams)', () => {
  it('중복 고정 슬롯과 중복 참가자를 거절한다', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i, [...POSITIONS]));
    expect(() => buildMultiTeams([...players.slice(0, 9), players[0]!])).toThrow('중복');
    expect(() => buildMultiTeams(players, {}, { pinnedTeams: { player_0: 0, player_1: 0 }, pinnedPositions: { player_0: 'TOP', player_1: 'TOP' }, pairedPlayers: [], isolatedPlayers: [] })).toThrow('같은 포지션');
  });

  it('신뢰도를 과장하지 않고 수동 교환에서도 고정 조건을 지킨다', () => {
    const players = Array.from({ length: 10 }, (_, i) => makeMockPlayer(i, [...POSITIONS]));
    const constraints: TeamConstraints = { pinnedTeams: { player_0: 0 }, pinnedPositions: {}, pairedPlayers: [], isolatedPlayers: [] };
    const plan = buildMultiTeams(players, {}, constraints).plans[0]!;
    expect(plan.teams.every((team) => team.confidence === 'LOW')).toBe(true);
    const opponent = plan.teams[1]!.assignments[0]!.player.id;
    expect(() => swapMultiTeamPlayers(plan, 'player_0', opponent, {}, constraints)).toThrow('위반');
  });
  it('10명 참가 시 2팀, 각 팀 5개 포지션이 정확히 배정된다', () => {
    // 10명 생성 (포지션별 2명씩)
    const players: Player[] = [
      makeMockPlayer(1, ['TOP']), makeMockPlayer(2, ['TOP']),
      makeMockPlayer(3, ['JUG']), makeMockPlayer(4, ['JUG']),
      makeMockPlayer(5, ['MID']), makeMockPlayer(6, ['MID']),
      makeMockPlayer(7, ['ADC']), makeMockPlayer(8, ['ADC']),
      makeMockPlayer(9, ['SUP']), makeMockPlayer(10, ['SUP']),
    ];

    const { plans } = buildMultiTeams(players);
    expect(plans.length).toBe(3); // 3가지 대안 제공

    for (const plan of plans) {
      expect(plan.teams.length).toBe(2);
      for (const team of plan.teams) {
        expect(team.assignments.length).toBe(5);
        const assignedPositions = team.assignments.map((a) => a.position);
        for (const pos of POSITIONS) {
          expect(assignedPositions).toContain(pos);
        }
      }
    }
  });

  it('20명 참가 시 4팀 편성을 지원한다', () => {
    // 20명 생성 (포지션별 4명씩)
    const players: Player[] = [];
    let idx = 1;
    for (const pos of POSITIONS) {
      for (let i = 0; i < 4; i += 1) {
        players.push(makeMockPlayer(idx++, [pos]));
      }
    }

    const { plans } = buildMultiTeams(players);
    expect(plans[0]!.teams.length).toBe(4);
    for (const team of plans[0]!.teams) {
      expect(team.assignments.length).toBe(5);
    }
  });

  it('고정 포지션 및 고정 팀 제약 조건을 엄격히 준수한다', () => {
    const players: Player[] = [];
    let idx = 1;
    for (const pos of POSITIONS) {
      for (let i = 0; i < 2; i += 1) {
        players.push(makeMockPlayer(idx++, [pos, 'MID']));
      }
    }

    const constraints: TeamConstraints = {
      pinnedPositions: { player_1: 'TOP' },
      pinnedTeams: { player_1: 0 }, // player_1은 팀 1(index 0)의 TOP 고정
      pairedPlayers: [],
      isolatedPlayers: [],
    };

    const { plans } = buildMultiTeams(players, undefined, constraints);
    const plan = plans[0]!;
    const p1Assignment = plan.teams[0]!.assignments.find((a) => a.player.id === 'player_1');
    expect(p1Assignment).toBeDefined();
    expect(p1Assignment?.position).toBe('TOP');
    expect(p1Assignment?.teamIndex).toBe(0);
  });

  it('같은 팀 배정 금지(격리) 조건을 준수한다', () => {
    const players: Player[] = [];
    let idx = 1;
    for (const pos of POSITIONS) {
      for (let i = 0; i < 2; i += 1) {
        players.push(makeMockPlayer(idx++, [pos]));
      }
    }

    const constraints: TeamConstraints = {
      pinnedPositions: {},
      pinnedTeams: {},
      pairedPlayers: [],
      isolatedPlayers: [['player_1', 'player_2']], // 1번과 2번은 다른 팀
    };

    const { plans } = buildMultiTeams(players, undefined, constraints);
    for (const plan of plans) {
      const t1 = plan.teams.find((t) => t.assignments.some((a) => a.player.id === 'player_1'))?.teamIndex;
      const t2 = plan.teams.find((t) => t.assignments.some((a) => a.player.id === 'player_2'))?.teamIndex;
      expect(t1).not.toBe(t2);
    }
  });
});

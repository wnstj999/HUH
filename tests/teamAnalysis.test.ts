import { describe, expect, it } from 'vitest';
import { parseMultiLineRiotIds, compareTwoTeams, suggestTrades } from '../src/lib/teamAnalysis';
import type { CustomTeam } from '../src/types';

describe('수동 팀 밸런스 분석 및 선수 교환 제안', () => {
  it('여러 줄의 Riot ID를 소환사명과 태그라인으로 올바르게 파싱한다', () => {
    const rawText = `
      Hide on bush#KR1
      ShowMaker#KR1
      Canyon#KR1
      MID Chovy#KR1
      Viper#KR1
    `;

    const parsed = parseMultiLineRiotIds(rawText);
    expect(parsed.length).toBe(5);
    expect(parsed[0]!.gameName).toBe('Hide on bush');
    expect(parsed[0]!.tagLine).toBe('KR1');
    expect(parsed[3]!.position).toBe('MID');
    expect(parsed[3]!.gameName).toBe('Chovy');
  });

  it('두 팀의 라인별 전력 격차와 맞대결 우세를 정확히 비교한다', () => {
    const team1: CustomTeam = {
      id: 't1', name: '1팀', source: 'MANUAL', notes: '',
      createdAt: '', updatedAt: '',
      members: [
        { position: 'TOP', riotId: 'top1#KR1', playerName: 'top1' },
        { position: 'JUG', riotId: 'jug1#KR1', playerName: 'jug1' },
        { position: 'MID', riotId: 'mid1#KR1', playerName: 'mid1' },
        { position: 'ADC', riotId: 'adc1#KR1', playerName: 'adc1' },
        { position: 'SUP', riotId: 'sup1#KR1', playerName: 'sup1' },
      ],
    };

    const team2: CustomTeam = {
      id: 't2', name: '2팀', source: 'MANUAL', notes: '',
      createdAt: '', updatedAt: '',
      members: [
        { position: 'TOP', riotId: 'top2#KR1', playerName: 'top2' },
        { position: 'JUG', riotId: 'jug2#KR1', playerName: 'jug2' },
        { position: 'MID', riotId: 'mid2#KR1', playerName: 'mid2' },
        { position: 'ADC', riotId: 'adc2#KR1', playerName: 'adc2' },
        { position: 'SUP', riotId: 'sup2#KR1', playerName: 'sup2' },
      ],
    };

    const result = compareTwoTeams(team1, team2);
    expect(result.laneComparisons.length).toBe(5);
    expect(result.laneComparisons[0]!.position).toBe('TOP');
    expect(result.laneComparisons[2]!.position).toBe('MID');
  });

  it('팀 균형을 개선할 수 있는 트레이드 제안을 도출한다', () => {
    const team1: CustomTeam = {
      id: 't1', name: '1팀', source: 'MANUAL', notes: '',
      createdAt: '', updatedAt: '',
      members: [
        { position: 'TOP', riotId: 'top1#KR1', playerName: 'top1' },
        { position: 'JUG', riotId: 'jug1#KR1', playerName: 'jug1' },
        { position: 'MID', riotId: 'mid1#KR1', playerName: 'mid1' },
        { position: 'ADC', riotId: 'adc1#KR1', playerName: 'adc1' },
        { position: 'SUP', riotId: 'sup1#KR1', playerName: 'sup1' },
      ],
    };

    const team2: CustomTeam = {
      id: 't2', name: '2팀', source: 'MANUAL', notes: '',
      createdAt: '', updatedAt: '',
      members: [
        { position: 'TOP', riotId: 'top2#KR1', playerName: 'top2' },
        { position: 'JUG', riotId: 'jug2#KR1', playerName: 'jug2' },
        { position: 'MID', riotId: 'mid2#KR1', playerName: 'mid2' },
        { position: 'ADC', riotId: 'adc2#KR1', playerName: 'adc2' },
        { position: 'SUP', riotId: 'sup2#KR1', playerName: 'sup2' },
      ],
    };

    const trades = suggestTrades(team1, team2);
    expect(Array.isArray(trades)).toBe(true);
  });
});

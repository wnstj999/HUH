import { describe, expect, it } from 'vitest';
import { formatRank, getBestSoloRank } from '../src/lib/format';
import type { Player } from '../src/types';

function mockPlayer(overrides: Partial<Player>): Player {
  return {
    id: 'test', displayName: 'TestUser', riotGameName: 'TestUser', riotTagLine: 'KR1', riotId: 'TestUser#KR1', puuid: null,
    inhouseTier: 'C', inhouseScore: 5, positions: ['MID'],
    currentSoloTier: null, currentSoloDivision: null, currentSoloLp: null,
    currentSoloWins: null, currentSoloLosses: null, currentSoloWinRate: null, riotLastUpdatedAt: null,
    historicalSoloTier: null, historicalSoloDivision: null, historicalSoloLp: null, historicalSoloSeason: null,
    historicalFlexTier: null, historicalFlexDivision: null, historicalFlexLp: null, historicalFlexSeason: null,
    historicalRankHistory: { solo: [], flex: [] },
    historicalRankLastUpdatedAt: null, participating: true, active: true, note: '', createdAt: '', updatedAt: '',
    ...overrides,
  };
}

describe('formatRank - best solo tier calculation', () => {
  it('returns historical peak if current tier is lower', () => {
    const player = mockPlayer({
      currentSoloTier: 'GOLD',
      currentSoloDivision: '1',
      currentSoloLp: 20,
      historicalSoloTier: 'DIAMOND',
      historicalSoloDivision: '3',
      historicalSoloLp: 50,
      historicalSoloSeason: 'S13 - 2',
    });

    expect(getBestSoloRank(player)).toMatchObject({
      tier: 'DIAMOND',
      division: '3',
      lp: 50,
      season: 'S13 - 2',
    });
    expect(formatRank(player, 'solo')).toBe('DIAMOND III 50LP (S13 - 2)');
  });

  it('returns current tier if current tier is higher than historical peak', () => {
    const player = mockPlayer({
      currentSoloTier: 'MASTER',
      currentSoloDivision: null,
      currentSoloLp: 120,
      historicalSoloTier: 'DIAMOND',
      historicalSoloDivision: '1',
      historicalSoloLp: 80,
      historicalSoloSeason: 'S14 - 1',
    });

    expect(getBestSoloRank(player)).toMatchObject({
      tier: 'MASTER',
      division: null,
      lp: 120,
      season: 'Current',
    });
    expect(formatRank(player, 'solo')).toBe('MASTER 120LP (Current)');
  });

  it('returns current tier if historical rank is empty', () => {
    const player = mockPlayer({
      currentSoloTier: 'PLATINUM',
      currentSoloDivision: '2',
      currentSoloLp: 45,
    });

    expect(formatRank(player, 'solo')).toBe('PLATINUM II 45LP (Current)');
  });

  it('returns historical tier if current rank is unranked', () => {
    const player = mockPlayer({
      currentSoloTier: null,
      historicalSoloTier: 'EMERALD',
      historicalSoloDivision: '4',
      historicalSoloLp: 0,
      historicalSoloSeason: 'S14 - 2',
    });

    expect(formatRank(player, 'solo')).toBe('EMERALD IV 0LP (S14 - 2)');
  });

  it('returns dash if both current and historical are empty', () => {
    const player = mockPlayer({});
    expect(formatRank(player, 'solo')).toBe('—');
  });
});

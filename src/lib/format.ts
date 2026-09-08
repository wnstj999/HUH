import type { InhouseMatch, Player } from '../types';

const TIER_WEIGHT: Record<string, number> = {
  IRON: 1,
  BRONZE: 2,
  SILVER: 3,
  GOLD: 4,
  PLATINUM: 5,
  EMERALD: 6,
  DIAMOND: 7,
  MASTER: 8,
  GRANDMASTER: 9,
  CHALLENGER: 10,
};

const DIVISION_WEIGHT: Record<string, number> = {
  '1': 4,
  '2': 3,
  '3': 2,
  '4': 1,
  I: 4,
  II: 3,
  III: 2,
  IV: 1,
};

export function calculateRankStrength(tier?: string | null, division?: string | null, lp?: number | null): number {
  if (!tier) return -1;
  const upperTier = tier.toUpperCase();
  const tierScore = TIER_WEIGHT[upperTier] ?? 0;
  if (!tierScore) return -1;
  const divisionScore = division ? (DIVISION_WEIGHT[division] ?? 0) : 0;
  return tierScore * 100_000 + divisionScore * 10_000 + (lp ?? 0);
}

export function getBestSoloRank(player: Player): { tier: string | null; division: string | null; lp: number | null; season: string | null } {
  const currentStrength = calculateRankStrength(player.currentSoloTier, player.currentSoloDivision, player.currentSoloLp);
  const historicalStrength = calculateRankStrength(player.historicalSoloTier, player.historicalSoloDivision, player.historicalSoloLp);

  if (currentStrength <= 0 && historicalStrength <= 0) {
    return { tier: null, division: null, lp: null, season: null };
  }

  if (currentStrength >= historicalStrength) {
    return {
      tier: player.currentSoloTier,
      division: player.currentSoloDivision,
      lp: player.currentSoloLp,
      season: 'Current',
    };
  }

  return {
    tier: player.historicalSoloTier,
    division: player.historicalSoloDivision,
    lp: player.historicalSoloLp,
    season: player.historicalSoloSeason,
  };
}

export function formatRank(player: Player, historical: 'solo' | 'flex' | 'current'): string {
  if (historical === 'current') {
    if (!player.currentSoloTier) return 'UNRANKED';
    const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(player.currentSoloTier.toUpperCase());
    return [player.currentSoloTier, apex ? null : player.currentSoloDivision, player.currentSoloLp == null ? null : `${player.currentSoloLp}LP`].filter(Boolean).join(' ');
  }

  if (historical === 'solo') {
    const best = getBestSoloRank(player);
    if (!best.tier) return '—';
    const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(best.tier.toUpperCase());
    const divisionStr = apex ? null : (best.division ? (['1', '2', '3', '4'].includes(best.division) ? ['I', 'II', 'III', 'IV'][Number(best.division) - 1] : best.division) : null);
    return `${[best.tier, divisionStr, best.lp == null ? null : `${best.lp}LP`].filter(Boolean).join(' ')}${best.season ? ` (${best.season})` : ''}`;
  }

  const prefix = 'historicalFlex';
  const tier = player[`${prefix}Tier` as keyof Player];
  if (!tier) return '—';
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(String(tier).toUpperCase());
  const rawDivision = player[`${prefix}Division` as keyof Player];
  const division = apex ? null : (rawDivision ? (['1', '2', '3', '4'].includes(String(rawDivision)) ? ['I', 'II', 'III', 'IV'][Number(rawDivision) - 1] : rawDivision) : null);
  const lp = player[`${prefix}Lp` as keyof Player];
  const season = player[`${prefix}Season` as keyof Player];
  return `${[tier, division, lp == null ? null : `${lp}LP`].filter(Boolean).join(' ')}${season ? ` (${season})` : ''}`;
}

export function formatDate(value: string | null, language = 'ko'): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(language === 'ko' ? 'ko-KR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function formatDuration(match: InhouseMatch): string {
  if (match.durationSeconds == null) return '—';
  return `${Math.floor(match.durationSeconds / 60)}:${String(match.durationSeconds % 60).padStart(2, '0')}`;
}


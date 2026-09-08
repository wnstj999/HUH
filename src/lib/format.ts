import type { InhouseMatch, Player } from '../types';

export function formatRank(player: Player, historical: 'solo' | 'flex' | 'current'): string {
  if (historical === 'current') {
    if (!player.currentSoloTier) return 'UNRANKED';
    const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(player.currentSoloTier);
    return [player.currentSoloTier, apex ? null : player.currentSoloDivision, player.currentSoloLp == null ? null : `${player.currentSoloLp}LP`].filter(Boolean).join(' ');
  }
  const prefix = historical === 'solo' ? 'historicalSolo' : 'historicalFlex';
  const tier = player[`${prefix}Tier` as keyof Player];
  if (!tier) return '—';
  const division = player[`${prefix}Division` as keyof Player];
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

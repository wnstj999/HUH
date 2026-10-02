import type { InhouseMatch, Player, PowerRating } from '../../src/types.js';
import { calculatePowerRating, type PlayerMatchRecord } from './powerRating.js';

/** Preserve missing values: only complete, dated game records enter the model. */
export function inhouseRecords(playerId: string, matches: InhouseMatch[]): PlayerMatchRecord[] {
  return matches.flatMap(match => {
    if (match.status !== 'COMPLETED' || !match.winnerTeam || !match.durationSeconds) return [];
    const participant = match.participants.find(p => p.playerId === playerId);
    const playedAt = match.startedAt || match.endedAt;
    if (!participant || !playedAt) return [];
    const metrics = [participant.kills, participant.deaths, participant.assists, participant.cs, participant.gold, participant.damageToChampions, participant.visionScore];
    if (metrics.some(value => value === null || !Number.isFinite(value) || value < 0)) return [];
    return [{ matchId: match.id, queueId: 0, queueType: 'INHOUSE' as const, championId: participant.championId ?? 0, championName: participant.championName ?? '', position: participant.position, win: participant.team === match.winnerTeam, kills: participant.kills!, deaths: participant.deaths!, assists: participant.assists!, cs: participant.cs!, goldEarned: participant.gold!, damageToChampions: participant.damageToChampions!, visionScore: participant.visionScore!, gameDuration: match.durationSeconds, gameCreationAt: playedAt }];
  });
}
export function inhouseRating(player: Player, matches: InhouseMatch[], now = Date.now()): PowerRating {
  return { ...calculatePowerRating(player, inhouseRecords(player.id, matches), now, 'INHOUSE'), playerId: player.id, calculatedAt: new Date(now).toISOString() };
}

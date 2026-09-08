import type { InhouseEvent, InhouseMatch, MatchParticipant, Player, Position } from '../../src/types.js';

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' ? value : '';
const nullableText = (value: unknown) => typeof value === 'string' ? value : null;
const nullableNumber = (value: unknown) => typeof value === 'number' ? value : null;

export function mapPlayer(row: Row): Player {
  return {
    id: text(row.id), displayName: text(row.display_name), riotGameName: text(row.riot_game_name), riotTagLine: text(row.riot_tag_line), riotId: text(row.riot_id), puuid: nullableText(row.puuid),
    inhouseTier: text(row.inhouse_tier) as Player['inhouseTier'], inhouseScore: Number(row.inhouse_score), positions: (Array.isArray(row.positions) ? row.positions : []) as Position[],
    currentSoloTier: nullableText(row.current_solo_tier), currentSoloDivision: nullableText(row.current_solo_division), currentSoloLp: nullableNumber(row.current_solo_lp), currentSoloWins: nullableNumber(row.current_solo_wins), currentSoloLosses: nullableNumber(row.current_solo_losses), currentSoloWinRate: nullableNumber(row.current_solo_win_rate), riotLastUpdatedAt: nullableText(row.riot_last_updated_at),
    historicalSoloTier: nullableText(row.historical_solo_tier), historicalSoloDivision: nullableText(row.historical_solo_division), historicalSoloLp: nullableNumber(row.historical_solo_lp), historicalSoloSeason: nullableText(row.historical_solo_season),
    historicalFlexTier: nullableText(row.historical_flex_tier), historicalFlexDivision: nullableText(row.historical_flex_division), historicalFlexLp: nullableNumber(row.historical_flex_lp), historicalFlexSeason: nullableText(row.historical_flex_season), historicalRankLastUpdatedAt: nullableText(row.historical_rank_last_updated_at),
    participating: Boolean(row.participating), active: Boolean(row.active), note: text(row.note), createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  };
}

export function mapEvent(row: Row): InhouseEvent {
  return { id: text(row.id), name: text(row.name), status: text(row.status) as InhouseEvent['status'], participantCount: Number(row.participant_count ?? 0), createdAt: text(row.created_at), updatedAt: text(row.updated_at) };
}

function mapParticipant(row: Row): MatchParticipant {
  const joined = row.players as Row | undefined;
  return {
    id: text(row.id), matchId: text(row.match_id), playerId: text(row.player_id), team: text(row.team) as MatchParticipant['team'], position: text(row.position) as Position,
    championId: nullableNumber(row.champion_id), championName: nullableText(row.champion_name), win: typeof row.win === 'boolean' ? row.win : null,
    kills: nullableNumber(row.kills), deaths: nullableNumber(row.deaths), assists: nullableNumber(row.assists), cs: nullableNumber(row.cs), gold: nullableNumber(row.gold), damageToChampions: nullableNumber(row.damage_to_champions), visionScore: nullableNumber(row.vision_score),
    player: joined ? { id: text(joined.id), displayName: text(joined.display_name), inhouseTier: text(joined.inhouse_tier) as Player['inhouseTier'], inhouseScore: Number(joined.inhouse_score) } : undefined,
  };
}

export function mapMatch(row: Row): InhouseMatch {
  const event = row.inhouse_events as Row | undefined;
  return {
    id: text(row.id), eventId: text(row.event_id), event: event ? { id: text(event.id), name: text(event.name) } : undefined,
    tournamentCode: nullableText(row.tournament_code), riotGameId: nullableText(row.riot_game_id), winnerTeam: nullableText(row.winner_team) as InhouseMatch['winnerTeam'], status: text(row.status) as InhouseMatch['status'], startedAt: nullableText(row.started_at), endedAt: nullableText(row.ended_at), durationSeconds: nullableNumber(row.duration_seconds), createdAt: text(row.created_at),
    participants: (Array.isArray(row.match_participants) ? row.match_participants : []).map((item) => mapParticipant(item as Row)),
  };
}

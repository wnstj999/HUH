export const TIER_SCORES = {
  TR: 15, GR: 14, LR: 13, UR: 12, SR: 11, S: 10,
  A: 9, B: 8, C: 7, D: 6, F: 5, FF: 4,
} as const;

export type InhouseTier = keyof typeof TIER_SCORES;
export type Position = 'TOP' | 'JUG' | 'MID' | 'ADC' | 'SUP';
export type Team = 'BLUE' | 'RED';
export type Language = 'ko' | 'en';

export interface HistoricalRank { tier: string; division: string | null; lp: number | null; season: string }
export interface SeasonRankRecord { season: string; finalRank: HistoricalRank | null; peakRank: HistoricalRank | null }
export interface HistoricalRankHistory { solo: SeasonRankRecord[]; flex: SeasonRankRecord[] }

export interface Player {
  id: string;
  displayName: string;
  riotGameName: string;
  riotTagLine: string;
  riotId: string;
  puuid: string | null;
  inhouseTier: InhouseTier;
  inhouseScore: number;
  positions: Position[];
  currentSoloTier: string | null;
  currentSoloDivision: string | null;
  currentSoloLp: number | null;
  currentSoloWins: number | null;
  currentSoloLosses: number | null;
  currentSoloWinRate: number | null;
  riotLastUpdatedAt: string | null;
  historicalSoloTier: string | null;
  historicalSoloDivision: string | null;
  historicalSoloLp: number | null;
  historicalSoloSeason: string | null;
  historicalFlexTier: string | null;
  historicalFlexDivision: string | null;
  historicalFlexLp: number | null;
  historicalFlexSeason: string | null;
  historicalRankHistory: HistoricalRankHistory;
  historicalRankLastUpdatedAt: string | null;
  participating: boolean;
  active: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerInput {
  displayName: string;
  riotId: string;
  inhouseTier: InhouseTier;
  positions: Position[];
  participating: boolean;
  active: boolean;
  note: string;
}

export interface InhouseEvent {
  id: string;
  name: string;
  status: 'DRAFT' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  participantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MatchParticipant {
  id: string;
  matchId: string;
  playerId: string;
  player?: Pick<Player, 'id' | 'displayName' | 'inhouseTier' | 'inhouseScore'>;
  team: Team;
  position: Position;
  championId: number | null;
  championName: string | null;
  win: boolean | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  gold: number | null;
  damageToChampions: number | null;
  visionScore: number | null;
}

export interface InhouseMatch {
  id: string;
  eventId: string;
  event?: Pick<InhouseEvent, 'id' | 'name'>;
  tournamentCode: string | null;
  riotGameId: string | null;
  winnerTeam: Team | null;
  status: 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  createdAt: string;
  participants: MatchParticipant[];
}

export interface TeamAssignment {
  player: Player;
  team: Team;
  position: Position;
}

export interface BalancedTeams {
  assignments: TeamAssignment[];
  blueScore: number;
  redScore: number;
  difference: number;
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  backend: boolean;
  database: boolean;
  riotConfigured: boolean;
  opggEnabled: boolean;
  tournamentEnabled: boolean;
  timestamp: string;
}

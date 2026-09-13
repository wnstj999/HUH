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

// -------------------------------------------------------------
// 신규: 일반 롤 전적(Match-v5) 및 설명 가능한 전력 추정치 모델 타입
// -------------------------------------------------------------
export interface PlayerMatchStat {
  id?: string;
  puuid: string;
  matchId: string;
  queueId: number;
  queueType: 'SOLO' | 'FLEX' | 'NORMAL';
  championId: number;
  championName: string;
  position: Position | 'UNKNOWN';
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  goldEarned: number;
  damageToChampions: number;
  visionScore: number;
  gameDuration: number;
  gameCreationAt: string;
}

export interface ScoreBreakdown {
  baseTierScore: number;
  baseTierDescription: string;
  peakRankBonus: number;
  peakRankDescription: string;
  recentPerformanceModifier: number;
  recentPerformanceDescription: string;
  metrics: {
    sampleGames: number;
    winRate: number;
    avgKda: number;
    avgCsPerMin: number;
    avgDpm: number;
    avgGpm: number;
    avgVisionScore: number;
  };
  roleMastery: Record<Position, {
    games: number;
    winRate: number;
    masteryScore: number;
    experienceLevel: 'MAIN' | 'SECONDARY' | 'OFF_ROLE' | 'UNPLAYED';
  }>;
}

export interface PowerRating {
  id?: string;
  playerId: string;
  overallScore: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReason: string;
  sampleGamesCount: number;
  evaluatedPeriodDays: number;
  topScore: number;
  jugScore: number;
  midScore: number;
  adcScore: number;
  supScore: number;
  topGames: number;
  jugGames: number;
  midGames: number;
  adcGames: number;
  supGames: number;
  breakdown: ScoreBreakdown;
  modelVersion: string;
  calculatedAt: string;
}

export interface PlayerPowerDetail {
  playerId: string;
  rating: PowerRating | null;
  topChampions: Array<{
    championName: string;
    games: number;
    winRate: number;
    kda: number;
  }>;
  positionStats: Array<{
    position: Position;
    games: number;
    winRate: number;
    score: number | null;
  }>;
  totalCachedMatches: number;
  lastCalculatedAt: string | null;
}

// -------------------------------------------------------------
// 신규: 커스텀 팀 (수동 등록 및 밸런스 분석)
// -------------------------------------------------------------
export interface CustomTeamMember {
  id?: string;
  teamId?: string;
  playerId?: string | null;
  player?: Pick<Player, 'id' | 'displayName' | 'inhouseTier' | 'inhouseScore' | 'currentSoloTier' | 'currentSoloDivision' | 'currentSoloLp' | 'puuid'> | null;
  riotId: string;
  playerName: string;
  position: Position;
  isCaptain?: boolean;
}

export interface CustomTeam {
  id: string;
  name: string;
  source: 'MANUAL' | 'AUTO_BALANCED';
  notes: string;
  createdAt: string;
  updatedAt: string;
  members: CustomTeamMember[];
}

// -------------------------------------------------------------
// 신규: 토너먼트 (4강 / 8강 / 16강)
// -------------------------------------------------------------
export interface TournamentMatch {
  id: string;
  tournamentId: string;
  roundNumber: number; // 1: 첫라운드, ... final
  matchIndex: number; // 라운드 내 인덱스
  team1Id: string | null;
  team2Id: string | null;
  team1?: Pick<CustomTeam, 'id' | 'name'> | null;
  team2?: Pick<CustomTeam, 'id' | 'name'> | null;
  team1Score: number;
  team2Score: number;
  winnerTeamId: string | null;
  winnerTeam?: Pick<CustomTeam, 'id' | 'name'> | null;
  status: 'PENDING' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'BYE';
  nextMatchId: string | null;
  nextSlot: 'team1' | 'team2' | null;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Tournament {
  id: string;
  name: string;
  bracketSize: 4 | 8 | 16;
  format: 'BO1' | 'BO3' | 'BO5';
  seedingType: 'RANDOM' | 'POWER_SEED' | 'MANUAL';
  status: 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  winnerTeamId: string | null;
  winnerTeam?: Pick<CustomTeam, 'id' | 'name'> | null;
  createdAt: string;
  updatedAt: string;
  matches?: TournamentMatch[];
}

// -------------------------------------------------------------
// 신규: 다팀 자동 편성 및 제약 조건 타입
// -------------------------------------------------------------
export interface TeamConstraints {
  pinnedPositions: Record<string, Position>; // playerId -> Position
  pinnedTeams: Record<string, number>; // playerId -> teamIndex (0-based)
  pairedPlayers: Array<[string, string]>; // 같은 팀 희망 [id1, id2]
  isolatedPlayers: Array<[string, string]>; // 다른 팀 배정 [id1, id2]
}

export interface MultiTeamAssignment {
  teamIndex: number;
  teamName: string;
  position: Position;
  player: Player;
  ratingScore: number;
  isMainPosition: boolean;
}

export interface MultiTeamPlan {
  name: string; // e.g. '전체 전력 균형 우선', '포지션 숙련도 우선', '맞라이너 격차 최소화'
  description: string;
  teams: Array<{
    teamIndex: number;
    teamName: string;
    totalScore: number;
    averageScore: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    offRoleCount: number;
    assignments: MultiTeamAssignment[];
  }>;
  scoreStdDev: number; // 팀 간 점수 표준편차 / 차이
  maxLaneDiff: number; // 라인별 최대 전력차
  totalOffRoleCount: number; // 전체 비숙련 포지션 수
}


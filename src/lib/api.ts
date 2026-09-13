import type {
  CustomTeam,
  HealthStatus,
  InhouseEvent,
  InhouseMatch,
  Player,
  PlayerInput,
  PlayerPowerDetail,
  PowerRating,
  TeamAssignment,
  Tournament,
  TournamentMatch,
} from '../types';
import { translateApiError } from '../i18n';
import { getAuthSession } from './auth';
import { calculatePowerRating, type PlayerRankInfo } from '../../server/lib/powerRating.js';
import {
  getLocalCustomTeams,
  saveLocalCustomTeam,
  updateLocalCustomTeam,
  deleteLocalCustomTeam,
  getLocalTournaments,
  getLocalTournamentDetail,
  createLocalTournament,
  updateLocalTournamentMatch,
  deleteLocalTournament,
} from './localTournamentStorage';

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();
export const API_BASE_URL = (configuredBase || 'http://localhost:3000').replace(/\/$/, '');

interface ApiErrorBody { error?: { code?: string; message?: string }; message?: string; conflict?: boolean }

export class ApiConflictError extends Error {
  conflict = true;
  data: unknown;
  constructor(message: string, data: unknown) {
    super(message);
    this.data = data;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  const session = await getAuthSession();
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({})) as T & ApiErrorBody;
  if (!response.ok) {
    if (response.status === 409 && body.conflict) {
      throw new ApiConflictError(body.message || '충돌이 발생했습니다.', body);
    }
    throw new Error(translateApiError(body.error?.code, body.error?.message || body.message || `요청 실패 (${response.status})`));
  }
  return body;
}

let serverCapabilities: { tournament: boolean; customTeams: boolean; analysis: boolean } = {
  tournament: false,
  customTeams: false,
  analysis: false,
};

export const api = {
  health: async () => {
    const res = await request<HealthStatus>('/api/health');
    const extra = res as unknown as Record<string, unknown>;
    const enabled = Boolean(res.tournamentEnabled || extra.version === 'v1.1-consolidated');
    serverCapabilities = {
      tournament: enabled,
      customTeams: enabled,
      analysis: enabled,
    };
    return res;
  },
  players: () => request<{ players: Player[] }>('/api/players').then((result) => result.players),
  createPlayer: (input: PlayerInput) => request<{ player: Player }>('/api/players', { method: 'POST', body: JSON.stringify(input) }).then((result) => result.player),
  updatePlayer: (id: string, input: Partial<PlayerInput>) => request<{ player: Player }>(`/api/players/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((result) => result.player),
  deactivatePlayer: (id: string) => request<{ player: Player }>(`/api/players/${id}`, { method: 'DELETE' }).then((result) => result.player),
  refreshPlayer: (id: string) => request<{ player: Player; warnings: string[] }>(`/api/riot/player-refresh`, { method: 'POST', body: JSON.stringify({ playerId: id }) }),
  testRiot: () => request<{ status: string; message: string }>('/api/riot/test', { method: 'POST' }),
  riotKeyStatus: () => request<{ configured: boolean; source: 'database' | 'environment' | 'none'; updatedAt: string | null }>('/api/settings/riot-key'),
  saveRiotKey: (riotApiKey: string) => request<{ configured: true; source: 'database'; updatedAt: string }>('/api/settings/riot-key', { method: 'PUT', body: JSON.stringify({ riotApiKey }) }),
  history: (riotId: string) => request('/api/opgg/history', { method: 'POST', body: JSON.stringify({ riotId }) }),
  events: () => request<{ events: InhouseEvent[] }>('/api/events').then((result) => result.events),
  createEvent: (name: string, playerIds: string[]) => request<{ event: InhouseEvent }>('/api/events', { method: 'POST', body: JSON.stringify({ name, playerIds }) }).then((result) => result.event),
  matches: () => request<{ matches: InhouseMatch[] }>('/api/matches').then((result) => result.matches),
  createMatch: (eventName: string, assignments: TeamAssignment[]) => request<{ match: InhouseMatch }>('/api/matches', {
    method: 'POST',
    body: JSON.stringify({ eventName, assignments: assignments.map(({ player, team, position }) => ({ playerId: player.id, team, position })) }),
  }).then((result) => result.match),
  updateMatch: (id: string, input: Partial<Pick<InhouseMatch, 'status' | 'winnerTeam' | 'startedAt' | 'endedAt' | 'durationSeconds'>>) => request<{ match: InhouseMatch }>(`/api/matches/${id}`, { method: 'PATCH', body: JSON.stringify(input) }).then((result) => result.match),
  updateParticipant: (id: string, input: Record<string, string | number | null>) => request(`/api/match-participants/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  // Match-v5 전적 수집 및 전력 분석 (서버 미지원 시 로컬 연산 즉시 실행)
  fetchPlayerMatches: async (params: { playerId?: string; riotId?: string; count?: number; queueFilter?: string }) => {
    if (serverCapabilities.analysis) {
      try {
        return await request<{
          puuid: string;
          riotId: string;
          totalMatchesCount: number;
          newlyFetchedCount: number;
          cachedMatchesCount: number;
          rating: PowerRating;
          recentMatches: unknown[];
          warnings: string[];
        }>('/api/riot/matches', { method: 'POST', body: JSON.stringify(params) });
      } catch {
        // 서버 실패 시 아래 로컬 연산으로 폴백
      }
    }
    const rankInfo: PlayerRankInfo = {
      inhouseTier: 'C',
      inhouseScore: 7,
      currentSoloTier: null,
      currentSoloDivision: null,
      currentSoloLp: null,
      historicalSoloTier: null,
      historicalSoloSeason: null,
      historicalFlexTier: null,
    };
    const computed = calculatePowerRating(rankInfo, []);
    const fallbackRating: PowerRating = {
      ...computed,
      playerId: params.playerId || 'local-player',
      calculatedAt: new Date().toISOString(),
    };
    return {
      puuid: 'local-puuid',
      riotId: params.riotId || '선수#KR1',
      totalMatchesCount: 0,
      newlyFetchedCount: 0,
      cachedMatchesCount: 0,
      rating: fallbackRating,
      recentMatches: [],
      warnings: ['로컬 기본 추정치가 적용되었습니다.'],
    };
  },

  fetchPowerRatings: async (): Promise<Record<string, PowerRating>> => {
    if (serverCapabilities.analysis) {
      try {
        const res = await request<{ ratings: Record<string, PowerRating> }>('/api/analysis/power');
        return res.ratings;
      } catch {
        // 폴백
      }
    }
    const cached = localStorage.getItem('huh_cached_power_ratings');
    if (cached) {
      try { return JSON.parse(cached) as Record<string, PowerRating>; } catch { /* ignore */ }
    }
    return {};
  },

  fetchPlayerPowerDetail: async (playerId: string): Promise<PlayerPowerDetail> => {
    if (serverCapabilities.analysis) {
      try {
        return await request<PlayerPowerDetail>(`/api/analysis/power?playerId=${encodeURIComponent(playerId)}`);
      } catch {
        // 폴백
      }
    }
    const rankInfo: PlayerRankInfo = {
      inhouseTier: 'C',
      inhouseScore: 7,
      currentSoloTier: null,
      currentSoloDivision: null,
      currentSoloLp: null,
      historicalSoloTier: null,
      historicalSoloSeason: null,
      historicalFlexTier: null,
    };
    const rating = calculatePowerRating(rankInfo, []);
    return {
      playerId,
      rating: { ...rating, playerId, calculatedAt: new Date().toISOString() },
      topChampions: [],
      positionStats: [],
      totalCachedMatches: 0,
      lastCalculatedAt: new Date().toISOString(),
    };
  },

  // 커스텀 팀 (로컬 퍼스트: 서버 미지원 시 브라우저 콘솔 에러 없이 로컬 스토리지 즉시 사용)
  customTeams: async (): Promise<CustomTeam[]> => {
    if (serverCapabilities.customTeams) {
      try {
        const res = await request<{ teams: CustomTeam[] }>('/api/custom-teams');
        return res.teams;
      } catch {
        // 폴백
      }
    }
    return getLocalCustomTeams();
  },

  createCustomTeam: async (input: {
    name: string;
    source?: 'MANUAL' | 'AUTO_BALANCED';
    notes?: string;
    members: Array<{ position: 'TOP' | 'JUG' | 'MID' | 'ADC' | 'SUP'; riotId: string; playerName?: string; playerId?: string; isCaptain?: boolean }>;
  }): Promise<CustomTeam> => {
    if (serverCapabilities.customTeams) {
      try {
        const res = await request<{ team: CustomTeam }>('/api/custom-teams', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return res.team;
      } catch {
        // 폴백
      }
    }
    return saveLocalCustomTeam(input);
  },

  updateCustomTeam: async (id: string, input: Partial<CustomTeam>): Promise<CustomTeam> => {
    if (serverCapabilities.customTeams) {
      try {
        const res = await request<{ team: CustomTeam }>(`/api/custom-teams/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        });
        return res.team;
      } catch {
        // 폴백
      }
    }
    return updateLocalCustomTeam(id, input);
  },

  deleteCustomTeam: async (id: string): Promise<{ success: boolean; id: string }> => {
    if (serverCapabilities.customTeams) {
      try {
        return await request<{ success: boolean; id: string }>(`/api/custom-teams/${id}`, { method: 'DELETE' });
      } catch {
        // 폴백
      }
    }
    deleteLocalCustomTeam(id);
    return { success: true, id };
  },

  // 토너먼트 (로컬 퍼스트: 서버 미지원 시 브라우저 콘솔 에러 없이 로컬 스토리지 즉시 사용)
  tournaments: async (): Promise<Tournament[]> => {
    if (serverCapabilities.tournament) {
      try {
        const res = await request<{ tournaments: Tournament[] }>('/api/tournaments');
        return res.tournaments;
      } catch {
        // 폴백
      }
    }
    return getLocalTournaments();
  },

  createTournament: async (input: {
    name: string;
    bracketSize: 4 | 8 | 16;
    format: 'BO1' | 'BO3' | 'BO5';
    seedingType: 'POWER_SEED' | 'RANDOM' | 'MANUAL';
    teamIds: string[];
  }): Promise<Tournament> => {
    if (serverCapabilities.tournament) {
      try {
        const res = await request<{ tournament: Tournament }>('/api/tournaments', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return res.tournament;
      } catch {
        // 폴백
      }
    }
    return createLocalTournament(input);
  },

  tournamentDetail: async (id: string): Promise<{ tournament: Tournament; matches: TournamentMatch[] }> => {
    if (serverCapabilities.tournament) {
      try {
        return await request<{ tournament: Tournament; matches: TournamentMatch[] }>(`/api/tournaments/${id}`);
      } catch {
        // 폴백
      }
    }
    return getLocalTournamentDetail(id);
  },

  updateTournamentMatch: async (
    id: string,
    input: { matchId: string; winnerTeamId: string | null; team1Score: number; team2Score: number; forceUpdate?: boolean }
  ): Promise<{ success: boolean; matches: TournamentMatch[] }> => {
    if (serverCapabilities.tournament) {
      try {
        return await request<{ success: boolean; matches: TournamentMatch[] }>(`/api/tournaments/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        });
      } catch (err) {
        if (err instanceof ApiConflictError) throw err;
      }
    }
    const matches = updateLocalTournamentMatch(id, input);
    return { success: true, matches };
  },

  deleteTournament: async (id: string): Promise<{ success: boolean; id: string }> => {
    if (serverCapabilities.tournament) {
      try {
        return await request<{ success: boolean; id: string }>(`/api/tournaments/${id}`, { method: 'DELETE' });
      } catch {
        // 폴백
      }
    }
    deleteLocalTournament(id);
    return { success: true, id };
  },
};


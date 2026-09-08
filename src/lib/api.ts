import type { HealthStatus, InhouseEvent, InhouseMatch, Player, PlayerInput, TeamAssignment } from '../types';
import { translateApiError } from '../i18n';
import { getAuthSession } from './auth';

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();
export const API_BASE_URL = (configuredBase || 'http://localhost:3000').replace(/\/$/, '');

interface ApiErrorBody { error?: { code?: string; message?: string } }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  const session = await getAuthSession();
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({})) as T & ApiErrorBody;
  if (!response.ok) throw new Error(translateApiError(body.error?.code, body.error?.message || `요청 실패 (${response.status})`));
  return body;
}

export const api = {
  health: () => request<HealthStatus>('/api/health'),
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
};

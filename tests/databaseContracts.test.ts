import { describe, expect, it, vi, afterEach } from 'vitest';
import { normalizeApiData } from '../src/lib/apiData';
vi.mock('../src/lib/auth', () => ({ getAuthSession: async () => ({ access_token: 'test-session' }) }));
import { api, ApiConflictError } from '../src/lib/api';
vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
afterEach(() => { vi.restoreAllMocks(); });
describe('shared database API contracts', () => {
  it('maps real SQL names and nested team/player/bracket data without changing values', () => {
    expect(normalizeApiData({ teams: [{ created_at: '2026-10-01T00:00:00Z', members: [{ player_id: 'uuid', is_captain: true, player: { inhouse_score: 8 } }] }], matches: [{ tournament_id: 't', team1_id: 'a', team1_score: 0, winner_team_id: null }] })).toEqual({ teams: [{ createdAt: '2026-10-01T00:00:00Z', members: [{ playerId: 'uuid', isCaptain: true, player: { inhouseScore: 8 } }] }], matches: [{ tournamentId: 't', team1Id: 'a', team1Score: 0, winnerTeamId: null }] });
  });
  it('sends operator credentials and never turns a failed DB save into local success', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'DATABASE_ERROR' } }), { status: 500 }));
    await expect(api.createCustomTeam({ name: 'team', members: [] })).rejects.toThrow('Database');
    expect((fetch.mock.calls[0]![1]!.headers as Headers).get('Authorization')).toBe('Bearer test-session');
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  it('preserves server bracket conflicts and does not retry a write in another store', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ conflict: true, message: 'next round is underway' }), { status: 409 }));
    await expect(api.updateTournamentMatch('t', { matchId: 'm', winnerTeamId: 'a', team1Score: 1, team2Score: 0 })).rejects.toBeInstanceOf(ApiConflictError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

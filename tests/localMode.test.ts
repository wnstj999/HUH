import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localRequest, seedLocalDemo } from '../src/lib/localMode';
import { buildBalancedTeams } from '../src/lib/teamBalancer';
import type { Player, InhouseMatch } from '../src/types';
const store = new Map<string, string>();
const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
vi.stubGlobal('localStorage', storage);
beforeEach(() => { store.clear(); vi.restoreAllMocks(); });
const patch = (body: unknown) => ({ method: 'PATCH', body: JSON.stringify(body) });
describe('local operator workflow', () => {
  it('persists balanced teams, results and stats across reads without networking', async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    seedLocalDemo();
    const { players } = await localRequest<{ players: Player[] }>('/api/players');
    const balanced = buildBalancedTeams(players);
    const { match } = await localRequest<{ match: InhouseMatch }>('/api/matches', { method: 'POST', body: JSON.stringify({ eventName: '시연 경기', assignments: balanced.assignments.map(a => ({ playerId: a.player.id, team: a.team, position: a.position })) }) });
    await localRequest(`/api/match-participants/${match.participants[0]!.id}`, patch({ kills: '8', deaths: '', cs: '123' }));
    await localRequest(`/api/matches/${match.id}`, patch({ status: 'COMPLETED', winnerTeam: 'BLUE' }));
    const saved = (await localRequest<{ matches: InhouseMatch[] }>('/api/matches')).matches[0]!;
    expect(saved.participants[0]!.kills).toBe(8);
    expect(saved.participants[0]!.deaths).toBeNull();
    expect(saved.participants.filter(p => p.win)).toHaveLength(5);
    await localRequest(`/api/matches/${match.id}`, patch({ winnerTeam: null }));
    expect((await localRequest<{ matches: InhouseMatch[] }>('/api/matches')).matches[0]!.participants.every(p => p.win === null)).toBe(true);
    expect(network).not.toHaveBeenCalled();
  });
  it('rejects duplicate IDs, invalid assignments, stats and external key storage', async () => {
    seedLocalDemo();
    const { players } = await localRequest<{ players: Player[] }>('/api/players');
    await expect(localRequest('/api/players', { method: 'POST', body: JSON.stringify(players[0]) })).rejects.toThrow('이미');
    await expect(localRequest('/api/matches', { method: 'POST', body: JSON.stringify({ eventName: 'invalid', assignments: [] }) })).rejects.toThrow('10명');
    await expect(localRequest('/api/settings/riot-key', { method: 'PUT', body: JSON.stringify({ riotApiKey: 'test-secret' }) })).rejects.toThrow('저장하거나');
    expect(JSON.stringify([...store.values()])).not.toContain('test-secret');
    expect((await localRequest<{ events: unknown[] }>('/api/events')).events).toHaveLength(0);
  });
  it('does not overwrite corrupt storage or report quota failures as success', async () => {
    store.set('huh.local.v1', '{broken');
    await expect(localRequest('/api/players')).rejects.toThrow('백업');
    expect(store.get('huh.local.v1')).toBe('{broken');
    store.clear();
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => seedLocalDemo()).toThrow('저장되지');
  });
});

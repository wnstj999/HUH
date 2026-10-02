import { describe, expect, it } from 'vitest';
import { inhouseRating, inhouseRecords } from '../server/lib/inhouseAnalysis';
import { mapPlayer } from '../server/lib/mappers';
import { parseMatchPatch } from '../server/lib/match-input';
import type { InhouseMatch } from '../src/types';
const now = Date.parse('2026-10-02T00:00:00Z');
const player = mapPlayer({ id: 'p', display_name: '선수', inhouse_tier: 'B', inhouse_score: 8, positions: ['MID'], current_solo_tier: 'CHALLENGER', historical_solo_tier: 'CHALLENGER' });
const match: InhouseMatch = { id: 'm', eventId: 'e', tournamentCode: null, riotGameId: null, winnerTeam: 'BLUE', status: 'COMPLETED', startedAt: '2026-10-01T00:00:00Z', endedAt: null, durationSeconds: 1800, createdAt: '2026-10-02T00:00:00Z', participants: [{ id: 'part', matchId: 'm', playerId: 'p', team: 'BLUE', position: 'MID', championId: 103, championName: 'Ahri', win: false, kills: 8, deaths: 4, assists: 12, cs: 180, gold: 12000, damageToChampions: 24000, visionScore: 30 }] };
describe('database inhouse records', () => {
  it('uses recorded game time, team outcome and internal tier instead of ranked data', () => {
    const rating = inhouseRating(player, [match], now);
    expect(rating.breakdown.baseTierScore).toBe(1400);
    expect(rating.breakdown.peakRankBonus).toBe(0);
    expect(rating.sampleGamesCount).toBe(1);
    expect(rating.breakdown.metrics).toMatchObject({ winRate: 100, avgKda: 5, avgCsPerMin: 6, avgDpm: 800, avgGpm: 400 });
    expect(inhouseRecords('p',[match])[0]!.gameCreationAt).toBe(match.startedAt);
    expect(rating.modelVersion).toContain('inhouse');
  });
  it('excludes missing stats, unrecorded time, unfinished and short games', () => {
    const variants = [ { ...match, participants: [{ ...match.participants[0]!, gold: null }] }, { ...match, startedAt: null }, { ...match, status: 'READY' as const }, { ...match, durationSeconds: 300 } ];
    for (const variant of variants) expect(inhouseRating(player, [variant], now).sampleGamesCount).toBe(0);
  });
  it('does not count the same match twice or future/old games', () => {
    expect(inhouseRating(player,[match,match],now).sampleGamesCount).toBe(1);
    expect(inhouseRating(player,[{...match,startedAt:'2027-01-01T00:00:00Z'}],now).sampleGamesCount).toBe(0);
    expect(inhouseRating(player,[{...match,startedAt:'2025-01-01T00:00:00Z'}],now).sampleGamesCount).toBe(0);
  });
});
describe('match update boundary', () => {
  it('keeps nullable winners, seconds and explicitly zoned dates', () => {
    expect(parseMatchPatch({ winnerTeam: null, durationSeconds: 1800, startedAt: '2026-10-01T20:00:00+09:00' })).toEqual({ winner_team: null, duration_seconds: 1800, started_at: '2026-10-01T11:00:00.000Z' });
  });
  it('rejects invalid states, unknown teams, fractional seconds and ambiguous dates', () => {
    for (const patch of [{ status: 'DONE' }, { winnerTeam: 'GREEN' }, { durationSeconds: 1.5 }, { durationSeconds: -1 }, { startedAt: '2026-10-01T20:00:00' }, {}]) expect(() => parseMatchPatch(patch)).toThrow();
  });
});

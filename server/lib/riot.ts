import { HttpError } from './http.js';
import { parseRiotId } from '../../src/lib/riotId.js';

export interface RiotAccount { puuid: string; gameName: string; tagLine: string }
export interface RiotLeagueEntry { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number }

async function riotFetch<T>(url: string, key: string): Promise<T> {
  const response = await fetch(url, { headers: { 'X-Riot-Token': key, Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    const mapping: Record<number, [string, string]> = {
      401: ['RIOT_UNAUTHORIZED', 'Riot API Key 인증 오류입니다.'], 403: ['RIOT_FORBIDDEN', 'Riot API Key가 만료되었거나 접근 권한이 없습니다.'],
      404: ['RIOT_NOT_FOUND', 'Riot ID를 찾을 수 없습니다.'], 429: ['RIOT_RATE_LIMIT', 'Riot API 요청 제한에 도달했습니다. 잠시 후 다시 시도하세요.'],
    };
    const [code, message] = mapping[response.status] || ['RIOT_ERROR', `Riot API 요청이 실패했습니다. (${response.status})`];
    throw new HttpError(response.status, code, message);
  }
  return response.json() as Promise<T>;
}

export async function getRiotAccount(riotId: string, key: string): Promise<RiotAccount> {
  const { gameName, tagLine } = parseRiotId(riotId);
  return riotFetch<RiotAccount>(`https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`, key);
}

export async function getSoloRank(puuid: string, key: string): Promise<RiotLeagueEntry | null> {
  const entries = await riotFetch<RiotLeagueEntry[]>(`https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`, key);
  return entries.find((entry) => entry.queueType === 'RANKED_SOLO_5x5') ?? null;
}

export async function testRiotConnection(key: string): Promise<void> {
  await riotFetch('https://kr.api.riotgames.com/lol/status/v4/platform-data', key);
}

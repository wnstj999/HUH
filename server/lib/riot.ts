import { HttpError } from './http.js';
import { parseRiotId } from '../../src/lib/riotId.js';

export interface RiotAccount { puuid: string; gameName: string; tagLine: string }
export interface RiotLeagueEntry { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number }

export interface RiotMatchParticipant {
  puuid: string;
  summonerName?: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  championId: number;
  championName: string;
  teamPosition: string; // 'TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', ''
  individualPosition?: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  timePlayed: number;
}

export interface RiotMatchDetail {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameMode: string;
    queueId: number;
    participants: RiotMatchParticipant[];
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function riotFetch<T>(url: string, key: string, retryCount = 0): Promise<T> {
  const response = await fetch(url, {
    headers: { 'X-Riot-Token': key, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 429 && retryCount < 2) {
    const retryAfterSeconds = Number(response.headers.get('Retry-After') || '2');
    const waitMs = Math.min(Math.max(retryAfterSeconds * 1000, 1500), 5000);
    await sleep(waitMs);
    return riotFetch<T>(url, key, retryCount + 1);
  }

  if (!response.ok) {
    const mapping: Record<number, [string, string]> = {
      401: ['RIOT_UNAUTHORIZED', 'Riot API Key 인증 오류입니다.'],
      403: ['RIOT_FORBIDDEN', 'Riot API Key가 만료되었거나 접근 권한이 없습니다.'],
      404: ['RIOT_NOT_FOUND', 'Riot 요청 대상 정보를 찾을 수 없습니다.'],
      429: ['RIOT_RATE_LIMIT', 'Riot API 요청 제한(Rate Limit)에 도달했습니다. 잠시 후 다시 시도하세요.'],
      500: ['RIOT_SERVER_ERROR', 'Riot 서버 일시 오류입니다.'],
      503: ['RIOT_UNAVAILABLE', 'Riot 서비스 점검 중입니다.'],
    };
    const [code, message] = mapping[response.status] || ['RIOT_ERROR', `Riot API 요청 실패 (${response.status})`];
    throw new HttpError(response.status, code, message);
  }
  return response.json() as Promise<T>;
}

export async function getRiotAccount(riotId: string, key: string): Promise<RiotAccount> {
  const { gameName, tagLine } = parseRiotId(riotId);
  return riotFetch<RiotAccount>(
    `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    key,
  );
}

export async function getLeagueEntries(puuid: string, key: string): Promise<RiotLeagueEntry[]> {
  return riotFetch<RiotLeagueEntry[]>(
    `https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
    key,
  );
}

export async function getSoloRank(puuid: string, key: string): Promise<RiotLeagueEntry | null> {
  const entries = await getLeagueEntries(puuid, key);
  return entries.find((entry) => entry.queueType === 'RANKED_SOLO_5x5') ?? null;
}

export async function getMatchIds(
  puuid: string,
  key: string,
  options: { count?: number; queue?: number; type?: string; start?: number } = {},
): Promise<string[]> {
  const params = new URLSearchParams();
  params.set('count', String(Math.min(Math.max(options.count ?? 20, 1), 100)));
  if (options.queue !== undefined) params.set('queue', String(options.queue));
  if (options.type) params.set('type', options.type);
  if (options.start !== undefined) params.set('start', String(options.start));

  return riotFetch<string[]>(
    `https://asia.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`,
    key,
  );
}

export async function getMatchDetail(matchId: string, key: string): Promise<RiotMatchDetail> {
  return riotFetch<RiotMatchDetail>(
    `https://asia.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
    key,
  );
}

export async function testRiotConnection(key: string): Promise<void> {
  await riotFetch('https://kr.api.riotgames.com/lol/status/v4/platform-data', key);
}


import * as cheerio from 'cheerio';
import { HttpError } from './http.js';
import { parseRiotId } from '../../src/lib/riotId.js';

export interface HistoricalRank { tier: string; division: string | null; lp: number | null; season: string }
export interface HistoricalRanks { historicalSolo: HistoricalRank | null; historicalFlex: HistoricalRank | null; sourceUrl: string; fetchedAt: string }

interface RankInfo { tier?: unknown; value?: unknown; division?: unknown; lp?: unknown }
interface SeasonRecord { season?: unknown; rank_entries?: { high_rank_info?: RankInfo; rank_info?: RankInfo } }

const TIER_WEIGHT: Record<string, number> = { IRON: 1, BRONZE: 2, SILVER: 3, GOLD: 4, PLATINUM: 5, EMERALD: 6, DIAMOND: 7, MASTER: 8, GRANDMASTER: 9, CHALLENGER: 10 };
const cache = new Map<string, { expiresAt: number; value: HistoricalRanks }>();

function decodeFlightPayload(script: string): string | null {
  const prefix = 'self.__next_f.push(';
  const start = script.indexOf(prefix);
  if (start < 0) return null;
  const raw = script.slice(start + prefix.length, script.lastIndexOf(')'));
  try {
    const tuple = JSON.parse(raw) as unknown[];
    return typeof tuple[1] === 'string' ? tuple[1] : null;
  } catch { return null; }
}

function jsonValueAt(text: string, start: number): { value: unknown; end: number } | null {
  const opener = text[start];
  if (opener !== '[' && opener !== '{') return null;
  const closer = opener === '[' ? ']' : '}';
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === opener) depth += 1;
    else if (character === closer && --depth === 0) {
      const raw = text.slice(start, index + 1);
      try { return { value: JSON.parse(raw), end: index + 1 }; } catch { return null; }
    }
  }
  return null;
}

function normalizeRank(info: RankInfo | undefined, season: unknown): HistoricalRank | null {
  if (!info || typeof info.value !== 'string') return null;
  const tier = info.value.toUpperCase();
  if (!TIER_WEIGHT[tier]) return null;
  const division = typeof info.division === 'number' || (typeof info.division === 'string' && /^\d+$/.test(info.division))
    ? String(info.division) : null;
  const lp = typeof info.lp === 'number' || (typeof info.lp === 'string' && /^\d+$/.test(info.lp)) ? Number(info.lp) : null;
  const seasonText = typeof season === 'string' ? season.trim() : '';
  if (!seasonText) return null;
  return { tier, division, lp, season: seasonText };
}

function strength(rank: HistoricalRank): number {
  const divisionScore = rank.division ? 5 - Number(rank.division) : 0;
  return (TIER_WEIGHT[rank.tier] ?? 0) * 100_000 + divisionScore * 10_000 + (rank.lp ?? -1);
}

function bestRank(records: SeasonRecord[]): HistoricalRank | null {
  let best: HistoricalRank | null = null;
  for (const record of records) {
    const peak = normalizeRank(record.rank_entries?.high_rank_info, record.season);
    const final = normalizeRank(record.rank_entries?.rank_info, record.season);
    const candidate = peak ?? final;
    if (candidate && (!best || strength(candidate) > strength(best))) best = candidate;
  }
  return best;
}

export function parseOpggHistoricalRanks(html: string): Pick<HistoricalRanks, 'historicalSolo' | 'historicalFlex'> {
  const $ = cheerio.load(html);
  const queues: Record<'SOLORANKED' | 'FLEXRANKED', SeasonRecord[]> = { SOLORANKED: [], FLEXRANKED: [] };
  const payloads: string[] = [];
  const records = new Map<string, unknown>();
  $('script').each((_, element) => {
    const payload = decodeFlightPayload($(element).text());
    if (!payload) return;
    payloads.push(payload);
    const separator = payload.indexOf(':');
    if (separator > 0 && /^[a-f\d]+$/i.test(payload.slice(0, separator))) {
      const parsedRecord = jsonValueAt(payload, separator + 1);
      if (parsedRecord) records.set(payload.slice(0, separator), parsedRecord.value);
    }
  });

  function resolveReference(reference: unknown): unknown {
    if (typeof reference !== 'string' || !reference.startsWith('$')) return reference;
    const [id, ...path] = reference.slice(1).split(':');
    let value = records.get(id ?? '');
    for (const part of path) {
      if (part === 'props' && Array.isArray(value)) value = value[3];
      else if (Array.isArray(value) && /^\d+$/.test(part)) value = value[Number(part)];
      else if (value && typeof value === 'object') value = (value as Record<string, unknown>)[part];
      else return undefined;
    }
    return value;
  }

  for (const payload of payloads) {
    if (!payload.includes('rank_entries')) continue;
    let cursor = 0;
    while ((cursor = payload.indexOf('"data":', cursor)) >= 0) {
      const arrayStart = cursor + '"data":'.length;
      const parsed = jsonValueAt(payload, arrayStart);
      cursor = parsed?.end ?? arrayStart + 1;
      if (!parsed || !Array.isArray(parsed.value)) continue;
      const records = parsed.value as SeasonRecord[];
      if (!records.some((record) => record && typeof record === 'object' && record.rank_entries && typeof record.season === 'string')) continue;
      const gameTypeIndex = payload.indexOf('"gameType":', parsed.end);
      if (gameTypeIndex < 0 || gameTypeIndex - parsed.end > 300) continue;
      const valueStart = gameTypeIndex + '"gameType":'.length;
      let gameTypeValue: unknown;
      if (payload[valueStart] === '"') {
        const valueEnd = payload.indexOf('"', valueStart + 1);
        gameTypeValue = resolveReference(valueEnd > valueStart ? payload.slice(valueStart + 1, valueEnd) : undefined);
      } else gameTypeValue = jsonValueAt(payload, valueStart)?.value;
      const gameType = gameTypeValue as { game_type?: unknown } | undefined;
      if (gameType?.game_type === 'SOLORANKED' || gameType?.game_type === 'FLEXRANKED') queues[gameType.game_type].push(...records);
    }
  }
  if (!queues.SOLORANKED.length && !queues.FLEXRANKED.length) throw new HttpError(502, 'OPGG_PARSE_FAILED', 'OP.GG 과거 시즌 기록 구조를 확인할 수 없습니다.');
  return { historicalSolo: bestRank(queues.SOLORANKED), historicalFlex: bestRank(queues.FLEXRANKED) };
}

export async function getOpggHistoricalRanks(riotId: string): Promise<HistoricalRanks> {
  if (process.env.OPGG_SCRAPING_ENABLED?.toLowerCase() !== 'true') throw new HttpError(503, 'OPGG_DISABLED', 'OP.GG 조회가 비활성화되어 있습니다.');
  const { gameName, tagLine } = parseRiotId(riotId);
  const sourceUrl = `https://op.gg/lol/summoners/kr/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
  const key = sourceUrl.toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HUH-Inhouse/1.0)', 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) throw new HttpError(404, 'OPGG_NOT_FOUND', 'OP.GG 프로필을 찾을 수 없습니다.');
  if (!response.ok) throw new HttpError(502, 'OPGG_REQUEST_FAILED', `OP.GG 요청이 실패했습니다. (${response.status})`);
  const parsed = parseOpggHistoricalRanks(await response.text());
  const value = { ...parsed, sourceUrl, fetchedAt: new Date().toISOString() };
  cache.set(key, { expiresAt: Date.now() + 6 * 60 * 60 * 1000, value });
  return value;
}

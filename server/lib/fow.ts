import * as cheerio from 'cheerio';
import { HttpError } from './http.js';
import { parseRiotId } from '../../src/lib/riotId.js';

export interface HistoricalRank { tier: string; division: string | null; lp: number | null; season: string }
export interface SeasonRankRecord { season: string; finalRank: HistoricalRank | null; peakRank: HistoricalRank | null }
export interface FowRankHistory { solo: SeasonRankRecord[]; flex: SeasonRankRecord[]; historicalSolo: HistoricalRank | null; historicalFlex: HistoricalRank | null; sourceUrl: string; fetchedAt: string }

const TIER_WEIGHT: Record<string, number> = { IRON: 1, BRONZE: 2, SILVER: 3, GOLD: 4, PLATINUM: 5, EMERALD: 6, DIAMOND: 7, MASTER: 8, GRANDMASTER: 9, CHALLENGER: 10 };
const cache = new Map<string, { expiresAt: number; value: FowRankHistory }>();

function rankStrength(rank: HistoricalRank | null): number {
  if (!rank) return -1;
  const divisionScore = rank.division ? 5 - Number(rank.division) : 0;
  return (TIER_WEIGHT[rank.tier] ?? 0) * 100_000 + divisionScore * 10_000 + (rank.lp ?? -1);
}

function parseRank(text: string, season: string): HistoricalRank | null {
  const match = text.trim().match(/(IRON|BRONZE|SILVER|GOLD|PLATINUM|EMERALD|DIAMOND|MASTER|GRANDMASTER|CHALLENGER)(?:\s+(IV|III|II|I))?\s*-\s*(\d+)/i);
  if (!match) return null;
  const divisionMap: Record<string, string> = { I: '1', II: '2', III: '3', IV: '4' };
  return { tier: match[1]!.toUpperCase(), division: match[2] ? divisionMap[match[2].toUpperCase()] ?? null : null, lp: Number(match[3]!), season };
}

function recordValue(text: string, label: 'final' | 'peak', season: string): HistoricalRank | null {
  const labelPattern = label === 'final' ? '(?:최종\\s*기록|Final\\s*record)' : '(?:최고\\s*기록|Peak\\s*record)';
  const match = text.match(new RegExp(`${labelPattern}\\s*:?\\s*([^\\n\\r]+)`, 'i'));
  return match?.[1] ? parseRank(match[1], season) : null;
}

function best(records: SeasonRankRecord[]): HistoricalRank | null {
  return records.reduce<HistoricalRank | null>((current, record) => rankStrength(record.peakRank) > rankStrength(current) ? record.peakRank : current, null);
}

export function parseFowRankHistory(html: string): Pick<FowRankHistory, 'solo' | 'flex' | 'historicalSolo' | 'historicalFlex'> {
  const $ = cheerio.load(html);
  const result: Pick<FowRankHistory, 'solo' | 'flex'> = { solo: [], flex: [] };
  $('div.tipsy_live[tipsy]').each((_, element) => {
    const season = $(element).text().trim().match(/S\d+(?:\s*-\s*\d+)?/i)?.[0]?.replace(/\s+/g, ' ') ?? '';
    const tooltip = $(element).attr('tipsy');
    if (!season || !tooltip) return;
    for (const sourceBlock of tooltip.split(/<hr\s*\/?>/i)) {
      const text = cheerio.load(`<div>${sourceBlock}</div>`).text().replace(/\u00a0/g, ' ').trim();
      const queue = /솔로랭크|solo\s*ranked/i.test(text) ? 'solo' : /자유랭크|flex\s*ranked/i.test(text) ? 'flex' : null;
      if (!queue) continue;
      const finalRank = recordValue(text, 'final', season);
      const peakRank = recordValue(text, 'peak', season);
      if (finalRank || peakRank) result[queue].push({ season, finalRank, peakRank });
    }
  });
  if (!result.solo.length && !result.flex.length) throw new HttpError(502, 'FOW_PARSE_FAILED', 'FOW 시즌별 랭크 기록 구조를 확인할 수 없습니다.');
  return { ...result, historicalSolo: best(result.solo), historicalFlex: best(result.flex) };
}

export async function getFowRankHistory(riotId: string, bypassCache = false): Promise<FowRankHistory> {
  if (process.env.FOW_SCRAPING_ENABLED?.toLowerCase() === 'false') throw new HttpError(503, 'FOW_DISABLED', 'FOW 조회가 비활성화되어 있습니다.');
  const { gameName, tagLine } = parseRiotId(riotId);
  const sourceUrl = `https://www.fow.lol/find/kr/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
  const cached = cache.get(sourceUrl.toLowerCase());
  if (!bypassCache && cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await fetch(sourceUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HUH-Inhouse/1.0)', 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new HttpError(502, 'FOW_REQUEST_FAILED', `FOW 요청이 실패했습니다. (${response.status})`);
  const value = { ...parseFowRankHistory(await response.text()), sourceUrl, fetchedAt: new Date().toISOString() };
  cache.set(sourceUrl.toLowerCase(), { expiresAt: Date.now() + 6 * 60 * 60 * 1000, value });
  return value;
}

export { rankStrength };

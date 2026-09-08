import { assertDb, db } from '../../server/lib/db.js';
import { handler, bodyAsObject, HttpError, requireMethod } from '../../server/lib/http.js';
import { mapPlayer } from '../../server/lib/mappers.js';
import { getFowRankHistory, rankStrength, type HistoricalRank } from '../../server/lib/fow.js';
import { getOpggHistoricalRanks } from '../../server/lib/opgg.js';
import { getRiotAccount, getSoloRank, resolveRiotKey } from '../../server/lib/riot.js';

export default handler(async (req, res) => {
  requireMethod(req, ['POST']);
  const body = bodyAsObject(req);
  const playerId = String(body.playerId ?? '');
  if (!playerId) throw new HttpError(400, 'PLAYER_REQUIRED', '플레이어 ID가 필요합니다.');
  const client = db();
  const existing = assertDb(await client.from('players').select('*').eq('id', playerId).single());
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  const warnings: string[] = [];
  let resolvedRiotId = String(existing.riot_id);
  const higher = (left: HistoricalRank | null, right: HistoricalRank | null) => rankStrength(left) >= rankStrength(right) ? left : right;

  // Riot와 OP.GG는 서로 독립적인 데이터 소스다. 한쪽 장애나 키 만료가
  // 다른 쪽의 정상 결과 저장을 막지 않도록 각각 별도로 처리한다.
  try {
    const key = resolveRiotKey(req.headers['x-riot-api-key']);
    const account = await getRiotAccount(resolvedRiotId, key);
    const solo = await getSoloRank(account.puuid, key);
    resolvedRiotId = `${account.gameName}#${account.tagLine}`;
    Object.assign(patch, {
      puuid: account.puuid, riot_game_name: account.gameName, riot_tag_line: account.tagLine, riot_id: resolvedRiotId,
      current_solo_tier: solo?.tier ?? null, current_solo_division: solo?.rank ?? null, current_solo_lp: solo?.leaguePoints ?? null,
      current_solo_wins: solo?.wins ?? null, current_solo_losses: solo?.losses ?? null,
      current_solo_win_rate: solo ? Math.round((solo.wins / Math.max(1, solo.wins + solo.losses)) * 1000) / 10 : null,
      riot_last_updated_at: now,
    });
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'Riot 현재 랭크 조회에 실패했습니다.');
  }

  const [fowResult, opggResult] = await Promise.allSettled([
    getFowRankHistory(resolvedRiotId, true),
    getOpggHistoricalRanks(resolvedRiotId, true)
  ]);
  const fowHistory = fowResult.status === 'fulfilled' ? fowResult.value : null;
  const opggHistory = opggResult.status === 'fulfilled' ? opggResult.value : null;
  if (fowHistory || opggHistory) {
    const solo = higher(fowHistory?.historicalSolo ?? null, opggHistory?.historicalSolo ?? null);
    const flex = higher(fowHistory?.historicalFlex ?? null, opggHistory?.historicalFlex ?? null);
    Object.assign(patch, {
      historical_solo_tier: solo?.tier ?? null, historical_solo_division: solo?.division ?? null, historical_solo_lp: solo?.lp ?? null, historical_solo_season: solo?.season ?? null,
      historical_flex_tier: flex?.tier ?? null, historical_flex_division: flex?.division ?? null, historical_flex_lp: flex?.lp ?? null, historical_flex_season: flex?.season ?? null,
      ...(fowHistory && { historical_rank_history: { solo: fowHistory.solo, flex: fowHistory.flex } }),
      historical_rank_last_updated_at: now,
    });
  }
  if (fowResult.status === 'rejected') warnings.push(fowResult.reason instanceof Error ? fowResult.reason.message : 'FOW 시즌별 과거 기록 조회에 실패했습니다.');
  if (opggResult.status === 'rejected') warnings.push(opggResult.reason instanceof Error ? opggResult.reason.message : 'OP.GG 과거 기록 조회에 실패했습니다.');
  const row = assertDb(await client.from('players').update(patch).eq('id', playerId).select().single());
  res.status(200).json({ player: mapPlayer(row), warnings });
});

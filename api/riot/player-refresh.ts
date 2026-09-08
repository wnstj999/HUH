import { assertDb, db } from '../../server/lib/db.js';
import { handler, bodyAsObject, HttpError, requireMethod } from '../../server/lib/http.js';
import { mapPlayer } from '../../server/lib/mappers.js';
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

  try {
    const history = await getOpggHistoricalRanks(resolvedRiotId);
    Object.assign(patch, {
      historical_solo_tier: history.historicalSolo?.tier ?? null, historical_solo_division: history.historicalSolo?.division ?? null, historical_solo_lp: history.historicalSolo?.lp ?? null, historical_solo_season: history.historicalSolo?.season ?? null,
      historical_flex_tier: history.historicalFlex?.tier ?? null, historical_flex_division: history.historicalFlex?.division ?? null, historical_flex_lp: history.historicalFlex?.lp ?? null, historical_flex_season: history.historicalFlex?.season ?? null,
      historical_rank_last_updated_at: now,
    });
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'OP.GG 과거 기록 조회에 실패했습니다.');
  }
  const row = assertDb(await client.from('players').update(patch).eq('id', playerId).select().single());
  res.status(200).json({ player: mapPlayer(row), warnings });
});

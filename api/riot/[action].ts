import { assertDb, db } from '../../server/lib/db.js';
import { handler, bodyAsObject, HttpError, requireMethod } from '../../server/lib/http.js';
import { mapPlayer } from '../../server/lib/mappers.js';
import { getFowRankHistory, rankStrength, type HistoricalRank } from '../../server/lib/fow.js';
import { getOpggHistoricalRanks } from '../../server/lib/opgg.js';
import { getMatchDetail, getMatchIds, getRiotAccount, getSoloRank, testRiotConnection } from '../../server/lib/riot.js';
import { resolveRiotKey } from '../../server/lib/settings.js';
import { calculatePowerRating, normalizePosition, type PlayerMatchRecord, type PlayerRankInfo } from '../../server/lib/powerRating.js';

function actionName(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default handler(async (req, res) => {
  const action = actionName(req.query.action);
  requireMethod(req, ['POST']);
  const key = await resolveRiotKey();

  if (action === 'test') {
    await testRiotConnection(key);
    res.status(200).json({ status: 'connected', message: 'Riot API에 연결되었습니다.' });
    return;
  }

  const body = bodyAsObject(req);

  if (action === 'account') {
    const account = await getRiotAccount(String(body.riotId ?? ''), key);
    res.status(200).json({ account });
    return;
  }

  if (action === 'rank') {
    const rank = await getSoloRank(String(body.puuid ?? ''), key);
    res.status(200).json({ rank });
    return;
  }

  if (action === 'player-refresh') {
    const playerId = String(body.playerId ?? '');
    if (!playerId) throw new HttpError(400, 'PLAYER_REQUIRED', '플레이어 ID가 필요합니다.');
    const client = db();
    const existing = assertDb(await client.from('players').select('*').eq('id', playerId).single());
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    const warnings: string[] = [];
    let resolvedRiotId = String(existing.riot_id);
    const higher = (left: HistoricalRank | null, right: HistoricalRank | null) => rankStrength(left) >= rankStrength(right) ? left : right;

    try {
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
    return;
  }

  if (action === 'matches') {
    const playerId = body.playerId ? String(body.playerId) : null;
    let riotId = body.riotId ? String(body.riotId) : null;
    const count = Number(body.count ?? 20);
    const queueFilter = body.queueFilter ? String(body.queueFilter).toUpperCase() : 'ALL';
    if (!Number.isInteger(count) || count < 5 || count > 100) throw new HttpError(400, 'INVALID_COUNT', '조회 경기 수는 5~100 사이의 정수여야 합니다.');
    if (!['ALL', 'SOLO', 'FLEX'].includes(queueFilter)) throw new HttpError(400, 'INVALID_QUEUE', '솔로랭크·자유랭크·전체 중 선택해 주세요.');

    const client = db();
    let playerRow: Record<string, unknown> | null = null;

    if (playerId) {
      const fetchRes = await client.from('players').select('*').eq('id', playerId).maybeSingle();
      if (fetchRes.error) throw new HttpError(500, 'DATABASE_ERROR', '플레이어 조회에 실패했습니다.');
      playerRow = fetchRes.data as Record<string, unknown> | null;
      if (!playerRow) throw new HttpError(404, 'PLAYER_NOT_FOUND', '등록된 플레이어를 찾을 수 없습니다.');
      riotId = String(playerRow.riot_id);
    }

    if (!riotId) throw new HttpError(400, 'RIOT_ID_REQUIRED', 'Riot ID 또는 Player ID가 필요합니다.');

    const account = await getRiotAccount(riotId, key);
    const puuid = account.puuid;

    let queueIdParam: number | undefined = undefined;
    if (queueFilter === 'SOLO') queueIdParam = 420;
    else if (queueFilter === 'FLEX') queueIdParam = 440;

    const matchIds = await getMatchIds(puuid, key, { count, queue: queueIdParam });

    const { data: cachedMatches, error: cacheError } = await client
      .from('player_match_stats')
      .select('match_id')
      .eq('puuid', puuid)
      .in('match_id', matchIds.length > 0 ? matchIds : ['dummy']);
    if (cacheError) throw new HttpError(500, 'DATABASE_ERROR', '저장된 전적 조회에 실패했습니다.');

    const cachedSet = new Set((cachedMatches || []).map((m: { match_id: string }) => m.match_id));
    const newMatchIds = matchIds.filter((id) => !cachedSet.has(id));

    const warnings: string[] = [];
    const newlySaved: PlayerMatchRecord[] = [];

    for (const matchId of newMatchIds) {
      try {
        const detail = await getMatchDetail(matchId, key);
        const participant = detail.info.participants.find((p) => p.puuid === puuid);
        if (!participant) continue;

        const qId = detail.info.queueId;
        const qType: 'SOLO' | 'FLEX' | 'NORMAL' = qId === 420 ? 'SOLO' : qId === 440 ? 'FLEX' : 'NORMAL';
        const pos = normalizePosition(participant.teamPosition || participant.individualPosition || '');
        const gameCreationIso = new Date(detail.info.gameCreation).toISOString();

        const record: PlayerMatchRecord = {
          matchId,
          queueId: qId,
          queueType: qType,
          championId: participant.championId,
          championName: participant.championName || 'Unknown',
          position: pos,
          win: Boolean(participant.win),
          kills: participant.kills ?? 0,
          deaths: participant.deaths ?? 0,
          assists: participant.assists ?? 0,
          cs: (participant.totalMinionsKilled ?? 0) + (participant.neutralMinionsKilled ?? 0),
          goldEarned: participant.goldEarned ?? 0,
          damageToChampions: participant.totalDamageDealtToChampions ?? 0,
          visionScore: participant.visionScore ?? 0,
          gameDuration: detail.info.gameDuration ?? 0,
          gameCreationAt: gameCreationIso,
        };

        const { error: saveError } = await client.from('player_match_stats').upsert({
          puuid,
          match_id: matchId,
          queue_id: qId,
          queue_type: qType,
          champion_id: participant.championId,
          champion_name: participant.championName || 'Unknown',
          position: pos,
          win: Boolean(participant.win),
          kills: participant.kills ?? 0,
          deaths: participant.deaths ?? 0,
          assists: participant.assists ?? 0,
          cs: record.cs,
          gold_earned: participant.goldEarned ?? 0,
          damage_to_champions: participant.totalDamageDealtToChampions ?? 0,
          vision_score: participant.visionScore ?? 0,
          game_duration: detail.info.gameDuration ?? 0,
          game_creation_at: gameCreationIso,
        }, { onConflict: 'puuid,match_id' });
        if (saveError) throw new HttpError(500, 'DATABASE_ERROR', '전적 DB 저장에 실패했습니다.');

        newlySaved.push(record);
        await new Promise((r) => setTimeout(r, 50));
      } catch (err) {
        warnings.push(`경기 ${matchId} 수집 실패: ${err instanceof Error ? err.message : String(err)}`);
        if (err instanceof HttpError && [401, 403, 429].includes(err.status)) break;
      }
    }

    const { data: allStoredMatches, error: storedError } = await client
      .from('player_match_stats')
      .select('*')
      .eq('puuid', puuid)
      .in('match_id', matchIds.length ? matchIds : ['no-matches'])
      .order('game_creation_at', { ascending: false })
      .limit(count);
    if (storedError) throw new HttpError(500, 'DATABASE_ERROR', '분석 대상 전적을 읽지 못했습니다.');
    if (matchIds.length && !allStoredMatches?.length && warnings.length) throw new HttpError(502, 'MATCH_COLLECTION_FAILED', '전적 수집에 실패했습니다. 기존 분석 점수는 유지됩니다.');

    const mappedMatches: PlayerMatchRecord[] = (allStoredMatches || []).map((row) => ({
      matchId: String(row.match_id),
      queueId: Number(row.queue_id),
      queueType: row.queue_type as 'SOLO' | 'FLEX' | 'NORMAL',
      championId: Number(row.champion_id),
      championName: String(row.champion_name),
      position: row.position as 'TOP' | 'JUG' | 'MID' | 'ADC' | 'SUP' | 'UNKNOWN',
      win: Boolean(row.win),
      kills: Number(row.kills || 0),
      deaths: Number(row.deaths || 0),
      assists: Number(row.assists || 0),
      cs: Number(row.cs || 0),
      goldEarned: Number(row.gold_earned || 0),
      damageToChampions: Number(row.damage_to_champions || 0),
      visionScore: Number(row.vision_score || 0),
      gameDuration: Number(row.game_duration || 0),
      gameCreationAt: String(row.game_creation_at),
    }));

    const rankInfo: PlayerRankInfo = {
      inhouseTier: playerRow ? String(playerRow.inhouse_tier) : 'C',
      inhouseScore: playerRow ? Number(playerRow.inhouse_score) : 7,
      currentSoloTier: playerRow ? (playerRow.current_solo_tier ? String(playerRow.current_solo_tier) : null) : null,
      currentSoloDivision: playerRow ? (playerRow.current_solo_division ? String(playerRow.current_solo_division) : null) : null,
      currentSoloLp: playerRow ? (playerRow.current_solo_lp != null ? Number(playerRow.current_solo_lp) : null) : null,
      historicalSoloTier: playerRow ? (playerRow.historical_solo_tier ? String(playerRow.historical_solo_tier) : null) : null,
      historicalSoloSeason: playerRow ? (playerRow.historical_solo_season ? String(playerRow.historical_solo_season) : null) : null,
      historicalFlexTier: playerRow ? (playerRow.historical_flex_tier ? String(playerRow.historical_flex_tier) : null) : null,
    };

    const rating = calculatePowerRating(rankInfo, mappedMatches);

    if (playerId) {
      const { error: ratingError } = await client.from('player_power_ratings').upsert({
        player_id: playerId,
        overall_score: rating.overallScore,
        confidence_level: rating.confidenceLevel,
        confidence_reason: rating.confidenceReason,
        sample_games_count: rating.sampleGamesCount,
        evaluated_period_days: rating.evaluatedPeriodDays,
        top_score: rating.topScore,
        jug_score: rating.jugScore,
        mid_score: rating.midScore,
        adc_score: rating.adcScore,
        sup_score: rating.supScore,
        top_games: rating.topGames,
        jug_games: rating.jugGames,
        mid_games: rating.midGames,
        adc_games: rating.adcGames,
        sup_games: rating.supGames,
        breakdown: rating.breakdown,
        model_version: rating.modelVersion,
        calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'player_id' });
      if (ratingError) throw new HttpError(500, 'DATABASE_ERROR', '분석 점수 DB 저장에 실패했습니다. 수집된 경기 기록은 유지됩니다.');
    }

    res.status(200).json({
      puuid,
      riotId: `${account.gameName}#${account.tagLine}`,
      totalMatchesCount: mappedMatches.length,
      newlyFetchedCount: newlySaved.length,
      cachedMatchesCount: cachedSet.size,
      rating: { ...rating, playerId, calculatedAt: new Date().toISOString() },
      recentMatches: mappedMatches.slice(0, 20),
      warnings,
    });
    return;
  }

  res.status(404).json({ error: { code: 'RIOT_ROUTE_NOT_FOUND', message: 'Riot API 경로를 찾을 수 없습니다.' } });
});

import { db } from '../../server/lib/db.js';
import { handler, bodyAsObject, HttpError, requireMethod } from '../../server/lib/http.js';
import { getMatchDetail, getMatchIds, getRiotAccount } from '../../server/lib/riot.js';
import { resolveRiotKey } from '../../server/lib/settings.js';
import { calculatePowerRating, normalizePosition, type PlayerMatchRecord, type PlayerRankInfo } from '../../server/lib/powerRating.js';

export default handler(async (req, res) => {
  requireMethod(req, ['POST']);
  const body = bodyAsObject(req);
  const playerId = body.playerId ? String(body.playerId) : null;
  let riotId = body.riotId ? String(body.riotId) : null;
  const count = Math.min(Math.max(Number(body.count || 20), 5), 100);
  const queueFilter = body.queueFilter ? String(body.queueFilter).toUpperCase() : 'ALL'; // 'SOLO' | 'FLEX' | 'ALL'

  const client = db();
  let playerRow: Record<string, unknown> | null = null;

  if (playerId) {
    const fetchRes = await client.from('players').select('*').eq('id', playerId).maybeSingle();
    playerRow = fetchRes.data as Record<string, unknown> | null;
    if (!playerRow) throw new HttpError(404, 'PLAYER_NOT_FOUND', '등록된 플레이어를 찾을 수 없습니다.');
    riotId = String(playerRow.riot_id);
  }

  if (!riotId) throw new HttpError(400, 'RIOT_ID_REQUIRED', 'Riot ID 또는 Player ID가 필요합니다.');

  const key = await resolveRiotKey();
  const account = await getRiotAccount(riotId, key);
  const puuid = account.puuid;

  // 1. 큐 필터에 따른 Match-v5 queue 파라미터 매핑
  let queueIdParam: number | undefined = undefined;
  if (queueFilter === 'SOLO') queueIdParam = 420;
  else if (queueFilter === 'FLEX') queueIdParam = 440;

  const matchIds = await getMatchIds(puuid, key, { count, queue: queueIdParam });

  // 2. 이미 DB 캐시에 저장된 경기 확인 (중복 조회 방지)
  const { data: cachedMatches } = await client
    .from('player_match_stats')
    .select('match_id')
    .eq('puuid', puuid)
    .in('match_id', matchIds.length > 0 ? matchIds : ['dummy']);

  const cachedSet = new Set((cachedMatches || []).map((m: { match_id: string }) => m.match_id));
  const newMatchIds = matchIds.filter((id) => !cachedSet.has(id));

  const warnings: string[] = [];
  const newlySaved: PlayerMatchRecord[] = [];

  // 3. 신규 경기 상세 조회 및 DB 캐싱
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

      await client.from('player_match_stats').upsert({
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

      newlySaved.push(record);
      // Rate Limit 예방을 위한 가벼운 지연 (50ms)
      await new Promise((r) => setTimeout(r, 50));
    } catch (err) {
      warnings.push(`경기 ${matchId} 수집 실패: ${err instanceof Error ? err.message : String(err)}`);
      // 부분 실패 시에도 계속 진행
    }
  }

  // 4. 해당 플레이어의 누적 전적 전체 조회 (최근순 최대 100건)
  const { data: allStoredMatches } = await client
    .from('player_match_stats')
    .select('*')
    .eq('puuid', puuid)
    .order('game_creation_at', { ascending: false })
    .limit(100);

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


  // 5. 전력 평가 계산
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

  // 6. DB player_power_ratings 저장 (플레이어가 등록된 경우)
  if (playerId) {
    await client.from('player_power_ratings').upsert({
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
  }

  res.status(200).json({
    puuid,
    riotId: `${account.gameName}#${account.tagLine}`,
    totalMatchesCount: mappedMatches.length,
    newlyFetchedCount: newlySaved.length,
    cachedMatchesCount: cachedSet.size,
    rating,
    recentMatches: mappedMatches.slice(0, 20),
    warnings,
  });
});

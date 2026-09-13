import { db } from '../../server/lib/db.js';
import { handler, requireMethod } from '../../server/lib/http.js';

export default handler(async (req, res) => {
  requireMethod(req, ['GET']);
  const client = db();
  const playerId = Array.isArray(req.query.playerId) ? req.query.playerId[0] : req.query.playerId;

  if (playerId) {
    // 1. 단일 플레이어 전력 점수 및 상세 통계
    const { data: ratingRow } = await client
      .from('player_power_ratings')
      .select('*')
      .eq('player_id', playerId)
      .maybeSingle();

    const { data: playerRow } = await client
      .from('players')
      .select('*')
      .eq('id', playerId)
      .maybeSingle();

    interface StoredMatchRow {
      champion_name?: string;
      win?: boolean;
      kills?: number;
      deaths?: number;
      assists?: number;
      position?: string;
    }

    let matchStats: StoredMatchRow[] = [];
    if (playerRow?.puuid) {
      const { data: matches } = await client
        .from('player_match_stats')
        .select('*')
        .eq('puuid', playerRow.puuid)
        .order('game_creation_at', { ascending: false })
        .limit(100);
      matchStats = (matches || []) as StoredMatchRow[];
    }

    // 모스트 챔피언 집계 (판수, 승률, KDA)
    const champMap = new Map<string, { count: number; wins: number; kills: number; deaths: number; assists: number }>();
    for (const m of matchStats) {
      const name = m.champion_name || 'Unknown';
      const curr = champMap.get(name) || { count: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
      curr.count += 1;
      if (m.win) curr.wins += 1;
      curr.kills += m.kills || 0;
      curr.deaths += m.deaths || 0;
      curr.assists += m.assists || 0;
      champMap.set(name, curr);
    }

    const topChampions = Array.from(champMap.entries())
      .map(([name, stat]) => ({
        championName: name,
        games: stat.count,
        winRate: Math.round((stat.wins / stat.count) * 100),
        kda: Number(((stat.kills + stat.assists) / Math.max(1, stat.deaths)).toFixed(2)),
      }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 5);

    // 포지션별 통계
    const positions = ['TOP', 'JUG', 'MID', 'ADC', 'SUP'] as const;
    const positionStats = positions.map((pos) => {
      const posMatches = matchStats.filter((m) => m.position === pos);
      const count = posMatches.length;
      const wins = posMatches.filter((m) => m.win).length;
      return {
        position: pos,
        games: count,
        winRate: count > 0 ? Math.round((wins / count) * 100) : 0,
        score: ratingRow ? Number(ratingRow[`${pos.toLowerCase()}_score`] ?? ratingRow.overall_score) : null,
      };
    });

    res.status(200).json({
      playerId,
      rating: ratingRow,
      topChampions,
      positionStats,
      totalCachedMatches: matchStats.length,
      lastCalculatedAt: ratingRow?.calculated_at ?? null,
    });
    return;
  }

  // 2. 전체 플레이어 전력 점수 맵 조회
  const { data: allRatings } = await client.from('player_power_ratings').select('*');
  const ratingMap: Record<string, unknown> = {};
  for (const r of allRatings || []) {
    ratingMap[r.player_id] = r;
  }

  res.status(200).json({ ratings: ratingMap });
});

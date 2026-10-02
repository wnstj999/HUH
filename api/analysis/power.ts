import { assertDb, db } from '../../server/lib/db.js';
import { handler, HttpError, requireMethod } from '../../server/lib/http.js';
import { mapMatch, mapPlayer } from '../../server/lib/mappers.js';
import { inhouseRating, inhouseRecords } from '../../server/lib/inhouseAnalysis.js';

export default handler(async (req, res) => {
  requireMethod(req, ['GET']);
  const client = db();
  const [playerResult, matchResult] = await Promise.all([
    client.from('players').select('*'),
    client.from('inhouse_matches').select('*, inhouse_events(id,name), match_participants(*, players(id,display_name,inhouse_tier,inhouse_score))').eq('status', 'COMPLETED').order('created_at', { ascending: false }).limit(500),
  ]);
  const players = assertDb(playerResult).map(mapPlayer);
  const matches = assertDb(matchResult).map(mapMatch);
  const playerId = Array.isArray(req.query.playerId) ? req.query.playerId[0] : req.query.playerId;
  if (!playerId) {
    res.status(200).json({ source: 'INHOUSE', ratings: Object.fromEntries(players.map(player => [player.id, inhouseRating(player, matches)])) });
    return;
  }
  const player = players.find(player => player.id === playerId);
  if (!player) throw new HttpError(404, 'NOT_FOUND', '선수를 찾을 수 없습니다.');
  const rating = inhouseRating(player, matches);
  const records = inhouseRecords(playerId, matches).filter(record => Date.parse(record.gameCreationAt) <= Date.now() && Date.now() - Date.parse(record.gameCreationAt) <= 180 * 86400000 && record.gameDuration >= 480).sort((a,b) => Date.parse(b.gameCreationAt) - Date.parse(a.gameCreationAt)).slice(0,100);
  const championNames = [...new Set(records.map(record => record.championName).filter(Boolean))];
  const topChampions = championNames.map(championName => {
    const games = records.filter(record => record.championName === championName);
    return { championName, games: games.length, winRate: Math.round(games.filter(game => game.win).length / games.length * 100), kda: Number((games.reduce((sum,game) => sum + game.kills + game.assists,0) / Math.max(1,games.reduce((sum,game) => sum + game.deaths,0))).toFixed(2)) };
  }).sort((a,b) => b.games - a.games).slice(0,5);
  res.status(200).json({ playerId, source: 'INHOUSE', rating, topChampions, positionStats: Object.entries(rating.breakdown.roleMastery).map(([position,role]) => ({ position, games: role.games, winRate: role.winRate, score: role.masteryScore })), totalCachedMatches: records.length, inhouseTotalGames: matches.filter(match => match.participants.some(participant => participant.playerId === playerId)).length, recentMatches: records.slice(0,10).map(record => ({ matchId: record.matchId, playedAt: record.gameCreationAt, queueId: record.queueId, championName: record.championName, position: record.position, win: record.win, kills: record.kills, deaths: record.deaths, assists: record.assists })), lastCalculatedAt: rating.calculatedAt });
});

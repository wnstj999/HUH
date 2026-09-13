import { db } from '../../server/lib/db.js';
import { handler, bodyAsObject, HttpError, requireMethod } from '../../server/lib/http.js';

export default handler(async (req, res) => {
  const client = db();
  const tournamentId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

  if (!tournamentId) throw new HttpError(400, 'ID_REQUIRED', '토너먼트 ID가 필요합니다.');

  // 1. 상세 조회
  if (req.method === 'GET') {
    const { data: tourney, error: tErr } = await client
      .from('tournaments')
      .select('*, winner_team:inhouse_custom_teams(id, name)')
      .eq('id', tournamentId)
      .maybeSingle();

    if (tErr || !tourney) throw new HttpError(404, 'NOT_FOUND', '토너먼트를 찾을 수 없습니다.');

    const { data: matches, error: mErr } = await client
      .from('tournament_matches')
      .select('*, team1:inhouse_custom_teams!tournament_matches_team1_id_fkey(id, name), team2:inhouse_custom_teams!tournament_matches_team2_id_fkey(id, name), winner_team:inhouse_custom_teams!tournament_matches_winner_team_id_fkey(id, name)')
      .eq('tournament_id', tournamentId)
      .order('round_number', { ascending: true })
      .order('match_index', { ascending: true });

    if (mErr) throw new HttpError(500, 'DATABASE_ERROR', '대진표 경기를 불러오지 못했습니다.');

    res.status(200).json({
      tournament: tourney,
      matches: matches || [],
    });
    return;
  }

  // 2. 삭제
  if (req.method === 'DELETE') {
    const { error } = await client.from('tournaments').delete().eq('id', tournamentId);
    if (error) throw new HttpError(500, 'DATABASE_ERROR', '토너먼트를 삭제하지 못했습니다.');
    res.status(200).json({ success: true, id: tournamentId });
    return;
  }

  // 3. 경기 결과 입력 / 수정 (PATCH)
  if (req.method === 'PATCH') {
    const body = bodyAsObject(req);
    const matchId = String(body.matchId ?? '');
    const winnerTeamId = body.winnerTeamId ? String(body.winnerTeamId) : null;
    const team1Score = Number(body.team1Score ?? 0);
    const team2Score = Number(body.team2Score ?? 0);
    const forceUpdate = Boolean(body.forceUpdate);

    if (!matchId) throw new HttpError(400, 'MATCH_ID_REQUIRED', '경기 ID가 필요합니다.');

    // 현재 경기 조회
    const { data: currentMatch, error: cErr } = await client
      .from('tournament_matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (cErr || !currentMatch) throw new HttpError(404, 'MATCH_NOT_FOUND', '해당 대진 경기를 찾을 수 없습니다.');

    const prevWinnerId = currentMatch.winner_team_id;
    const nextMatchId = currentMatch.next_match_id;
    const nextSlot = currentMatch.next_slot; // 'team1' | 'team2'

    // 이전 승자와 새 승자가 다르고, 다음 경기가 이미 진행되었거나 완료되었는지 검사
    if (prevWinnerId && winnerTeamId && prevWinnerId !== winnerTeamId && nextMatchId) {
      const { data: nextMatch } = await client
        .from('tournament_matches')
        .select('*')
        .eq('id', nextMatchId)
        .single();

      if (nextMatch && (nextMatch.winner_team_id || nextMatch.status === 'COMPLETED' || nextMatch.status === 'IN_PROGRESS')) {
        if (!forceUpdate) {
          // 영향받는 다음 라운드 정보와 함께 경고 반환
          return res.status(409).json({
            conflict: true,
            message: '이미 다음 라운드 결과가 입력되어 있습니다. 이전 경기 결과를 수정하면 다음 라운드 대진 및 결과가 초기화됩니다.',
            affectedMatch: {
              roundNumber: nextMatch.round_number,
              matchIndex: nextMatch.match_index,
            },
          });
        }

        // 강제 업데이트일 경우: 다음 매치의 결과 초기화
        await client
          .from('tournament_matches')
          .update({
            winner_team_id: null,
            team1_score: 0,
            team2_score: 0,
            status: 'READY',
            updated_at: new Date().toISOString(),
          })
          .eq('id', nextMatchId);
      }
    }

    // 1. 현재 경기 업데이트
    const isCompleted = Boolean(winnerTeamId);
    await client
      .from('tournament_matches')
      .update({
        winner_team_id: winnerTeamId,
        team1_score: team1Score,
        team2_score: team2Score,
        status: isCompleted ? 'COMPLETED' : 'READY',
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId);

    // 2. 다음 라운드 진출 처리
    if (nextMatchId && nextSlot) {
      const patch: Record<string, unknown> = {
        [nextSlot === 'team1' ? 'team1_id' : 'team2_id']: winnerTeamId,
        updated_at: new Date().toISOString(),
      };
      await client.from('tournament_matches').update(patch).eq('id', nextMatchId);
    } else if (!nextMatchId && winnerTeamId) {
      // 결승전인 경우 토너먼트 우승팀 업데이트
      await client
        .from('tournaments')
        .update({
          winner_team_id: winnerTeamId,
          status: 'COMPLETED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', tournamentId);
    }

    // 전체 최신 대진표 반환
    const { data: updatedMatches } = await client
      .from('tournament_matches')
      .select('*, team1:inhouse_custom_teams!tournament_matches_team1_id_fkey(id, name), team2:inhouse_custom_teams!tournament_matches_team2_id_fkey(id, name), winner_team:inhouse_custom_teams!tournament_matches_winner_team_id_fkey(id, name)')
      .eq('tournament_id', tournamentId)
      .order('round_number', { ascending: true })
      .order('match_index', { ascending: true });

    res.status(200).json({ success: true, matches: updatedMatches });
    return;
  }

  requireMethod(req, ['GET', 'PATCH', 'DELETE']);
});

import { db } from '../server/lib/db.js';
import { handler, bodyAsObject, HttpError, requireMethod } from '../server/lib/http.js';

interface SeedPair {
  team1Id: string | null;
  team2Id: string | null;
}

function generateStandardSeeds(teamIds: string[], size: 4 | 8 | 16): SeedPair[] {
  const padded: Array<string | null> = [...teamIds];
  while (padded.length < size) {
    padded.push(null);
  }

  if (size === 4) {
    return [
      { team1Id: padded[0] ?? null, team2Id: padded[3] ?? null },
      { team1Id: padded[1] ?? null, team2Id: padded[2] ?? null },
    ];
  }

  if (size === 8) {
    return [
      { team1Id: padded[0] ?? null, team2Id: padded[7] ?? null },
      { team1Id: padded[3] ?? null, team2Id: padded[4] ?? null },
      { team1Id: padded[1] ?? null, team2Id: padded[6] ?? null },
      { team1Id: padded[2] ?? null, team2Id: padded[5] ?? null },
    ];
  }

  return [
    { team1Id: padded[0] ?? null, team2Id: padded[15] ?? null },
    { team1Id: padded[7] ?? null, team2Id: padded[8] ?? null },
    { team1Id: padded[3] ?? null, team2Id: padded[12] ?? null },
    { team1Id: padded[4] ?? null, team2Id: padded[11] ?? null },
    { team1Id: padded[1] ?? null, team2Id: padded[14] ?? null },
    { team1Id: padded[6] ?? null, team2Id: padded[9] ?? null },
    { team1Id: padded[2] ?? null, team2Id: padded[13] ?? null },
    { team1Id: padded[5] ?? null, team2Id: padded[10] ?? null },
  ];
}

export default handler(async (req, res) => {
  const client = db();
  const tournamentId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

  // 1. 단일 토너먼트 ID가 지정된 경우 ([id].ts 로직)
  if (tournamentId) {
    // 상세 조회
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

    // 삭제
    if (req.method === 'DELETE') {
      const { error } = await client.from('tournaments').delete().eq('id', tournamentId);
      if (error) throw new HttpError(500, 'DATABASE_ERROR', '토너먼트를 삭제하지 못했습니다.');
      res.status(200).json({ success: true, id: tournamentId });
      return;
    }

    // 경기 결과 입력 / 수정 (PATCH)
    if (req.method === 'PATCH') {
      const body = bodyAsObject(req);
      const matchId = String(body.matchId ?? '');
      const winnerTeamId = body.winnerTeamId ? String(body.winnerTeamId) : null;
      const team1Score = Number(body.team1Score ?? 0);
      const team2Score = Number(body.team2Score ?? 0);
      const forceUpdate = Boolean(body.forceUpdate);

      if (!matchId) throw new HttpError(400, 'MATCH_ID_REQUIRED', '경기 ID가 필요합니다.');

      const { data: currentMatch, error: cErr } = await client
        .from('tournament_matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (cErr || !currentMatch) throw new HttpError(404, 'MATCH_NOT_FOUND', '해당 대진 경기를 찾을 수 없습니다.');

      const prevWinnerId = currentMatch.winner_team_id;
      const nextMatchId = currentMatch.next_match_id;
      const nextSlot = currentMatch.next_slot;

      if (prevWinnerId && winnerTeamId && prevWinnerId !== winnerTeamId && nextMatchId) {
        const { data: nextMatch } = await client
          .from('tournament_matches')
          .select('*')
          .eq('id', nextMatchId)
          .single();

        if (nextMatch && (nextMatch.winner_team_id || nextMatch.status === 'COMPLETED' || nextMatch.status === 'IN_PROGRESS')) {
          if (!forceUpdate) {
            return res.status(409).json({
              conflict: true,
              message: '이미 다음 라운드 결과가 입력되어 있습니다. 이전 경기 결과를 수정하면 다음 라운드 대진 및 결과가 초기화됩니다.',
              affectedMatch: {
                roundNumber: nextMatch.round_number,
                matchIndex: nextMatch.match_index,
              },
            });
          }

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

      if (nextMatchId && nextSlot) {
        const patch: Record<string, unknown> = {
          [nextSlot === 'team1' ? 'team1_id' : 'team2_id']: winnerTeamId,
          updated_at: new Date().toISOString(),
        };
        await client.from('tournament_matches').update(patch).eq('id', nextMatchId);
      } else if (!nextMatchId && winnerTeamId) {
        await client
          .from('tournaments')
          .update({
            winner_team_id: winnerTeamId,
            status: 'COMPLETED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', tournamentId);
      }

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
    return;
  }

  // 2. 토너먼트 ID가 없는 경우 (index.ts 로직)
  if (req.method === 'GET') {
    const { data: list, error } = await client
      .from('tournaments')
      .select('*, winner_team:inhouse_custom_teams(id, name)')
      .order('created_at', { ascending: false });

    if (error) throw new HttpError(500, 'DATABASE_ERROR', '토너먼트 목록을 가져오지 못했습니다.');
    res.status(200).json({ tournaments: list || [] });
    return;
  }

  if (req.method === 'POST') {
    requireMethod(req, ['POST']);
    const body = bodyAsObject(req);
    const name = String(body.name ?? '').trim();
    if (!name) throw new HttpError(400, 'NAME_REQUIRED', '대회 이름을 입력해주세요.');

    const bracketSize = Number(body.bracketSize || 8);
    if (![4, 8, 16].includes(bracketSize)) {
      throw new HttpError(400, 'INVALID_BRACKET_SIZE', '토너먼트 규모는 4강, 8강, 16강 중 하나여야 합니다.');
    }

    const format = ['BO1', 'BO3', 'BO5'].includes(String(body.format)) ? String(body.format) : 'BO1';
    const seedingType = ['RANDOM', 'POWER_SEED', 'MANUAL'].includes(String(body.seedingType))
      ? String(body.seedingType)
      : 'POWER_SEED';

    let teamIds: string[] = Array.isArray(body.teamIds) ? body.teamIds : [];
    if (teamIds.length > bracketSize) {
      throw new HttpError(400, 'TOO_MANY_TEAMS', `최대 ${bracketSize}개 팀까지 참가할 수 있습니다. (현재 ${teamIds.length}개)`);
    }

    if (teamIds.length < 2) {
      throw new HttpError(400, 'TOO_FEW_TEAMS', '최소 2개 이상의 팀이 필요합니다.');
    }

    if (seedingType === 'RANDOM') {
      teamIds = [...teamIds].sort(() => Math.random() - 0.5);
    }

    const { data: tourney, error: tErr } = await client
      .from('tournaments')
      .insert({
        name,
        bracket_size: bracketSize,
        format,
        seeding_type: seedingType,
        status: 'READY',
        settings: {
          originalTeamIds: teamIds,
        },
      })
      .select()
      .single();

    if (tErr || !tourney) throw new HttpError(500, 'DATABASE_ERROR', '토너먼트를 생성하지 못했습니다.');

    const totalRounds = Math.log2(bracketSize);
    const round1Pairs = generateStandardSeeds(teamIds, bracketSize as 4 | 8 | 16);

    interface MatchNode {
      round: number;
      index: number;
      team1Id: string | null;
      team2Id: string | null;
      status: string;
      winnerId: string | null;
      nextSlot?: 'team1' | 'team2';
      nextIndex?: number;
      dbId?: string;
    }
    const matchGrid: MatchNode[][] = [];

    for (let r = 1; r <= totalRounds; r += 1) {
      const matchCountInRound = bracketSize / Math.pow(2, r);
      const row: MatchNode[] = [];
      for (let i = 0; i < matchCountInRound; i += 1) {
        if (r === 1) {
          const pair = round1Pairs[i];
          const t1 = pair?.team1Id ?? null;
          const t2 = pair?.team2Id ?? null;
          const isBye1 = Boolean(t1 && !t2);
          const isBye2 = Boolean(!t1 && t2);
          const winnerId = isBye1 ? t1 : isBye2 ? t2 : null;
          const status = winnerId ? 'BYE' : (t1 && t2) ? 'READY' : 'PENDING';

          row.push({
            round: r,
            index: i,
            team1Id: t1,
            team2Id: t2,
            status,
            winnerId,
            nextSlot: i % 2 === 0 ? 'team1' : 'team2',
            nextIndex: Math.floor(i / 2),
          });
        } else {
          row.push({
            round: r,
            index: i,
            team1Id: null,
            team2Id: null,
            status: 'PENDING',
            winnerId: null,
            nextSlot: r < totalRounds ? (i % 2 === 0 ? 'team1' : 'team2') : undefined,
            nextIndex: r < totalRounds ? Math.floor(i / 2) : undefined,
          });
        }
      }
      matchGrid.push(row);
    }

    const round1 = matchGrid[0];
    const round2 = matchGrid[1];
    if (round1 && round2) {
      for (let i = 0; i < round1.length; i += 1) {
        const m1 = round1[i];
        if (m1?.winnerId && m1.nextIndex !== undefined) {
          const nextMatch = round2[m1.nextIndex];
          if (nextMatch) {
            if (m1.nextSlot === 'team1') nextMatch.team1Id = m1.winnerId;
            else if (m1.nextSlot === 'team2') nextMatch.team2Id = m1.winnerId;
          }
        }
      }
    }

    for (let r = totalRounds; r >= 1; r -= 1) {
      const row = matchGrid[r - 1];
      if (!row) continue;
      for (const node of row) {
        let nextMatchId: string | null = null;
        const nextRoundRow = matchGrid[r];
        if (node.nextIndex !== undefined && nextRoundRow && nextRoundRow[node.nextIndex]) {
          nextMatchId = nextRoundRow[node.nextIndex]?.dbId || null;
        }

        const { data: insertedMatch, error: mErr } = await client
          .from('tournament_matches')
          .insert({
            tournament_id: tourney.id,
            round_number: node.round,
            match_index: node.index,
            team1_id: node.team1Id,
            team2_id: node.team2Id,
            winner_team_id: node.winnerId,
            status: node.status,
            next_match_id: nextMatchId,
            next_slot: node.nextSlot || null,
          })
          .select()
          .single();

        if (mErr || !insertedMatch) throw new HttpError(500, 'DATABASE_ERROR', '대진표 경기를 생성하지 못했습니다.');
        node.dbId = insertedMatch.id;
      }
    }

    res.status(201).json({ tournament: tourney });
    return;
  }

  throw new HttpError(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
});

import { db } from '../../server/lib/db.js';
import { handler, bodyAsObject, HttpError, requireMethod } from '../../server/lib/http.js';

interface SeedPair {
  team1Id: string | null;
  team2Id: string | null;
}

function generateStandardSeeds(teamIds: string[], size: 4 | 8 | 16): SeedPair[] {
  // 팀 수가 부족하면 나머지는 null (BYE)
  const padded: Array<string | null> = [...teamIds];
  while (padded.length < size) {
    padded.push(null);
  }

  if (size === 4) {
    // 1vs4, 2vs3
    return [
      { team1Id: padded[0] ?? null, team2Id: padded[3] ?? null },
      { team1Id: padded[1] ?? null, team2Id: padded[2] ?? null },
    ];
  }

  if (size === 8) {
    // 1vs8, 4vs5, 2vs7, 3vs6
    return [
      { team1Id: padded[0] ?? null, team2Id: padded[7] ?? null },
      { team1Id: padded[3] ?? null, team2Id: padded[4] ?? null },
      { team1Id: padded[1] ?? null, team2Id: padded[6] ?? null },
      { team1Id: padded[2] ?? null, team2Id: padded[5] ?? null },
    ];
  }

  // 16팀
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

    // 시드 방식별 팀 정렬
    if (seedingType === 'RANDOM') {
      // 셔플
      teamIds = [...teamIds].sort(() => Math.random() - 0.5);
    }
    // POWER_SEED의 경우 클라이언트에서 이미 전력 순으로 정렬해서 보냈거나 그대로 순서 유지

    // 1. 토너먼트 생성
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

    // 2. 브래킷 매치 노드들 생성
    // 총 라운드 수: 4강=2, 8강=3, 16강=4
    const totalRounds = Math.log2(bracketSize);
    const round1Pairs = generateStandardSeeds(teamIds, bracketSize as 4 | 8 | 16);

    // 라운드별 매치들을 임시 맵에 보관 (round, index) -> id
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

    // 구조 생성: Round 1부터 Final까지
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

    // 1라운드 부전승 승자 다음 라운드로 전파
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

    // DB에 라운드 마지막(결승)부터 역순으로 생성하여 next_match_id 연결
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

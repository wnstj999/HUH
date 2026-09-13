import { db } from '../../server/lib/db.js';
import { handler, bodyAsObject, HttpError, requireMethod } from '../../server/lib/http.js';
import { parseRiotId } from '../../src/lib/riotId.js';

export default handler(async (req, res) => {
  const client = db();

  if (req.method === 'GET') {
    // 팀 목록 및 소속 멤버 조회
    const { data: teams, error: tErr } = await client
      .from('inhouse_custom_teams')
      .select('*')
      .order('created_at', { ascending: false });
    if (tErr) throw new HttpError(500, 'DATABASE_ERROR', '팀 목록을 조회하지 못했습니다.');

    const { data: members, error: mErr } = await client
      .from('inhouse_team_members')
      .select('*, player:players(id, display_name, inhouse_tier, inhouse_score, current_solo_tier, current_solo_division, current_solo_lp, puuid)');
    if (mErr) throw new HttpError(500, 'DATABASE_ERROR', '팀원 목록을 조회하지 못했습니다.');

    // 팀별 멤버 조립
    const membersByTeam = new Map<string, Array<Record<string, unknown>>>();
    for (const m of members || []) {
      const list = membersByTeam.get(m.team_id) || [];
      list.push(m);
      membersByTeam.set(m.team_id, list);
    }

    const result = (teams || []).map((t) => ({
      ...t,
      members: membersByTeam.get(t.id) || [],
    }));

    res.status(200).json({ teams: result });
    return;
  }

  if (req.method === 'POST') {
    requireMethod(req, ['POST']);
    const body = bodyAsObject(req);
    const name = String(body.name ?? '').trim();
    if (!name) throw new HttpError(400, 'NAME_REQUIRED', '팀 이름을 입력하세요.');

    const members = Array.isArray(body.members) ? body.members : [];
    // members: Array<{ position: 'TOP'|'JUG'|'MID'|'ADC'|'SUP', riotId: string, playerName?: string, playerId?: string }>

    // 팀 생성
    const { data: newTeam, error: teamErr } = await client
      .from('inhouse_custom_teams')
      .insert({
        name,
        source: body.source === 'AUTO_BALANCED' ? 'AUTO_BALANCED' : 'MANUAL',
        notes: body.notes ? String(body.notes) : '',
      })
      .select()
      .single();

    if (teamErr || !newTeam) throw new HttpError(500, 'DATABASE_ERROR', '팀을 생성하지 못했습니다.');

    // 팀원 추가
    const insertRows = [];
    const seenPositions = new Set<string>();

    for (const m of members) {
      const pos = String(m.position).toUpperCase();
      if (!['TOP', 'JUG', 'MID', 'ADC', 'SUP'].includes(pos)) continue;
      if (seenPositions.has(pos)) continue; // 포지션 중복 방지
      seenPositions.add(pos);

      let pName = m.playerName ? String(m.playerName).trim() : '';
      const rId = m.riotId ? String(m.riotId).trim() : '';

      if (rId && !pName) {
        try {
          const parsed = parseRiotId(rId);
          pName = parsed.gameName;
        } catch {
          pName = rId;
        }
      }

      insertRows.push({
        team_id: newTeam.id,
        player_id: m.playerId || null,
        riot_id: rId || pName,
        player_name: pName || '선수',
        position: pos,
        is_captain: Boolean(m.isCaptain),
      });
    }

    if (insertRows.length > 0) {
      const { error: insertErr } = await client.from('inhouse_team_members').insert(insertRows);
      if (insertErr) throw new HttpError(500, 'DATABASE_ERROR', '팀원 정보를 저장하지 못했습니다.');
    }

    // 최종 팀 데이터 반환
    const { data: fullMembers } = await client
      .from('inhouse_team_members')
      .select('*, player:players(id, display_name, inhouse_tier, inhouse_score, current_solo_tier, current_solo_division, current_solo_lp, puuid)')
      .eq('team_id', newTeam.id);

    res.status(201).json({
      team: {
        ...newTeam,
        members: fullMembers || [],
      },
    });
    return;
  }

  throw new HttpError(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
});

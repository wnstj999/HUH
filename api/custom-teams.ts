import { db } from '../server/lib/db.js';
import { handler, bodyAsObject, HttpError, requireMethod } from '../server/lib/http.js';
import { parseRiotId } from '../src/lib/riotId.js';

export default handler(async (req, res) => {
  const client = db();
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

  // 1. 단일 팀 ID가 지정된 경우 ([id].ts 로직)
  if (id) {
    if (req.method === 'DELETE') {
      const { error } = await client.from('inhouse_custom_teams').delete().eq('id', id);
      if (error) throw new HttpError(500, 'DATABASE_ERROR', '팀을 삭제하지 못했습니다.');
      res.status(200).json({ success: true, id });
      return;
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = bodyAsObject(req);
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) updates.name = String(body.name).trim();
      if (body.notes !== undefined) updates.notes = String(body.notes).trim();

      const { data: updatedTeam, error: uErr } = await client
        .from('inhouse_custom_teams')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (uErr) throw new HttpError(500, 'DATABASE_ERROR', '팀 정보를 수정하지 못했습니다.');

      if (Array.isArray(body.members)) {
        await client.from('inhouse_team_members').delete().eq('team_id', id);
        const insertRows = [];
        const seenPositions = new Set<string>();

        for (const m of body.members) {
          const pos = String(m.position).toUpperCase();
          if (!['TOP', 'JUG', 'MID', 'ADC', 'SUP'].includes(pos)) continue;
          if (seenPositions.has(pos)) continue;
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
            team_id: id,
            player_id: m.playerId || null,
            riot_id: rId || pName,
            player_name: pName || '선수',
            position: pos,
            is_captain: Boolean(m.isCaptain),
          });
        }

        if (insertRows.length > 0) {
          await client.from('inhouse_team_members').insert(insertRows);
        }
      }

      const { data: fullMembers } = await client
        .from('inhouse_team_members')
        .select('*, player:players(id, display_name, inhouse_tier, inhouse_score, current_solo_tier, current_solo_division, current_solo_lp, puuid)')
        .eq('team_id', id);

      res.status(200).json({
        team: {
          ...updatedTeam,
          members: fullMembers || [],
        },
      });
      return;
    }

    requireMethod(req, ['GET', 'DELETE', 'PATCH', 'PUT']);
    return;
  }

  // 2. 팀 ID가 없는 경우 (index.ts 로직)
  if (req.method === 'GET') {
    const { data: teams, error: tErr } = await client
      .from('inhouse_custom_teams')
      .select('*')
      .order('created_at', { ascending: false });
    if (tErr) throw new HttpError(500, 'DATABASE_ERROR', '팀 목록을 조회하지 못했습니다.');

    const { data: members, error: mErr } = await client
      .from('inhouse_team_members')
      .select('*, player:players(id, display_name, inhouse_tier, inhouse_score, current_solo_tier, current_solo_division, current_solo_lp, puuid)');
    if (mErr) throw new HttpError(500, 'DATABASE_ERROR', '팀원 목록을 조회하지 못했습니다.');

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

    const insertRows = [];
    const seenPositions = new Set<string>();

    for (const m of members) {
      const pos = String(m.position).toUpperCase();
      if (!['TOP', 'JUG', 'MID', 'ADC', 'SUP'].includes(pos)) continue;
      if (seenPositions.has(pos)) continue;
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

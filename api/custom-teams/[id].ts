import { db } from '../../server/lib/db.js';
import { handler, bodyAsObject, HttpError, requireMethod } from '../../server/lib/http.js';
import { parseRiotId } from '../../src/lib/riotId.js';

export default handler(async (req, res) => {
  const client = db();
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

  if (!id) throw new HttpError(400, 'ID_REQUIRED', '팀 ID가 필요합니다.');

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

    // 팀원 수정이 제공된 경우
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
});

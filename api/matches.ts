import { assertDb, db } from '../server/lib/db.js';
import { bodyAsObject, handler, HttpError, requireMethod } from '../server/lib/http.js';
import { mapMatch } from '../server/lib/mappers.js';

const MATCH_SELECT = '*, inhouse_events(id,name), match_participants(*, players(id,display_name,inhouse_tier,inhouse_score))';

export default handler(async (req, res) => {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

  // 1. 단일 경기 ID가 지정된 경우 ([id].ts 로직)
  if (id) {
    requireMethod(req, ['PATCH']);
    const body = bodyAsObject(req);
    const patch: Record<string, unknown> = {};
    if ('status' in body) patch.status = body.status;
    if ('winnerTeam' in body) patch.winner_team = body.winnerTeam || null;
    if ('startedAt' in body) patch.started_at = body.startedAt || null;
    if ('endedAt' in body) patch.ended_at = body.endedAt || null;
    if ('durationSeconds' in body) patch.duration_seconds = body.durationSeconds ?? null;

    const client = db();
    assertDb(await client.from('inhouse_matches').update(patch).eq('id', id).select('id').single());

    if ('winnerTeam' in body) {
      const winner = body.winnerTeam;
      if (winner === 'BLUE' || winner === 'RED') {
        const participants = assertDb(await client.from('match_participants').select('id,team').eq('match_id', id));
        for (const participant of participants) {
          assertDb(await client.from('match_participants').update({ win: participant.team === winner }).eq('id', participant.id).select('id').single());
        }
      }
    }

    const row = assertDb(await client.from('inhouse_matches').select(MATCH_SELECT).eq('id', id).single());
    res.status(200).json({ match: mapMatch(row) });
    return;
  }

  // 2. 경기 ID가 없는 경우 (index.ts 로직)
  requireMethod(req, ['GET', 'POST']);
  const client = db();

  if (req.method === 'GET') {
    const rows = assertDb(await client.from('inhouse_matches').select(MATCH_SELECT).order('created_at', { ascending: false }));
    res.status(200).json({ matches: rows.map(mapMatch) });
    return;
  }

  const body = bodyAsObject(req);
  const eventName = String(body.eventName ?? '').trim();
  const assignments = Array.isArray(body.assignments) ? body.assignments : [];
  if (!eventName) throw new HttpError(400, 'EVENT_NAME_REQUIRED', '내전 이름을 입력하세요.');

  const matchId = assertDb(await client.rpc('create_inhouse_match', { p_event_name: eventName, p_assignments: assignments }));
  const row = assertDb(await client.from('inhouse_matches').select(MATCH_SELECT).eq('id', matchId).single());
  res.status(201).json({ match: mapMatch(row) });
});

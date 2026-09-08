import { assertDb, db } from '../../server/lib/db.js';
import { bodyAsObject, handler, HttpError, requireMethod } from '../../server/lib/http.js';
import { mapMatch } from '../../server/lib/mappers.js';

const MATCH_SELECT = '*, inhouse_events(id,name), match_participants(*, players(id,display_name,inhouse_tier,inhouse_score))';

export default handler(async (req, res) => {
  requireMethod(req, ['PATCH']);
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) throw new HttpError(400, 'ID_REQUIRED', '경기 ID가 필요합니다.');
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
});

import { assertDb, db } from '../../server/lib/db.js';
import { bodyAsObject, handler, HttpError, requireMethod } from '../../server/lib/http.js';
import { mapMatch } from '../../server/lib/mappers.js';

const MATCH_SELECT = '*, inhouse_events(id,name), match_participants(*, players(id,display_name,inhouse_tier,inhouse_score))';

export default handler(async (req, res) => {
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
